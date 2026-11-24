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
#[cfg(windows)]
mod logging;
mod quota;
mod settings;
#[cfg(target_os = "windows")]
mod taskbar;
#[cfg(target_os = "macos")]
#[path = "macos_menubar.rs"]
mod taskbar;
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
#[path = "taskbar_unsupported.rs"]
mod taskbar;

use commands::{
    get_quota, get_quota_for_target, get_settings, quit_app, restart_app, save_settings,
    set_menubar_title, show_main_window, test_sub2api_connection,
};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{image::Image, Manager};

#[cfg(windows)]
fn acquire_single_instance() -> bool {
    use windows::{
        core::w,
        Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS},
        Win32::System::Threading::CreateMutexW,
    };

    unsafe {
        match CreateMutexW(None, false, w!("Local\\CodexWidgetMonitor.SingleInstance")) {
            Ok(_) => GetLastError() != ERROR_ALREADY_EXISTS,
            Err(error) => {
                eprintln!("创建单实例互斥体失败，继续启动：{error}");
                true
            }
        }
    }
}

fn tray_icon() -> tauri::Result<Image<'static>> {
    #[cfg(windows)]
    {
        use windows::{
            core::w,
            Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD},
        };
        let mut light = 0u32;
        let mut size = std::mem::size_of::<u32>() as u32;
        // 任务栏跟随系统主题，可能与设置窗口使用的应用主题不同。
        let result = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                w!("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"),
                w!("SystemUsesLightTheme"),
                RRF_RT_REG_DWORD,
                None,
                Some((&mut light as *mut u32).cast()),
                Some(&mut size),
            )
        };
        if result.is_err() {
            eprintln!("读取任务栏主题失败，使用白色托盘图标：{result:?}");
        } else if light != 0 {
            return Image::from_bytes(include_bytes!("../icons/icon-tray-dark.png"));
        }
    }
    Image::from_bytes(include_bytes!("../icons/icon-tray.png"))
}

pub fn run() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    #[cfg(windows)]
    if !acquire_single_instance() {
        return;
    }
    let builder = tauri::Builder::default();
    #[cfg(windows)]
    let builder = builder
        .manage(desktop_glass::DesktopGlass::default())
        .on_window_event(|window, event| {
            desktop_glass::on_window_event(window, event);
            if window.label() == "main" && matches!(event, tauri::WindowEvent::ThemeChanged(_)) {
                if let Some(tray) = window.app_handle().tray_by_id("quota") {
                    if let Err(error) = tray_icon().and_then(|icon| tray.set_icon(Some(icon))) {
                        eprintln!("切换托盘图标失败：{error}");
                    }
                }
            }
        });
    #[cfg(target_os = "macos")]
    let builder = builder.on_window_event(|window, event| {
        if window.label() == "main" {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        }
    });
    builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(app_state::AppState::new())
        .setup(|app| {
            #[cfg(windows)]
            desktop_glass::setup(app);
            if let Some(window) = app.get_webview_window("main") {
                window.set_icon(Image::from_bytes(include_bytes!(
                    "../icons/generated/icon.png"
                ))?)?;
                #[cfg(target_os = "windows")]
                taskbar::disable_dwm_border(&window);
                #[cfg(target_os = "macos")]
                taskbar::configure_main_window(&window);
            }
            let open_settings =
                MenuItem::with_id(app, "open-settings", "打开设置", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_settings, &quit])?;
            let tray_builder = TrayIconBuilder::with_id("quota")
                .icon(tray_icon()?)
                .menu(&menu)
                .show_menu_on_left_click(false);
            #[cfg(target_os = "macos")]
            let tray_builder = tray_builder.icon_as_template(true);
            tray_builder
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open-settings" => {
                        #[cfg(target_os = "macos")]
                        taskbar::close_popup_if_open(app);
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    #[cfg(target_os = "macos")]
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state,
                        rect,
                        ..
                    } = event
                    {
                        taskbar::handle_tray_click(tray.app_handle(), button_state, rect);
                    }
                    #[cfg(not(target_os = "macos"))]
                    if let TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;
            #[cfg(any(target_os = "windows", target_os = "macos"))]
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_quota,
            get_quota_for_target,
            get_settings,
            save_settings,
            show_main_window,
            quit_app,
            restart_app,
            set_menubar_title,
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
