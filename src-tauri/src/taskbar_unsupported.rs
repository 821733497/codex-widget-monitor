#[tauri::command]
pub(crate) fn set_taskbar_enabled(enabled: bool) -> Result<(), String> {
    if enabled {
        Err("任务栏模式仅支持 Windows。".into())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub(crate) fn taskbar_popup(
    open: bool,
    height: Option<f64>,
    width: Option<f64>,
) -> Result<(), String> {
    let _ = (open, height, width);
    Err("任务栏模式仅支持 Windows。".into())
}

#[tauri::command]
pub(crate) fn taskbar_popup_blur_close() -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub(crate) fn taskbar_redock() -> Result<(), String> {
    Err("任务栏模式仅支持 Windows。".into())
}

#[tauri::command]
pub(crate) fn taskbar_drag(x: f64, y: f64) -> Result<(), String> {
    let _ = (x, y);
    Err("任务栏模式仅支持 Windows。".into())
}
