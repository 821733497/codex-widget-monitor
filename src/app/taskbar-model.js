import { formatQuotaEstimateUsd, formatResetCredits } from "./formatters.js";
import { resolveDataBars } from "./settings-model.js";

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const amount = (value, currency = "USD") => {
  if (!finite(value)) return "--";
  const prefix = currency === "USD" ? "$" : currency === "CNY" ? "¥" : `${currency} `;
  return `${prefix}${new Intl.NumberFormat("en-US", { notation: Math.abs(value) >= 10000 ? "compact" : "standard", maximumFractionDigits: 2, minimumFractionDigits: Math.abs(value) >= 10000 ? 0 : 2 }).format(value)}`;
};

function windowMetric(window, fallback, en) {
  const minutes = window?.windowDurationMins;
  const period = finite(minutes) && minutes > 0
    ? minutes % 10080 === 0 ? `${minutes === 10080 && !en ? "" : minutes / 10080}${en ? "w" : "周"}`
      : minutes % 1440 === 0 ? `${minutes / 1440}${en ? "d" : "天"}`
        : minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`
    : fallback;
  const percent = window?.remainingPercent;
  return {
    label: `${period}${en ? " left" : "剩余"}`,
    value: finite(percent) ? `${Math.round(percent)}%` : "--",
    warning: finite(percent) && percent <= 10,
    detail: window?.resetsAt ? `${en ? "Resets" : "重置时间"}：${new Date(window.resetsAt).toLocaleString()}` : "",
  };
}

// 只生成展示数据和来源标识，绝不把 API Key 或站点 URL 广播到其他窗口。
export function buildTaskbarView(state, sourceItems = []) {
  const settings = state.settings || {};
  const en = settings.locale === "en";
  const quota = state.quota;
  const active = settings.activeTarget || { type: "official" };
  const official = active.type === "official";
  const site = settings.sites?.find((item) => item.id === active.siteId);
  const key = site?.keys?.find((item) => item.id === active.keyId);
  const credit = quota?.credits;
  const wallet = credit?.type === "sub2api" && (credit.isUnrestricted || credit.subType === "unrestricted" || credit.limit == null);
  const metric = (label, value, detail = "", warning = false) => ({ label, value, detail, warning });
  let metrics;
  if (official) {
    metrics = resolveDataBars(settings.dataBars, quota?.planType).map((type) => {
      if (type === "fiveHour") return windowMetric(quota?.primary, "5h", en);
      if (type === "weekly") return windowMetric(quota?.secondary, en ? "Week" : "周", en);
      if (type === "resetCredits") return metric(en ? "Resets" : "重置次数", formatResetCredits(quota?.resetCredits?.availableCount));
      const value = formatQuotaEstimateUsd(quota?.quotaEstimate?.current, settings.locale);
      return metric(en ? "Estimate" : "本期估算", value === "--" ? value : `≈${value}`, en ? "Full weekly quota at API prices; not a balance or bill." : "完整周额度的 API 等值估算，非余额或账单。 ");
    });
  } else {
    const currency = credit?.currency || "USD";
    const remaining = wallet ? credit.balance ?? credit.remaining : credit?.remaining;
    metrics = [
      metric(en ? "Today" : "今日消耗", amount(credit?.todayCost, currency)),
      metric(wallet ? en ? "Balance" : "钱包余额" : en ? "Cycle left" : "周期剩余", amount(remaining, currency), "", credit?.isValid === false || (finite(remaining) && remaining <= 5)),
      wallet ? metric(en ? "Billing" : "计费模式", en ? "Usage" : "按量", en ? "Pay-as-you-go; no cycle limit" : "按量计费，无周期限额") : windowMetric(quota?.secondary, en ? "Cycle" : "周期", en),
    ];
  }
  return {
    enabled: settings.taskbarEnabled === true,
    locale: en ? "en" : "zh",
    site: official ? en ? "Official" : "官方" : site?.name || (en ? "Relay" : "中转站"),
    account: official ? quota?.planType || "Codex" : key?.name || "Key",
    loading: state.loading,
    status: state.errors?.quota ? quota ? en ? "Cached" : "缓存" : en ? "Failed" : "读取失败" : state.loading ? en ? "Loading" : "读取中" : "",
    error: state.errors?.quota || "",
    metrics,
    sources: sourceItems.map(({ label, group, active, target }) => ({ label, group, active, target })),
  };
}
