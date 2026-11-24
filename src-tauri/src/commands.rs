use std::path::Path;

use tauri::{AppHandle, Manager, State};

use crate::{
    app_state::AppState,
    quota::{self, QuotaSnapshot, Sub2ApiTestResult},
    settings::{ActiveTarget, AppSettings, SettingsService},
};

#[tauri::command]
pub(crate) async fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    SettingsService::load(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let old_path = SettingsService::load(&app)
        .ok()
        .and_then(|value| value.codex_cli_path);
    let saved = SettingsService::save(&app, settings).map_err(|error| error.to_string())?;
    if old_path != saved.codex_cli_path {
        state.quota_service.lock().await.reset_session().await;
    }
    Ok(saved)
}

#[tauri::command]
pub(crate) async fn get_quota(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<QuotaSnapshot, String> {
    let settings = SettingsService::load(&app).map_err(|error| error.to_string())?;
    fetch_quota(&state, &settings, &settings.active_target).await
}

#[tauri::command]
pub(crate) async fn get_quota_for_target(
    app: AppHandle,
    state: State<'_, AppState>,
    target: ActiveTarget,
) -> Result<QuotaSnapshot, String> {
    let settings = SettingsService::load(&app).map_err(|error| error.to_string())?;
    fetch_quota(&state, &settings, &target).await
}

async fn fetch_quota(
    state: &AppState,
    settings: &AppSettings,
    target: &ActiveTarget,
) -> Result<QuotaSnapshot, String> {
    if let ActiveTarget::SiteKey { site_id, key_id } = target {
        let site = settings
            .sites
            .iter()
            .find(|item| &item.id == site_id)
            .ok_or("中转站不存在")?;
        let key = site
            .keys
            .iter()
            .find(|item| &item.id == key_id)
            .ok_or("API Key 不存在")?;
        return quota::fetch_sub2api_quota(
            &site.name,
            &key.name,
            &site.base_url,
            &key.key,
            settings.update_proxy.as_deref(),
        )
        .await
        .map_err(|error| error.to_string());
    }
    state
        .quota_service
        .lock()
        .await
        .get_quota(settings.codex_cli_path.as_deref().map(Path::new))
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn test_sub2api_connection(
    base_url: String,
    api_key: String,
    proxy: Option<String>,
) -> Result<Sub2ApiTestResult, String> {
    quota::test_sub2api_connection(&base_url, &api_key, proxy.as_deref())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn show_main_window(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("设置窗口不存在")?;
    let _ = window.unminimize();
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub(crate) fn restart_app(app: AppHandle) -> Result<(), String> {
    let binary = tauri::process::current_binary(&app.env())
        .map_err(|error| format!("无法定位当前应用路径：{error}"))?;
    if !binary.parent().is_some_and(Path::exists) {
        return Err(format!("重启目标目录不存在：{}", binary.display()));
    }
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        let _ = tokio::time::timeout(std::time::Duration::from_millis(500), async {
            handle
                .state::<AppState>()
                .quota_service
                .lock()
                .await
                .reset_session()
                .await;
        })
        .await;
        handle.request_restart();
    });
    Ok(())
}

#[tauri::command]
pub(crate) fn set_menubar_title(app: AppHandle, title: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        crate::taskbar::set_menubar_title(&app, &title)?;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, title);
    Ok(())
}
