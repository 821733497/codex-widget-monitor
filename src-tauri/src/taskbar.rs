use std::sync::Mutex;

use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
};
use windows::core::BOOL;
use windows::Win32::Foundation::{
    GetLastError, SetLastError, HWND, LPARAM, POINT, RECT, WIN32_ERROR,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, TreeScope_Descendants,
    UIA_ButtonControlTypeId, UIA_ListItemControlTypeId, UIA_MenuItemControlTypeId,
};
use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
use windows::Win32::UI::WindowsAndMessaging::*;

const LABEL: &str = "taskbar";
const PREVIEW: &str = "taskbar-snap";
const WIDTH: f64 = 380.0;
const HEIGHT: f64 = 40.0;
const POPUP_HEIGHT: f64 = 380.0;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct Rect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}
impl From<RECT> for Rect {
    fn from(r: RECT) -> Self {
        Self {
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
        }
    }
}

#[derive(Clone, Copy)]
struct Slot {
    owner: isize,
    rect: Rect,
}

#[derive(Default)]
struct Placement {
    enabled: bool,
    docked: bool,
    popup: bool,
    dragging: bool,
    slots: Vec<Slot>,
    position: Option<(i32, i32)>,
    owner: isize,
    waiting_for_space: bool,
}

#[derive(Default)]
pub(crate) struct TaskbarState(Mutex<Placement>);

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn hwnd(window: &tauri::WebviewWindow) -> Result<HWND, String> {
    Ok(HWND(window.hwnd().map_err(error)?.0))
}

fn notify(app: &AppHandle, docked: bool, snap: bool, message: &str) {
    let _ = app.emit_to(
        LABEL,
        "taskbar:placement",
        serde_json::json!({ "docked": docked, "snap": snap, "message": message }),
    );
}

fn free_intervals(area: Rect, occupied: &[Rect], padding: i32) -> Vec<Rect> {
    let mut blocked: Vec<_> = occupied
        .iter()
        .filter(|r| {
            r.bottom > area.top && r.top < area.bottom && r.right > area.left && r.left < area.right
        })
        .map(|r| {
            (
                r.left.saturating_sub(padding).max(area.left),
                r.right.saturating_add(padding).min(area.right),
            )
        })
        .collect();
    blocked.sort_unstable();
    let mut left = area.left.saturating_add(padding);
    let mut gaps = Vec::new();
    for (start, end) in blocked {
        if start > left {
            gaps.push(Rect {
                left,
                right: start,
                ..area
            });
        }
        left = left.max(end);
    }
    if left < area.right - padding {
        gaps.push(Rect {
            left,
            right: area.right - padding,
            ..area
        });
    }
    gaps
}

unsafe fn class_name(window: HWND) -> String {
    let mut buffer = [0; 128];
    let count = GetClassNameW(window, &mut buffer);
    String::from_utf16_lossy(&buffer[..count.max(0) as usize])
}

unsafe extern "system" fn collect_taskbars(window: HWND, data: LPARAM) -> BOOL {
    if matches!(
        class_name(window).as_str(),
        "Shell_TrayWnd" | "Shell_SecondaryTrayWnd"
    ) {
        let handles = &mut *(data.0 as *mut Vec<isize>);
        handles.push(window.0 as isize);
    }
    BOOL(1)
}

unsafe extern "system" fn collect_native_obstacles(window: HWND, data: LPARAM) -> BOOL {
    if IsWindowVisible(window).as_bool()
        && matches!(
            class_name(window).as_str(),
            "TrayNotifyWnd" | "Start" | "TrayClockWClass" | "TrayShowDesktopButtonWClass"
        )
    {
        let mut rect = RECT::default();
        if GetWindowRect(window, &mut rect).is_ok() {
            (&mut *(data.0 as *mut Vec<Rect>)).push(rect.into());
        }
    }
    BOOL(1)
}

struct OwnedWindows {
    owner: HWND,
    exclude: Vec<isize>,
    rectangles: Vec<Rect>,
}
unsafe extern "system" fn collect_owned_obstacles(window: HWND, data: LPARAM) -> BOOL {
    let data = &mut *(data.0 as *mut OwnedWindows);
    if !data.exclude.contains(&(window.0 as isize))
        && IsWindowVisible(window).as_bool()
        && GetWindow(window, GW_OWNER).ok() == Some(data.owner)
    {
        let mut rect = RECT::default();
        if GetWindowRect(window, &mut rect).is_ok() {
            data.rectangles.push(rect.into());
        }
    }
    BOOL(1)
}

fn belongs_to_widget(
    automation: &IUIAutomation,
    item: &IUIAutomationElement,
    exclude: &[isize],
) -> Result<bool, String> {
    unsafe {
        let walker = automation.RawViewWalker().map_err(error)?;
        let mut current = item.clone();
        // WebView2 的控件可能属于渲染子进程，不能只按宿主 PID 排除自己。
        for _ in 0..32 {
            let handle = current.CurrentNativeWindowHandle().map_err(error)?;
            if !handle.is_invalid() {
                let root = GetAncestor(handle, GA_ROOT);
                if exclude.contains(&(handle.0 as isize)) || exclude.contains(&(root.0 as isize)) {
                    return Ok(true);
                }
            }
            let Ok(parent) = walker.GetParentElement(&current) else {
                break;
            };
            current = parent;
        }
        Ok(false)
    }
}

fn discover_slots(automation: &IUIAutomation, exclude: &[isize]) -> Result<Vec<Slot>, String> {
    unsafe {
        let mut taskbars: Vec<isize> = Vec::new();
        EnumWindows(
            Some(collect_taskbars),
            LPARAM(&mut taskbars as *mut _ as isize),
        )
        .map_err(error)?;
        let mut slots = Vec::new();
        for owner in taskbars {
            let handle = HWND(owner as *mut _);
            let mut raw = RECT::default();
            if !IsWindowVisible(handle).as_bool() || GetWindowRect(handle, &mut raw).is_err() {
                continue;
            }
            let area = Rect::from(raw);
            // 当前三栏为横向布局；竖任务栏不强行覆盖，保持自由悬浮。
            if area.right - area.left < area.bottom - area.top {
                continue;
            }
            let element = automation.ElementFromHandle(handle).map_err(error)?;
            let elements = element
                .FindAll(
                    TreeScope_Descendants,
                    &automation.CreateTrueCondition().map_err(error)?,
                )
                .map_err(error)?;
            let mut occupied = Vec::new();
            let mut buttons = 0;
            for index in 0..elements.Length().map_err(error)? {
                let item = elements.GetElement(index).map_err(error)?;
                if item.CurrentProcessId().map_err(error)? == std::process::id() as i32 {
                    continue;
                }
                let kind = item.CurrentControlType().map_err(error)?;
                if [
                    UIA_ButtonControlTypeId,
                    UIA_ListItemControlTypeId,
                    UIA_MenuItemControlTypeId,
                ]
                .contains(&kind)
                {
                    if belongs_to_widget(automation, &item, exclude)? {
                        continue;
                    }
                    if item.CurrentIsOffscreen().map_err(error)?.as_bool() {
                        continue;
                    }
                    let rect = Rect::from(item.CurrentBoundingRectangle().map_err(error)?);
                    if rect.right > rect.left && rect.bottom > rect.top {
                        occupied.push(rect);
                        buttons += 1;
                    }
                }
            }
            // 无法读取应用按钮时不能把整条任务栏误判为空白。
            if buttons == 0 {
                continue;
            }
            let _ = EnumChildWindows(
                Some(handle),
                Some(collect_native_obstacles),
                LPARAM(&mut occupied as *mut _ as isize),
            );
            let mut other = OwnedWindows {
                owner: handle,
                exclude: exclude.to_vec(),
                rectangles: Vec::new(),
            };
            let _ = EnumWindows(
                Some(collect_owned_obstacles),
                LPARAM(&mut other as *mut _ as isize),
            );
            occupied.extend(other.rectangles);
            slots.extend(
                free_intervals(area, &occupied, 6)
                    .into_iter()
                    .map(|rect| Slot { owner, rect }),
            );
        }
        Ok(slots)
    }
}

fn choose_slot(
    slots: &[Slot],
    width: i32,
    height: i32,
    position: Option<(i32, i32)>,
) -> Option<(Slot, i32, i32)> {
    slots
        .iter()
        .filter(|s| s.rect.right - s.rect.left >= width && s.rect.bottom - s.rect.top >= height)
        .map(|s| {
            let (px, py) = position.unwrap_or((s.rect.right - width, s.rect.top));
            let x = px.clamp(s.rect.left, s.rect.right - width);
            let y = s.rect.top + (s.rect.bottom - s.rect.top - height) / 2;
            let distance = i64::from(x - px).abs() + i64::from(y - py).abs() * 4;
            (*s, x, y, distance)
        })
        .min_by_key(|(_, _, _, distance)| *distance)
        .map(|(s, x, y, _)| (s, x, y))
}

fn apply_position(
    window: &tauri::WebviewWindow,
    position: (i32, i32),
    height: u32,
) -> Result<(), String> {
    let scale = window.scale_factor().map_err(error)?;
    let width = (WIDTH * scale).round() as u32;
    let current = window.outer_size().map_err(error)?;
    if current.width != width || current.height != height {
        window
            .set_size(PhysicalSize::new(width, height))
            .map_err(error)?;
    }
    let current = window.outer_position().map_err(error)?;
    if (current.x, current.y) != position {
        window
            .set_position(PhysicalPosition::new(position.0, position.1))
            .map_err(error)?;
    }
    Ok(())
}

fn attach(window: &tauri::WebviewWindow, owner: isize) -> Result<(), String> {
    let handle = hwnd(window)?;
    unsafe {
        let current_owner = GetWindow(handle, GW_OWNER)
            .map(|value| value.0 as isize)
            .unwrap_or_default();
        if current_owner != owner {
            SetLastError(WIN32_ERROR(0));
            let previous = SetWindowLongPtrW(handle, GWLP_HWNDPARENT, owner);
            let status = GetLastError();
            let actual_owner = GetWindow(handle, GW_OWNER)
                .map(|value| value.0 as isize)
                .unwrap_or_default();
            if previous == 0 && status.0 != 0 && actual_owner != owner {
                return Err(format!("更新任务栏关联失败（Windows 错误 {}）", status.0));
            }
        }
        SetWindowPos(
            handle,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        )
        .map_err(|error| format!("更新任务栏窗口层级失败：{error}"))?;
    }
    Ok(())
}

fn is_shell_surface_class(class: &str) -> bool {
    matches!(
        class,
        "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd"
    )
}

fn covered_by_fullscreen(owner: isize) -> bool {
    unsafe {
        let foreground = GetForegroundWindow();
        // 右键副屏任务栏时，Windows 会把副屏任务栏置为前台窗口。
        // 它的矩形只覆盖任务栏自身，不能按全屏窗口处理，否则组件会被隐藏。
        if foreground.is_invalid() || is_shell_surface_class(class_name(foreground).as_str()) {
            return false;
        }
        let mut pid = 0;
        GetWindowThreadProcessId(foreground, Some(&mut pid));
        if pid == std::process::id() {
            return false;
        }
        let mut front = RECT::default();
        let mut bar = RECT::default();
        GetWindowRect(foreground, &mut front).is_ok()
            && GetWindowRect(HWND(owner as *mut _), &mut bar).is_ok()
            && front.left <= bar.left
            && front.right >= bar.right
            && front.top <= bar.top
            && front.bottom >= bar.bottom
    }
}

fn dock(app: &AppHandle, state: &mut Placement) -> Result<bool, String> {
    let window = app.get_webview_window(LABEL).ok_or("任务栏窗口不存在")?;
    let scale = window.scale_factor().map_err(error)?;
    let width = (WIDTH * scale).round() as i32;
    let height = (HEIGHT * scale).round() as i32;
    let Some((slot, x, y)) = choose_slot(&state.slots, width, height, state.position) else {
        return Ok(false);
    };
    let expanded = if state.popup {
        (POPUP_HEIGHT * scale).round() as i32
    } else {
        height
    };
    let changed = !state.docked || state.owner != slot.owner || state.position != Some((x, y));
    if !state.docked || state.owner != slot.owner {
        // 任务栏自身位于 topmost 层；仅设置 owner 仍可能让鼠标落到下方的任务列表。
        window.set_always_on_top(true).map_err(error)?;
        attach(&window, slot.owner)?;
    }
    apply_position(&window, (x, y - expanded + height), expanded as u32)?;
    state.position = Some((x, y));
    state.docked = true;
    state.owner = slot.owner;
    state.waiting_for_space = false;
    if !window.is_visible().map_err(error)? {
        window.show().map_err(error)?;
    }
    if changed {
        notify(app, true, false, "拖出自由悬浮，靠近任务栏松手吸附");
    }
    Ok(true)
}

fn float(app: &AppHandle, state: &mut Placement, move_above: bool) -> Result<(), String> {
    let window = app.get_webview_window(LABEL).ok_or("任务栏窗口不存在")?;
    attach(&window, 0)?;
    window.set_always_on_top(true).map_err(error)?;
    state.docked = false;
    state.owner = 0;
    let scale = window.scale_factor().map_err(error)?;
    let height = (HEIGHT * scale).round() as i32;
    let mut position = state.position.unwrap_or((100, 100));
    if move_above {
        if let Some(monitor) = window.current_monitor().map_err(error)? {
            let area = monitor.work_area();
            position.0 = position.0.clamp(
                area.position.x,
                (area.position.x + area.size.width as i32 - (WIDTH * scale) as i32)
                    .max(area.position.x),
            );
            position.1 = area.position.y + area.size.height as i32 - height - 12;
        }
    }
    state.position = Some(position);
    let expanded = if state.popup {
        (POPUP_HEIGHT * scale).round() as i32
    } else {
        height
    };
    apply_position(
        &window,
        (position.0, position.1 - expanded + height),
        expanded as u32,
    )?;
    window.show().map_err(error)?;
    notify(
        app,
        false,
        false,
        "自由悬浮；拖回任务栏空白处吸附，或双击抓手重新吸附",
    );
    Ok(())
}

pub(crate) fn setup(app: &AppHandle) -> Result<(), String> {
    app.manage(TaskbarState::default());
    for (label, url) in [(LABEL, "taskbar.html"), (PREVIEW, "taskbar.html?preview")] {
        let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
            .title(if label == LABEL {
                "Codex 任务栏额度"
            } else {
                "Codex 任务栏吸附预览"
            })
            .inner_size(WIDTH, HEIGHT)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .resizable(false)
            .skip_taskbar(true)
            .visible(false)
            .focused(false)
            .build()
            .map_err(error)?;
        if label == PREVIEW {
            window.set_ignore_cursor_events(true).map_err(error)?;
        }
    }
    let app = app.clone();
    std::thread::spawn(move || unsafe {
        if CoInitializeEx(None, COINIT_MULTITHREADED).is_err() {
            return;
        }
        let automation =
            CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_INPROC_SERVER);
        if let Ok(automation) = automation {
            loop {
                if let Err(message) = maintain(&app, &automation) {
                    app.state::<crate::app_state::AppState>()
                        .logger
                        .write_best_effort(
                            crate::logging::LogLevel::Warn,
                            "backend.taskbar",
                            &message,
                        );
                }
                std::thread::sleep(std::time::Duration::from_millis(750));
            }
        }
        CoUninitialize();
    });
    Ok(())
}

fn maintain(app: &AppHandle, automation: &IUIAutomation) -> Result<(), String> {
    let state = app.state::<TaskbarState>();
    {
        let placement = state.0.lock().map_err(error)?;
        if placement.enabled
            && placement.docked
            && !placement.dragging
            && !placement.popup
            && covered_by_fullscreen(placement.owner)
        {
            if let Some(window) = app.get_webview_window(LABEL) {
                window.hide().map_err(error)?;
            }
            return Ok(());
        }
    }
    // UI Automation 可能等待 Explorer；扫描期间不持锁，避免拖动卡住。
    let mut exclude = Vec::new();
    for label in [LABEL, PREVIEW] {
        if let Some(window) = app.get_webview_window(label) {
            exclude.push(hwnd(&window)?.0 as isize);
        }
    }
    let slots = discover_slots(automation, &exclude);
    let mut placement = state.0.lock().map_err(error)?;
    let discovery_error = slots.as_ref().err().cloned();
    placement.slots = slots.unwrap_or_default();
    if !placement.enabled || placement.dragging {
        return Ok(());
    }
    if (placement.docked || placement.waiting_for_space)
        && !placement.popup
        && !dock(app, &mut placement)?
    {
        if placement.docked {
            float(app, &mut placement, true)?;
        }
        placement.waiting_for_space = true;
    }
    if let Some(message) = discovery_error {
        return Err(format!("读取任务栏空白失败，保留悬浮窗口：{message}"));
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn set_taskbar_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let state = app.state::<TaskbarState>();
    let mut placement = state.0.lock().map_err(error)?;
    placement.enabled = enabled;
    placement.popup = false;
    placement.waiting_for_space = enabled;
    if enabled {
        if !dock(&app, &mut placement)? {
            float(&app, &mut placement, true)?;
        }
    } else {
        placement.dragging = false;
        for label in [LABEL, PREVIEW] {
            if let Some(window) = app.get_webview_window(label) {
                window.hide().map_err(error)?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn taskbar_popup(app: AppHandle, open: bool) -> Result<(), String> {
    let state = app.state::<TaskbarState>();
    let mut placement = state.0.lock().map_err(error)?;
    if placement.popup == open {
        return Ok(());
    }
    placement.popup = open;
    if placement.docked {
        if !dock(&app, &mut placement)? {
            float(&app, &mut placement, true)?;
        }
    } else {
        float(&app, &mut placement, false)?;
    }
    if open {
        // 用户主动打开菜单时需要激活附属窗口，否则 Explorer 可能在下一次点击时收回焦点。
        app.get_webview_window(LABEL)
            .ok_or("任务栏窗口不存在")?
            .set_focus()
            .map_err(error)?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn taskbar_redock(app: AppHandle) -> Result<(), String> {
    let state = app.state::<TaskbarState>();
    let mut placement = state.0.lock().map_err(error)?;
    if dock(&app, &mut placement)? {
        Ok(())
    } else {
        Err("任务栏暂时没有足够空白，请保留悬浮或腾出空间后重试。".into())
    }
}

#[tauri::command]
pub(crate) async fn taskbar_drag(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    let window = app.get_webview_window(LABEL).ok_or("任务栏窗口不存在")?;
    if !x.is_finite()
        || !y.is_finite()
        || !(0.0..=WIDTH).contains(&x)
        || !(0.0..=HEIGHT).contains(&y)
    {
        return Err("无效的拖动起点".into());
    }
    let start_position = window.outer_position().map_err(error)?;
    let scale = window.scale_factor().map_err(error)?;
    // IPC 到达时鼠标可能已经移动；起点必须来自按下瞬间，而非此刻的 GetCursorPos。
    let start = POINT {
        x: start_position.x + (x * scale).round() as i32,
        y: start_position.y + (y * scale).round() as i32,
    };
    let state = app.state::<TaskbarState>();
    {
        let mut placement = state.0.lock().map_err(error)?;
        if placement.dragging || !placement.enabled {
            return Ok(());
        }
        placement.dragging = true;
    }
    let result = drag_loop(&app, start, (start_position.x, start_position.y)).await;
    state.0.lock().map_err(error)?.dragging = false;
    if let Some(preview) = app.get_webview_window(PREVIEW) {
        let _ = preview.hide();
    }
    result
}

async fn drag_loop(app: &AppHandle, start: POINT, initial: (i32, i32)) -> Result<(), String> {
    let window = app.get_webview_window(LABEL).ok_or("任务栏窗口不存在")?;
    let preview = app.get_webview_window(PREVIEW).ok_or("吸附预览不存在")?;
    let mut moved = false;
    let mut candidate = None;
    loop {
        let pressed = unsafe { GetAsyncKeyState(1) } < 0;
        if unsafe { GetAsyncKeyState(27) } < 0 {
            candidate = None;
            break;
        }
        let mut point = POINT::default();
        unsafe {
            GetCursorPos(&mut point).map_err(error)?;
        }
        let dx = point.x - start.x;
        let dy = point.y - start.y;
        if moved || dx.abs() + dy.abs() >= 4 {
            let state = app.state::<TaskbarState>();
            let mut placement = state.0.lock().map_err(error)?;
            if !placement.enabled {
                break;
            }
            if !moved {
                float(app, &mut placement, false)?;
                placement.waiting_for_space = false;
                moved = true;
            }
            let scale = window.scale_factor().map_err(error)?;
            let width = (WIDTH * scale) as i32;
            let height = (HEIGHT * scale) as i32;
            placement.position = Some((initial.0 + dx, initial.1 + dy));
            apply_position(&window, placement.position.unwrap(), height as u32)?;
            candidate = choose_slot(&placement.slots, width, height, placement.position).filter(
                |(_, x, y)| {
                    (point.y - (y + height / 2)).abs() <= height
                        && point.x >= *x - 20
                        && point.x <= x + width + 20
                },
            );
            if let Some((slot, x, y)) = candidate {
                attach(&preview, slot.owner)?;
                apply_position(&preview, (x, y), height as u32)?;
                preview.show().map_err(error)?;
            } else {
                preview.hide().map_err(error)?;
            }
            notify(
                app,
                false,
                candidate.is_some(),
                if candidate.is_some() {
                    "松手吸附任务栏"
                } else {
                    "自由悬浮"
                },
            );
        }
        // 松手这一帧也要应用最终位置，快速拖动不能因 IPC 延迟被当作普通点击。
        if !pressed {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(16)).await;
    }
    if moved {
        let state = app.state::<TaskbarState>();
        let mut placement = state.0.lock().map_err(error)?;
        if placement.enabled {
            if candidate.is_some() {
                let _ = dock(app, &mut placement)?;
            } else {
                float(app, &mut placement, false)?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn 空白区会合并重叠障碍并避开托盘() {
        let area = Rect {
            left: 0,
            top: 1040,
            right: 1920,
            bottom: 1080,
        };
        let blocked = [
            Rect { right: 700, ..area },
            Rect {
                left: 600,
                right: 900,
                ..area
            },
            Rect { left: 1640, ..area },
        ];
        assert_eq!(
            free_intervals(area, &blocked, 6),
            vec![Rect {
                left: 906,
                right: 1634,
                ..area
            }]
        );
    }
    #[test]
    fn 空间不足不会覆盖按钮且吸附保持拖动位置() {
        let slots = [Slot {
            owner: 1,
            rect: Rect {
                left: 900,
                top: 1040,
                right: 1640,
                bottom: 1080,
            },
        }];
        assert!(choose_slot(&slots, 800, 40, None).is_none());
        let (_, x, y) = choose_slot(&slots, 380, 40, Some((1000, 1030))).unwrap();
        assert_eq!((x, y), (1000, 1040));
        assert!(choose_slot(&slots, 380, 50, None).is_none());
    }

    #[test]
    fn 主副屏任务栏都不应触发全屏隐藏() {
        assert!(is_shell_surface_class("Shell_TrayWnd"));
        assert!(is_shell_surface_class("Shell_SecondaryTrayWnd"));
        assert!(!is_shell_surface_class("Chrome_WidgetWin_1"));
    }
}
