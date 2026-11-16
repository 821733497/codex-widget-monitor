mod app_state;
mod commands;
#[cfg(windows)]
mod desktop_glass;
#[cfg(not(windows))]
mod desktop_glass {
    #[tauri::command]
    pub(crate) fn desktop_glass_frame() -> Result<tauri::ipc::Response, String> {
        Err("当前系统不支持桌面玻璃".into())
    }
}
mod logging;
mod quota;
mod settings;
#[cfg(target_os = "windows")]
mod taskbar;
#[cfg(not(target_os = "windows"))]
#[path = "taskbar_unsupported.rs"]
mod taskbar;

use commands::{
    get_quota, get_quota_for_target, get_settings, save_settings, show_main_window,
    test_sub2api_connection,
};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{image::Image, Manager};

pub fn run() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let builder = tauri::Builder::default();
    #[cfg(windows)]
    let builder = builder
        .manage(desktop_glass::DesktopGlass::default())
        .on_window_event(desktop_glass::on_window_event);
    builder
        .manage(app_state::AppState::new())
        .setup(|app| {
            #[cfg(windows)]
            desktop_glass::setup(app);
            let icon = Image::from_bytes(include_bytes!("../icons/icon-tray.png"))?;
            if let Some(window) = app.get_webview_window("main") {
                window.set_icon(icon.clone())?;
                #[cfg(target_os = "windows")]
                taskbar::disable_dwm_border(&window);
            }
            let open_settings =
                MenuItem::with_id(app, "open-settings", "打开设置", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_settings, &quit])?;
            TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open-settings" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            #[cfg(target_os = "windows")]
            taskbar::setup(app.handle())?;
            let settings = settings::SettingsService::load(app.handle()).unwrap_or_default();
            if settings.taskbar_enabled {
                #[cfg(target_os = "windows")]
                {
                    let handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(error) = taskbar::set_taskbar_enabled(handle, true).await {
                            eprintln!("恢复任务栏模式失败：{error}");
                        }
                    });
                }
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_quota,
            get_quota_for_target,
            get_settings,
            save_settings,
            show_main_window,
            test_sub2api_connection,
            desktop_glass::desktop_glass_frame,
            taskbar::set_taskbar_enabled,
            taskbar::taskbar_popup,
            taskbar::taskbar_popup_blur_close,
            taskbar::taskbar_redock,
            taskbar::taskbar_drag,
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用失败");
}
