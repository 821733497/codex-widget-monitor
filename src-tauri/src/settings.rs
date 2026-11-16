use std::{fs, path::PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyConfig {
    pub id: String,
    pub name: String,
    pub key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SiteConfig {
    pub id: String,
    pub name: String,
    pub base_url: String,
    #[serde(default)]
    pub keys: Vec<ApiKeyConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ActiveTarget {
    #[default]
    Official,
    #[serde(rename_all = "camelCase")]
    SiteKey { site_id: String, key_id: String },
}

fn default_glass_opacity() -> u32 {
    50
}

fn default_auto_update_enabled() -> bool {
    true
}

fn default_taskbar_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default)]
    pub codex_cli_path: Option<String>,
    #[serde(default)]
    pub update_proxy: Option<String>,
    #[serde(default = "default_taskbar_enabled")]
    pub taskbar_enabled: bool,
    #[serde(default)]
    pub sites: Vec<SiteConfig>,
    #[serde(default)]
    pub active_target: ActiveTarget,
    #[serde(default = "default_glass_opacity")]
    pub glass_opacity: u32,
    #[serde(default = "default_auto_update_enabled")]
    pub auto_update_enabled: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            codex_cli_path: None,
            update_proxy: None,
            taskbar_enabled: true,
            sites: Vec::new(),
            active_target: ActiveTarget::Official,
            glass_opacity: 50,
            auto_update_enabled: true,
        }
    }
}

pub struct SettingsService;

impl SettingsService {
    pub fn load(app: &AppHandle) -> Result<AppSettings> {
        let path = settings_path(app)?;
        if !path.exists() {
            return Ok(AppSettings::default());
        }
        let bytes = fs::read(path).context("读取设置失败")?;
        serde_json::from_slice(&bytes).context("设置格式无效")
    }

    pub fn save(app: &AppHandle, mut settings: AppSettings) -> Result<AppSettings> {
        settings.codex_cli_path = trim_option(settings.codex_cli_path);
        settings.update_proxy = trim_option(settings.update_proxy);
        settings.glass_opacity = settings.glass_opacity.clamp(10, 100);
        for site in &mut settings.sites {
            site.name = site.name.trim().to_string();
            site.base_url = site.base_url.trim().trim_end_matches('/').to_string();
            for key in &mut site.keys {
                key.name = key.name.trim().to_string();
            }
        }
        let path = settings_path(app)?;
        fs::create_dir_all(path.parent().context("设置目录不存在")?)?;
        let mut document = if path.exists() {
            let bytes = fs::read(&path).context("读取现有设置失败")?;
            serde_json::from_slice::<Value>(&bytes).context("现有设置格式无效")?
        } else {
            serde_json::json!({})
        };
        merge_settings(&mut document, serde_json::to_value(&settings)?);
        fs::write(path, serde_json::to_vec_pretty(&document)?).context("保存设置失败")?;
        Ok(settings)
    }
}

fn merge_settings(document: &mut Value, updates: Value) {
    let Some(document) = document.as_object_mut() else {
        return;
    };
    if let Some(updates) = updates.as_object() {
        document.extend(updates.clone());
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(app.path().app_config_dir()?.join(SETTINGS_FILE))
}

fn trim_option(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 保存精简设置时保留旧版其它设置字段() {
        let mut existing = serde_json::json!({
            "theme": "holo",
            "ballSize": "medium",
            "sites": [{ "id": "old-site" }],
            "taskbarEnabled": false
        });
        let updates = serde_json::json!({
            "sites": [{ "id": "new-site" }],
            "taskbarEnabled": true
        });

        merge_settings(&mut existing, updates);

        assert_eq!(existing["theme"], "holo");
        assert_eq!(existing["ballSize"], "medium");
        assert_eq!(existing["sites"][0]["id"], "new-site");
        assert_eq!(existing["taskbarEnabled"], true);
    }

    #[test]
    fn 默认玻璃不透明度为50() {
        let settings = AppSettings::default();
        assert_eq!(settings.glass_opacity, 50);

        let parsed: AppSettings = serde_json::from_str("{}").unwrap();
        assert_eq!(parsed.glass_opacity, 50);
    }

    #[test]
    fn 默认开启自动更新() {
        assert!(AppSettings::default().auto_update_enabled);
        assert!(
            serde_json::from_str::<AppSettings>("{}")
                .unwrap()
                .auto_update_enabled
        );
    }

    #[test]
    fn 首次启动默认启用任务栏且保留用户关闭状态() {
        assert!(AppSettings::default().taskbar_enabled);
        assert!(
            serde_json::from_str::<AppSettings>("{}")
                .unwrap()
                .taskbar_enabled
        );
        assert!(
            !serde_json::from_str::<AppSettings>(r#"{"taskbarEnabled":false}"#)
                .unwrap()
                .taskbar_enabled
        );
    }
}
