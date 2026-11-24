use std::{
    sync::Mutex,
    time::{Duration, Instant},
};

use objc2_app_kit::NSCellImagePosition;
use objc2_foundation::MainThreadMarker;
use tauri::{
    tray::MouseButtonState,
    window::{Effect, EffectState, EffectsBuilder},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Position, Size, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

const POPUP_LABEL: &str = "taskbar-popup";
const POPUP_WIDTH: f64 = 400.0;
const POPUP_HEIGHT: f64 = 360.0;
const MAX_POPUP_HEIGHT: f64 = 900.0;
const POPUP_GAP: f64 = 6.0;
const EDGE_MARGIN: f64 = 8.0;
const REOPEN_SUPPRESSION: Duration = Duration::from_millis(350);
const MAIN_CORNER_RADIUS: f64 = 20.0;
const POPUP_CORNER_RADIUS: f64 = 16.0;

#[derive(Clone, Copy, Debug, PartialEq)]
struct LogicalRect {
    left: f64,
    top: f64,
    width: f64,
    height: f64,
}

#[derive(Default)]
struct PopoverState {
    open: bool,
    anchor: Option<tauri::Rect>,
    width: Option<f64>,
    height: Option<f64>,
    suppress_next_up: bool,
    last_blur_closed_at: Option<Instant>,
}

#[derive(Default)]
pub(crate) struct MenubarState(Mutex<PopoverState>);

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn clamp_popup_width(width: Option<f64>) -> f64 {
    width
        .filter(|w| w.is_finite() && *w > 0.0)
        .unwrap_or(POPUP_WIDTH)
        .clamp(240.0, 640.0)
}

fn clamp_popup_height(height: Option<f64>) -> f64 {
    height
        .filter(|h| h.is_finite() && *h > 0.0)
        .unwrap_or(POPUP_HEIGHT)
        .clamp(60.0, MAX_POPUP_HEIGHT)
}

fn compute_popup_bounds(
    anchor: LogicalRect,
    work_area: LogicalRect,
    logical_w: f64,
    logical_h: f64,
) -> (f64, f64, f64, f64) {
    let max_w = (work_area.width - EDGE_MARGIN * 2.0).max(160.0);
    let width = logical_w.min(max_w);
    let anchor_bottom = (anchor.top + anchor.height).max(work_area.top);
    let y = anchor_bottom + POPUP_GAP;
    let work_bottom = work_area.top + work_area.height;
    let avail_h = (work_bottom - y - EDGE_MARGIN).max(60.0);
    let height = logical_h.min(avail_h);
    let centered_x = anchor.left + (anchor.width - width) / 2.0;
    let min_x = work_area.left + EDGE_MARGIN;
    let max_x = (work_area.left + work_area.width - EDGE_MARGIN - width).max(min_x);
    let x = centered_x.clamp(min_x, max_x);
    (x.round(), y.round(), width.round(), height.round())
}

fn should_suppress_reopen(last_blur_closed_at: Option<Instant>, now: Instant) -> bool {
    last_blur_closed_at.is_some_and(|at| now.saturating_duration_since(at) < REOPEN_SUPPRESSION)
}

fn monitor_to_logical(monitor: &tauri::Monitor) -> (LogicalRect, LogicalRect) {
    let scale = monitor.scale_factor();
    let pos = monitor.position().to_logical::<f64>(scale);
    let size = monitor.size().to_logical::<f64>(scale);
    let work = monitor.work_area();
    let work_pos = work.position.to_logical::<f64>(scale);
    let work_size = work.size.to_logical::<f64>(scale);
    (
        LogicalRect {
            left: pos.x,
            top: pos.y,
            width: size.width,
            height: size.height,
        },
        LogicalRect {
            left: work_pos.x,
            top: work_pos.y,
            width: work_size.width,
            height: work_size.height,
        },
    )
}

fn resolve_anchor_and_work_area(
    app: &AppHandle,
    popup: &WebviewWindow,
    anchor: Option<tauri::Rect>,
) -> (LogicalRect, LogicalRect) {
    let anchor = anchor.or_else(|| {
        app.tray_by_id("quota")
            .and_then(|tray| tray.rect().ok().flatten())
    });
    if let (Some(rect), Ok(monitors)) = (&anchor, popup.available_monitors()) {
        for monitor in monitors {
            let scale = monitor.scale_factor();
            let (bounds, work_area) = monitor_to_logical(&monitor);
            let a_pos = rect.position.to_logical::<f64>(scale);
            let a_size = rect.size.to_logical::<f64>(scale);
            let cx = a_pos.x + a_size.width / 2.0;
            let cy = a_pos.y + a_size.height / 2.0;
            if cx >= bounds.left
                && cx <= bounds.left + bounds.width
                && cy >= bounds.top
                && cy <= bounds.top + bounds.height
            {
                return (
                    LogicalRect {
                        left: a_pos.x,
                        top: a_pos.y,
                        width: a_size.width,
                        height: a_size.height,
                    },
                    work_area,
                );
            }
        }
    }
    let fallback_monitor = popup
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| popup.current_monitor().ok().flatten());
    if let Some(monitor) = fallback_monitor {
        let scale = monitor.scale_factor();
        let (bounds, work_area) = monitor_to_logical(&monitor);
        let fallback_anchor = anchor.map_or_else(
            || LogicalRect {
                left: bounds.left + (bounds.width - 120.0).max(0.0),
                top: bounds.top,
                width: 28.0,
                height: (work_area.top - bounds.top).max(24.0),
            },
            |rect| {
                let a_pos = rect.position.to_logical::<f64>(scale);
                let a_size = rect.size.to_logical::<f64>(scale);
                LogicalRect {
                    left: a_pos.x,
                    top: a_pos.y,
                    width: a_size.width,
                    height: a_size.height,
                }
            },
        );
        return (fallback_anchor, work_area);
    }
    (
        LogicalRect {
            left: 1320.0,
            top: 0.0,
            width: 28.0,
            height: 25.0,
        },
        LogicalRect {
            left: 0.0,
            top: 25.0,
            width: 1440.0,
            height: 875.0,
        },
    )
}

fn clear_popup_state(state: &mut PopoverState) {
    state.open = false;
    state.width = None;
    state.height = None;
}

fn hide_popup_window(app: &AppHandle) -> Result<(), String> {
    if let Some(popup) = app.get_webview_window(POPUP_LABEL) {
        popup.hide().map_err(error)?;
    }
    Ok(())
}

pub(crate) fn configure_main_window(window: &WebviewWindow) {
    let _ = window.set_effects(
        EffectsBuilder::new()
            .effect(Effect::HudWindow)
            .state(EffectState::Active)
            .radius(MAIN_CORNER_RADIUS)
            .build(),
    );
    let _ = window.set_shadow(true);
}

pub(crate) fn setup(app: &AppHandle) -> Result<(), String> {
    app.manage(MenubarState::default());
    app.set_theme(Some(tauri::Theme::Dark));
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    let popup = WebviewWindowBuilder::new(
        app,
        POPUP_LABEL,
        WebviewUrl::App("taskbar.html?popup&platform=macos".into()),
    )
    .title("Codex 菜单栏额度")
    .inner_size(POPUP_WIDTH, POPUP_HEIGHT)
    .decorations(false)
    .transparent(true)
    .shadow(true)
    .always_on_top(true)
    .resizable(false)
    .skip_taskbar(true)
    .visible(false)
    .focused(false)
    .build()
    .map_err(error)?;
    let _ = popup.set_effects(
        EffectsBuilder::new()
            .effect(Effect::Popover)
            .state(EffectState::Active)
            .radius(POPUP_CORNER_RADIUS)
            .build(),
    );
    let _ = popup.set_shadow(true);
    let _ = popup.set_visible_on_all_workspaces(true);
    Ok(())
}

pub(crate) fn handle_tray_click(
    app: &AppHandle,
    button_state: MouseButtonState,
    rect: tauri::Rect,
) {
    let state = app.state::<MenubarState>();
    match button_state {
        MouseButtonState::Down => {
            let closed = {
                let mut popover = state.0.lock().unwrap();
                if popover.open {
                    clear_popup_state(&mut popover);
                    popover.suppress_next_up = true;
                    popover.last_blur_closed_at = None;
                    true
                } else {
                    popover.suppress_next_up = false;
                    popover.anchor = Some(rect);
                    false
                }
            };
            if closed {
                let _ = hide_popup_window(app);
                let _ = app.emit_to(POPUP_LABEL, "taskbar:popup-close", ());
            }
        }
        MouseButtonState::Up => {
            let should_toggle = {
                let mut popover = state.0.lock().unwrap();
                if popover.suppress_next_up {
                    popover.suppress_next_up = false;
                    false
                } else if should_suppress_reopen(popover.last_blur_closed_at, Instant::now()) {
                    popover.last_blur_closed_at = None;
                    false
                } else {
                    popover.anchor = Some(rect);
                    true
                }
            };
            if should_toggle {
                let _ = app.emit_to(
                    POPUP_LABEL,
                    "taskbar:popup-toggle",
                    serde_json::json!({ "kind": "sources" }),
                );
            }
        }
    }
}

pub(crate) fn close_popup_if_open(app: &AppHandle) {
    let state = app.state::<MenubarState>();
    let was_open = {
        let mut popover = state.0.lock().unwrap();
        if popover.open {
            clear_popup_state(&mut popover);
            true
        } else {
            false
        }
    };
    if was_open {
        let _ = hide_popup_window(app);
        let _ = app.emit_to(POPUP_LABEL, "taskbar:popup-close", ());
    }
}

pub(crate) fn set_menubar_title(app: &AppHandle, title: &str) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("quota") {
        let _ = tray.with_inner_tray_icon(|inner| {
            if let (Some(item), Some(mtm)) = (inner.ns_status_item(), MainThreadMarker::new()) {
                if let Some(button) = item.button(mtm) {
                    button.setImagePosition(NSCellImagePosition::ImageRight);
                }
            }
        });
        // tray-icon 0.23.1 的 set_title(None) 不会清空已有标题，必须传 Some("")。
        let formatted = if title.is_empty() {
            String::new()
        } else {
            format!("{title} ")
        };
        tray.set_title(Some(formatted)).map_err(error)?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn set_taskbar_enabled(_enabled: bool) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub(crate) async fn taskbar_popup(
    app: AppHandle,
    open: bool,
    height: Option<f64>,
    width: Option<f64>,
) -> Result<(), String> {
    let state = app.state::<MenubarState>();
    if !open {
        {
            let mut popover = state.0.lock().map_err(error)?;
            clear_popup_state(&mut popover);
        }
        return hide_popup_window(&app);
    }
    let popup = app
        .get_webview_window(POPUP_LABEL)
        .ok_or("菜单栏弹窗不存在")?;
    let next_width = clamp_popup_width(width);
    let next_height = clamp_popup_height(height);
    let (was_open, anchor) = {
        let mut popover = state.0.lock().map_err(error)?;
        let was_open = popover.open;
        popover.open = true;
        popover.width = Some(next_width);
        popover.height = Some(next_height);
        popover.last_blur_closed_at = None;
        (was_open, popover.anchor)
    };
    let (anchor_rect, work_area) = resolve_anchor_and_work_area(&app, &popup, anchor);
    let (x, y, w, h) = compute_popup_bounds(anchor_rect, work_area, next_width, next_height);
    popup
        .set_size(Size::Logical(LogicalSize::new(w, h)))
        .map_err(error)?;
    popup
        .set_position(Position::Logical(LogicalPosition::new(x, y)))
        .map_err(error)?;
    if !was_open || !popup.is_visible().map_err(error)? {
        popup.show().map_err(error)?;
        popup.set_focus().map_err(error)?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn taskbar_popup_blur_close(app: AppHandle) -> Result<bool, String> {
    let Some(popup) = app.get_webview_window(POPUP_LABEL) else {
        let state = app.state::<MenubarState>();
        let mut popover = state.0.lock().map_err(error)?;
        clear_popup_state(&mut popover);
        return Ok(false);
    };
    if popup.is_focused().unwrap_or(false) {
        return Ok(false);
    }
    let state = app.state::<MenubarState>();
    {
        let mut popover = state.0.lock().map_err(error)?;
        if !popover.open {
            return Ok(false);
        }
        clear_popup_state(&mut popover);
        popover.last_blur_closed_at = Some(Instant::now());
    }
    popup.hide().map_err(error)?;
    Ok(true)
}

#[tauri::command]
pub(crate) async fn taskbar_redock() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub(crate) async fn taskbar_drag(_x: f64, _y: f64) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 居中停靠在菜单栏图标下方并保持6px间距() {
        let anchor = LogicalRect {
            left: 1000.0,
            top: 0.0,
            width: 28.0,
            height: 24.0,
        };
        let work_area = LogicalRect {
            left: 0.0,
            top: 25.0,
            width: 1440.0,
            height: 875.0,
        };
        assert_eq!(
            compute_popup_bounds(anchor, work_area, 400.0, 320.0),
            (814.0, 31.0, 400.0, 320.0)
        );
    }

    #[test]
    fn 靠右或靠左菜单栏图标会限制在屏幕安全边距内() {
        let work_area = LogicalRect {
            left: 0.0,
            top: 25.0,
            width: 1440.0,
            height: 875.0,
        };
        let right_anchor = LogicalRect {
            left: 1400.0,
            top: 0.0,
            width: 28.0,
            height: 25.0,
        };
        assert_eq!(
            compute_popup_bounds(right_anchor, work_area, 400.0, 300.0),
            (1032.0, 31.0, 400.0, 300.0)
        );

        let left_anchor = LogicalRect {
            left: 20.0,
            top: 0.0,
            width: 28.0,
            height: 25.0,
        };
        assert_eq!(
            compute_popup_bounds(left_anchor, work_area, 400.0, 300.0),
            (8.0, 31.0, 400.0, 300.0)
        );
    }

    #[test]
    fn 弹窗高度超出屏幕可用高度时会自动截断() {
        let anchor = LogicalRect {
            left: 800.0,
            top: 0.0,
            width: 28.0,
            height: 25.0,
        };
        let work_area = LogicalRect {
            left: 0.0,
            top: 25.0,
            width: 1280.0,
            height: 500.0,
        };
        // work_bottom = 525, y = 31, avail_h = 525 - 31 - 8 = 486
        assert_eq!(
            compute_popup_bounds(anchor, work_area, 400.0, 700.0),
            (614.0, 31.0, 400.0, 486.0)
        );
    }

    #[test]
    fn 失焦关闭后350ms内再次点击图标不重开弹窗() {
        let now = Instant::now();
        assert!(!should_suppress_reopen(None, now));
        assert!(should_suppress_reopen(
            Some(now - Duration::from_millis(120)),
            now
        ));
        assert!(!should_suppress_reopen(
            Some(now - Duration::from_millis(350)),
            now
        ));
    }
}
