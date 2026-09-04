use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::types::{QuotaSnapshot, QuotaWindow};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_RESPONSE_BYTES: usize = 512 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sub2ApiTestResult {
    pub success: bool,
    pub status: String,
    pub limit: Option<f64>,
    pub used: Option<f64>,
    pub remaining: Option<f64>,
    pub resets_at: Option<String>,
    pub message: String,
}

fn create_client(update_proxy: Option<&str>) -> Result<reqwest::Client> {
    let mut builder = reqwest::Client::builder().timeout(REQUEST_TIMEOUT);
    if let Some(proxy) = update_proxy.map(str::trim).filter(|v| !v.is_empty()) {
        builder = builder.proxy(reqwest::Proxy::all(proxy).context("代理配置无效")?);
    }
    builder.build().context("创建 HTTP 客户端失败")
}

pub fn normalize_base_url(raw: &str) -> String {
    let mut url = raw.trim().to_string();
    if !url.starts_with("http://") && !url.starts_with("https://") {
        url = format!("https://{url}");
    }
    url.trim_end_matches('/').to_string()
}

pub fn resolve_usage_url(base_url: &str) -> String {
    let normalized = normalize_base_url(base_url);
    if normalized.ends_with("/v1") {
        format!("{normalized}/usage")
    } else {
        format!("{normalized}/v1/usage")
    }
}

async fn do_usage_request(base_url: &str, api_key: &str, proxy: Option<&str>) -> Result<Value> {
    let client = create_client(proxy)?;
    let url = resolve_usage_url(base_url);

    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    if let Ok(bearer) = HeaderValue::from_str(&format!("Bearer {api_key}")) {
        headers.insert(AUTHORIZATION, bearer);
    }
    if let Ok(x_key) = HeaderValue::from_str(api_key) {
        headers.insert("X-API-Key", x_key);
    }

    let response = client
        .get(&url)
        .headers(headers)
        .send()
        .await
        .with_context(|| format!("请求接口失败 ({url})"))?;

    let status_code = response.status();
    if status_code == reqwest::StatusCode::UNAUTHORIZED
        || status_code == reqwest::StatusCode::FORBIDDEN
    {
        return Err(anyhow!(
            "鉴权失败 (HTTP {status_code})：请检查 API Key 是否有效。"
        ));
    }

    let bytes = response.bytes().await.context("读取响应数据流失败")?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err(anyhow!("响应内容过大，超过安全限制。"));
    }

    let parsed: Value = serde_json::from_slice(&bytes).context("上游没有返回有效的 JSON 数据")?;

    if !status_code.is_success() {
        let err_msg = parsed
            .get("error")
            .and_then(|e| e.get("message").or(Some(e)))
            .and_then(Value::as_str)
            .or_else(|| parsed.get("message").and_then(Value::as_str))
            .unwrap_or("未知上游错误");
        return Err(anyhow!("上游返回错误 (HTTP {status_code})：{err_msg}"));
    }

    // 检查 sub2api 信封格式
    if let Some(code) = parsed.get("code").and_then(Value::as_i64) {
        if code != 0 {
            let msg = parsed
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("接口返回错误代码");
            return Err(anyhow!("接口业务错误：{msg}"));
        }
    }

    // 提取有效 data 对象
    if let Some(data) = parsed.get("data") {
        if data.is_object()
            && (data.get("rate_limits").is_some()
                || data.get("usage").is_some()
                || data.get("status").is_some())
        {
            return Ok(data.clone());
        }
    }

    Ok(parsed)
}

pub async fn test_connection(
    base_url: &str,
    api_key: &str,
    proxy: Option<&str>,
) -> Result<Sub2ApiTestResult> {
    let data = do_usage_request(base_url, api_key, proxy).await?;
    let status = data
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("active")
        .to_string();

    let rate_limit = data
        .get("rate_limits")
        .and_then(Value::as_array)
        .and_then(|arr| arr.first());

    let limit = rate_limit
        .and_then(|rl| rl.get("limit"))
        .and_then(Value::as_f64);
    let used = rate_limit
        .and_then(|rl| rl.get("used"))
        .and_then(Value::as_f64);
    let remaining = rate_limit
        .and_then(|rl| rl.get("remaining"))
        .and_then(Value::as_f64)
        .or_else(|| {
            if let (Some(l), Some(u)) = (limit, used) {
                Some((l - u).max(0.0))
            } else {
                None
            }
        });

    let resets_at = rate_limit
        .and_then(|rl| rl.get("reset_at"))
        .and_then(Value::as_str)
        .map(ToString::to_string);

    let summary_msg = if let Some(rem) = remaining {
        format!("连接成功！状态: {status}，当前剩余: ${rem:.2}")
    } else {
        format!("连接成功！状态: {status}")
    };

    Ok(Sub2ApiTestResult {
        success: true,
        status,
        limit,
        used,
        remaining,
        resets_at,
        message: summary_msg,
    })
}

pub async fn fetch_quota(
    site_name: &str,
    key_name: &str,
    base_url: &str,
    api_key: &str,
    proxy: Option<&str>,
) -> Result<QuotaSnapshot> {
    let data = do_usage_request(base_url, api_key, proxy).await?;

    let status = data
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("active")
        .to_string();

    let rate_limit = data
        .get("rate_limits")
        .and_then(Value::as_array)
        .and_then(|arr| arr.first());

    let limit = rate_limit
        .and_then(|rl| rl.get("limit"))
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    let used = rate_limit
        .and_then(|rl| rl.get("used"))
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    let remaining = rate_limit
        .and_then(|rl| rl.get("remaining"))
        .and_then(Value::as_f64)
        .unwrap_or_else(|| (limit - used).max(0.0));

    let resets_at = rate_limit
        .and_then(|rl| rl.get("reset_at"))
        .and_then(Value::as_str)
        .map(ToString::to_string);

    let remaining_percent = if limit > 0.0 {
        ((remaining / limit) * 100.0).round().clamp(0.0, 100.0) as u8
    } else {
        100
    };
    let used_percent = 100u8.saturating_sub(remaining_percent);

    // 提取今日消费和总消费
    let today_cost = data
        .get("usage")
        .and_then(|u| u.get("today_cost").or_else(|| u.get("today")))
        .and_then(Value::as_f64)
        .or_else(|| {
            data.get("daily_usage")
                .and_then(Value::as_array)
                .and_then(|arr| arr.last())
                .and_then(|last| last.get("actual_cost").or_else(|| last.get("cost")))
                .and_then(Value::as_f64)
        });

    let total_cost = data
        .get("usage")
        .and_then(|u| u.get("total_cost").or_else(|| u.get("total")))
        .and_then(Value::as_f64);

    let credits_obj = serde_json::json!({
        "type": "sub2api",
        "currency": "USD",
        "limit": limit,
        "used": used,
        "remaining": remaining,
        "status": status,
        "todayCost": today_cost,
        "totalCost": total_cost,
    });

    let secondary_window = QuotaWindow {
        used_percent,
        remaining_percent,
        window_duration_mins: Some(10080),
        resets_at: resets_at.clone(),
    };

    let display_name = if key_name.is_empty() {
        site_name.to_string()
    } else {
        format!("{key_name} ({site_name})")
    };

    Ok(QuotaSnapshot {
        limit_id: "sub2api".to_string(),
        limit_name: display_name,
        plan_type: status,
        reached_type: None,
        credits: Some(credits_obj),
        reset_credits: None,
        primary: Some(secondary_window.clone()),
        secondary: Some(secondary_window),
        remaining_percent: Some(remaining_percent),
        used_percent: Some(used_percent),
        resets_at,
        fetched_at: Utc::now().to_rfc3339(),
        quota_estimate: None,
    })
}
