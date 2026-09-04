use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use tauri::image::Image;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

use crate::app_state::AppState;
use crate::logging::LogLevel;
use crate::MAIN_WINDOW_LABEL;

const TRAY_ID: &str = "main-tray";
pub(crate) const TRAY_PREVIEW_LABEL: &str = "tray-preview";
pub(crate) const QUICK_MENU_LABEL: &str = "quick-menu";

static HOVER_TOKEN: AtomicU64 = AtomicU64::new(0);
static PREVIEW_PINNED: AtomicBool = AtomicBool::new(false);
static LAST_HIDE_TIME: AtomicU64 = AtomicU64::new(0);

fn current_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(target_os = "windows")]
fn get_cursor_pos_physical() -> Option<(i32, i32)> {
    #[repr(C)]
    struct POINT {
        x: i32,
        y: i32,
    }
    #[link(name = "user32")]
    extern "system" {
        fn GetCursorPos(lpPoint: *mut POINT) -> i32;
    }
    let mut pt = POINT { x: 0, y: 0 };
    if unsafe { GetCursorPos(&mut pt) } != 0 {
        Some((pt.x, pt.y))
    } else {
        None
    }
}

#[cfg(not(target_os = "windows"))]
fn get_cursor_pos_physical() -> Option<(i32, i32)> {
    None
}

fn spawn_hover_monitor(app: AppHandle, icon_rect: tauri::Rect, session_id: u64) {
    tauri::async_runtime::spawn(async move {
        // 先等待 120ms 让窗口完成定位与呈现
        tokio::time::sleep(Duration::from_millis(120)).await;

        let mut outside_counter = 0;
        loop {
            tokio::time::sleep(Duration::from_millis(50)).await;

            // 如果已经点击锁定（Pinned）或开启了新的悬停会话，退出当前监控
            if PREVIEW_PINNED.load(Ordering::SeqCst) || HOVER_TOKEN.load(Ordering::SeqCst) != session_id {
                break;
            }

            let Some(window) = app.get_webview_window(TRAY_PREVIEW_LABEL) else {
                break;
            };

            if !window.is_visible().unwrap_or(false) {
                break;
            }

            let Some((cursor_x, cursor_y)) = get_cursor_pos_physical() else {
                break;
            };

            let win_pos = window.outer_position().unwrap_or_default();
            let win_size = window.outer_size().unwrap_or_default();
            let scale_factor = window.scale_factor().unwrap_or(1.0);

            // 给予适度容差缓冲区（20px），允许光标在托盘图标与概览卡片之间的间隙平滑移动
            let margin = (20.0 * scale_factor).round() as i32;
            let in_win = cursor_x >= win_pos.x - margin
                && cursor_x <= win_pos.x + win_size.width as i32 + margin
                && cursor_y >= win_pos.y - margin
                && cursor_y <= win_pos.y + win_size.height as i32 + margin;

            let (icon_x, icon_y, icon_w, icon_h) = match (icon_rect.position, icon_rect.size) {
                (tauri::Position::Physical(p), tauri::Size::Physical(s)) => {
                    (p.x, p.y, s.width as i32, s.height as i32)
                }
                (tauri::Position::Logical(p), tauri::Size::Logical(s)) => (
                    (p.x * scale_factor).round() as i32,
                    (p.y * scale_factor).round() as i32,
                    (s.width * scale_factor).round() as i32,
                    (s.height * scale_factor).round() as i32,
                ),
                _ => (0, 0, 0, 0),
            };
            let in_icon = cursor_x >= icon_x - margin
                && cursor_x <= icon_x + icon_w + margin
                && cursor_y >= icon_y - margin
                && cursor_y <= icon_y + icon_h + margin;

            if in_win || in_icon {
                outside_counter = 0;
            } else {
                outside_counter += 1;
                // 连续 2 次（约 100ms）确认光标既不在卡片也不在托盘上，立即收起
                if outside_counter >= 2 {
                    hide_tray_preview(&app);
                    break;
                }
            }
        }
    });
}

pub(crate) fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    if let Some(preview_win) = app.get_webview_window(TRAY_PREVIEW_LABEL) {
        let app_handle = app.clone();
        preview_win.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(false) = event {
                if PREVIEW_PINNED.load(Ordering::SeqCst) {
                    hide_tray_preview(&app_handle);
                }
            }
        });
    }

    if let Some(quick_menu_win) = app.get_webview_window(QUICK_MENU_LABEL) {
        let app_handle = app.clone();
        quick_menu_win.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(false) = event {
                if let Some(w) = app_handle.get_webview_window(QUICK_MENU_LABEL) {
                    let _ = w.hide();
                }
            }
        });
    }

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(load_app_icon()?)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            let app_handle = tray.app_handle().clone();
            match event {
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    rect,
                    ..
                } => {
                    HOVER_TOKEN.fetch_add(1, Ordering::SeqCst);
                    if let Some(w) = app_handle.get_webview_window(QUICK_MENU_LABEL) {
                        let _ = w.hide();
                    }
                    let now = current_time_ms();
                    let last_hide = LAST_HIDE_TIME.load(Ordering::SeqCst);

                    // 如果刚刚通过失焦 (blur) 收起了预览窗口（小于 300ms），说明这次点击本身是用户用来收起的点击，不再重新打开
                    if now.saturating_sub(last_hide) < 300 {
                        return;
                    }

                    let is_pinned = PREVIEW_PINNED.load(Ordering::SeqCst);
                    let is_visible = app_handle
                        .get_webview_window(TRAY_PREVIEW_LABEL)
                        .and_then(|w| w.is_visible().ok())
                        .unwrap_or(false);

                    if is_pinned && is_visible {
                        hide_tray_preview(&app_handle);
                    } else {
                        PREVIEW_PINNED.store(true, Ordering::SeqCst);
                        show_tray_preview_at_rect(&app_handle, rect);
                        if let Some(window) = app_handle.get_webview_window(TRAY_PREVIEW_LABEL) {
                            let _ = window.set_focus();
                        }
                        let _ = app_handle.emit("tray-preview:mode-changed", true);
                    }
                }
                TrayIconEvent::Click {
                    button: MouseButton::Right,
                    button_state: MouseButtonState::Up,
                    rect,
                    ..
                } => {
                    HOVER_TOKEN.fetch_add(1, Ordering::SeqCst);
                    hide_tray_preview(&app_handle);
                    let _ = app_handle.emit(
                        "quick-menu:action",
                        serde_json::json!({ "action": "sync-requested" }),
                    );
                    show_quick_menu_at_rect(&app_handle, rect);
                }
                TrayIconEvent::Enter { rect, .. } => {
                    if PREVIEW_PINNED.load(Ordering::SeqCst) {
                        return;
                    }
                    let is_menu_open = app_handle
                        .get_webview_window(QUICK_MENU_LABEL)
                        .and_then(|w| w.is_visible().ok())
                        .unwrap_or(false);
                    if is_menu_open {
                        return;
                    }
                    let session_id = HOVER_TOKEN.fetch_add(1, Ordering::SeqCst) + 1;
                    let app = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(Duration::from_millis(180)).await;
                        if HOVER_TOKEN.load(Ordering::SeqCst) == session_id
                            && !PREVIEW_PINNED.load(Ordering::SeqCst)
                        {
                            show_tray_preview_at_rect(&app, rect);
                            let _ = app.emit("tray-preview:mode-changed", false);
                            spawn_hover_monitor(app.clone(), rect, session_id);
                        }
                    });
                }
                TrayIconEvent::Leave { .. } => {
                    let is_visible = app_handle
                        .get_webview_window(TRAY_PREVIEW_LABEL)
                        .and_then(|w| w.is_visible().ok())
                        .unwrap_or(false);
                    if !is_visible {
                        HOVER_TOKEN.fetch_add(1, Ordering::SeqCst);
                    }
                }
                _ => {}
            }
        })
        .build(app)?;
    Ok(())
}

pub(crate) fn rebuild_tray_menu(_app: &AppHandle) -> tauri::Result<()> {
    Ok(())
}

pub(crate) fn show_quick_menu_at_rect(app: &AppHandle, rect: tauri::Rect) {
    let Some(window) = app.get_webview_window(QUICK_MENU_LABEL) else {
        return;
    };

    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
        width: 176.0,
        height: 186.0,
    }));
    let default_width = (176.0 * scale_factor) as u32;
    let default_height = (186.0 * scale_factor) as u32;
    let win_size = window.outer_size().unwrap_or(tauri::PhysicalSize {
        width: default_width,
        height: default_height,
    });

    let (icon_x, icon_y, icon_w, icon_h) = match (rect.position, rect.size) {
        (tauri::Position::Physical(p), tauri::Size::Physical(s)) => {
            (p.x as f64, p.y as f64, s.width as f64, s.height as f64)
        }
        (tauri::Position::Logical(p), tauri::Size::Logical(s)) => (
            p.x * scale_factor,
            p.y * scale_factor,
            s.width * scale_factor,
            s.height * scale_factor,
        ),
        _ => (0.0, 0.0, 0.0, 0.0),
    };

    let monitor = window.current_monitor().ok().flatten();
    let (work_x, work_y, work_w, work_h) = if let Some(m) = monitor {
        let pos = m.position();
        let size = m.size();
        (
            pos.x as f64,
            pos.y as f64,
            size.width as f64,
            size.height as f64,
        )
    } else {
        (0.0, 0.0, 1920.0 * scale_factor, 1080.0 * scale_factor)
    };

    let margin = 8.0 * scale_factor;
    let target_x = icon_x + (icon_w - win_size.width as f64) / 2.0;
    let min_x = work_x + margin;
    let max_x = (work_x + work_w - win_size.width as f64 - margin).max(min_x);
    let final_x = target_x.clamp(min_x, max_x);

    let final_y = if icon_y > work_y + work_h / 2.0 {
        icon_y - win_size.height as f64 - margin
    } else {
        icon_y + icon_h + margin
    };

    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
        x: final_x.round() as i32,
        y: final_y.round() as i32,
    }));
    let _ = window.show();
    let _ = window.set_focus();
}

pub(crate) fn set_always_on_top_authoritative(
    app: &AppHandle,
    window: &tauri::WebviewWindow,
    value: bool,
) -> tauri::Result<bool> {
    // 窗口属性是权威状态；托盘与事件只是投影，投影失败不能把已成功操作报告成失败。
    let _ = window.set_always_on_top(value);
    let state = app.state::<AppState>();
    state.always_on_top.store(value, Ordering::SeqCst);

    if let Err(error) = rebuild_tray_menu(app) {
        log_tray_error(app, "刷新托盘菜单失败", &error);
    }
    if let Err(error) = app.emit("window:always-on-top-changed", value) {
        log_tray_error(app, "发送置顶状态事件失败", &error);
    }
    Ok(value)
}

fn log_tray_error(app: &AppHandle, context: &str, error: &impl std::fmt::Display) {
    app.state::<AppState>().logger.write_best_effort(
        LogLevel::Error,
        "backend.tray",
        &format!("{context}：{error}"),
    );
}

pub(crate) fn load_app_icon() -> tauri::Result<Image<'static>> {
    // 托盘和开发期窗口图标复用同一份资源，避免打包图标与运行时图标不一致。
    Ok(Image::from_bytes(include_bytes!("../icons/icon.png"))?.to_owned())
}

pub(crate) fn update_tray_icon_image(
    app: &AppHandle,
    rgba: Vec<u8>,
    width: u32,
    height: u32,
) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let image = Image::new_owned(rgba, width, height);
        tray.set_icon(Some(image))?;
    }
    Ok(())
}

pub(crate) fn hide_tray_preview(app: &AppHandle) {
    PREVIEW_PINNED.store(false, Ordering::SeqCst);
    LAST_HIDE_TIME.store(current_time_ms(), Ordering::SeqCst);
    if let Some(window) = app.get_webview_window(TRAY_PREVIEW_LABEL) {
        let _ = window.hide();
    }
    let _ = app.emit("tray-preview:mode-changed", false);
}

pub(crate) fn show_tray_preview_at_rect(app: &AppHandle, rect: tauri::Rect) {
    let Some(window) = app.get_webview_window(TRAY_PREVIEW_LABEL) else {
        return;
    };

    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
        width: 260.0,
        height: 208.0,
    }));
    let default_width = (260.0 * scale_factor) as u32;
    let default_height = (208.0 * scale_factor) as u32;
    let win_size = window.outer_size().unwrap_or(tauri::PhysicalSize {
        width: default_width,
        height: default_height,
    });

    let (icon_x, icon_y, icon_w, icon_h) = match (rect.position, rect.size) {
        (tauri::Position::Physical(p), tauri::Size::Physical(s)) => {
            (p.x as f64, p.y as f64, s.width as f64, s.height as f64)
        }
        _ => (0.0, 0.0, 0.0, 0.0),
    };

    let monitor = window.current_monitor().ok().flatten();
    let (work_x, work_y, work_w, work_h) = if let Some(m) = monitor {
        let pos = m.position();
        let size = m.size();
        (
            pos.x as f64,
            pos.y as f64,
            size.width as f64,
            size.height as f64,
        )
    } else {
        (0.0, 0.0, 1920.0 * scale_factor, 1080.0 * scale_factor)
    };

    let margin = 8.0 * scale_factor;
    let target_x = icon_x + (icon_w - win_size.width as f64) / 2.0;
    let min_x = work_x + margin;
    let max_x = (work_x + work_w - win_size.width as f64 - margin).max(min_x);
    let final_x = target_x.clamp(min_x, max_x);

    let final_y = if icon_y > work_y + work_h / 2.0 {
        // 任务栏位于底部，预览窗口显示在托盘图标上方
        icon_y - win_size.height as f64 - margin
    } else {
        // 任务栏位于顶部，预览窗口显示在托盘图标下方
        icon_y + icon_h + margin
    };

    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
        x: final_x.round() as i32,
        y: final_y.round() as i32,
    }));
    let _ = window.set_shadow(false);
    let _ = window.set_always_on_top(true);
    let _ = window.show();
    let _ = app.emit("tray:preview-shown", ());
}
