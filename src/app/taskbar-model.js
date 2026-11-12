import {
  formatQuotaEstimateUsd,
  formatResetCountdown,
  formatResetCredits,
} from "./formatters.js";
import { resolveDataBars } from "./settings-model.js";
import { targetCacheKey } from "./state.js";

const finite = (value) => typeof value === "number" && Number.isFinite(value);

const amount = (value, currency = "USD") => {
  if (!finite(value)) return "--";
  const prefix = currency === "USD" ? "$" : currency === "CNY" ? "¥" : `${currency} `;
  return `${prefix}${new Intl.NumberFormat("en-US", {
    notation: Math.abs(value) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 2,
    minimumFractionDigits: Math.abs(value) >= 10000 ? 0 : 2,
  }).format(value)}`;
};

function windowMetric(window, fallback, en) {
  const minutes = window?.windowDurationMins;
  const period =
    finite(minutes) && minutes > 0
      ? minutes % 10080 === 0
        ? `${minutes === 10080 && !en ? "" : minutes / 10080}${en ? "w" : "周"}`
        : minutes % 1440 === 0
          ? `${minutes / 1440}${en ? "d" : "天"}`
          : minutes % 60 === 0
            ? `${minutes / 60}h`
            : `${minutes}m`
      : fallback;
  const percent = window?.remainingPercent;
  return {
    label: `${period}${en ? " left" : "剩余"}`,
    value: finite(percent) ? `${Math.round(percent)}%` : "--",
    warning: finite(percent) && percent <= 10,
    detail: window?.resetsAt
      ? `${en ? "Resets" : "重置时间"}：${new Date(window.resetsAt).toLocaleString()}`
      : "",
  };
}

function resetMetric({ official, wallet, quota, bars, en }) {
  const label = en ? "Resets in" : "距重置";
  if (wallet) {
    return {
      label,
      value: "--",
      resetAt: "",
      detail: en ? "Pay-as-you-go; no cycle reset" : "按量计费，无周期重置",
      warning: false,
    };
  }

  let primaryAt = quota?.primary?.resetsAt;
  let secondaryAt = quota?.secondary?.resetsAt;
  let targetAt;
  if (official) {
    const preferWeekly = Array.isArray(bars) && !bars.includes("fiveHour") && bars.includes("weekly");
    targetAt = preferWeekly
      ? secondaryAt || primaryAt || quota?.resetsAt
      : primaryAt || secondaryAt || quota?.resetsAt;
  } else {
    targetAt = secondaryAt || quota?.resetsAt || primaryAt;
  }

  const locale = en ? "en" : "zh";
  const value = formatResetCountdown(targetAt, locale);
  const details = [];
  if (official && primaryAt) {
    details.push(`${en ? "5h resets" : "5h重置"}：${new Date(primaryAt).toLocaleString()}`);
  }
  if (official && secondaryAt) {
    details.push(`${en ? "Weekly resets" : "周重置"}：${new Date(secondaryAt).toLocaleString()}`);
  } else if (targetAt) {
    details.push(`${en ? "Resets" : "重置时间"}：${new Date(targetAt).toLocaleString()}`);
  }

  return {
    label,
    value,
    resetAt: value === "--" ? "" : targetAt,
    detail: details.join(" · "),
    warning: false,
  };
}

function buildMetricsForTarget({ target, quota, settings, en }) {
  const official = !target || target.type === "official";
  const credit = quota?.credits;
  const wallet =
    credit?.type === "sub2api" &&
    (credit.isUnrestricted || credit.subType === "unrestricted" || credit.limit == null);
  const metric = (label, value, detail = "", warning = false) => ({ label, value, detail, warning });

  if (official) {
    const bars = resolveDataBars(settings.dataBars, quota?.planType);
    const items = bars.map((type) => {
      if (type === "fiveHour") return windowMetric(quota?.primary, "5h", en);
      if (type === "weekly") return windowMetric(quota?.secondary, en ? "Week" : "周", en);
      if (type === "resetCredits") {
        return metric(
          en ? "Resets" : "重置次数",
          formatResetCredits(quota?.resetCredits?.availableCount),
        );
      }
      const value = formatQuotaEstimateUsd(quota?.quotaEstimate?.current, settings.locale);
      return metric(
        en ? "Estimate" : "本期估算",
        value === "--" ? value : `≈${value}`,
        en ? "Full weekly quota at API prices; not a balance or bill." : "完整周额度的 API 等值估算，非余额或账单。",
      );
    });
    items.push(resetMetric({ official: true, wallet: false, quota, bars, en }));
    return items;
  }

  const currency = credit?.currency || "USD";
  const remaining = wallet ? (credit.balance ?? credit.remaining) : credit?.remaining;
  const items = [
    metric(en ? "Today" : "今日消耗", amount(credit?.todayCost, currency)),
    metric(
      wallet ? (en ? "Balance" : "钱包余额") : en ? "Cycle left" : "周期剩余",
      amount(remaining, currency),
      "",
      credit?.isValid === false || (finite(remaining) && remaining <= 5),
    ),
    wallet
      ? metric(
          en ? "Billing" : "计费模式",
          en ? "Usage" : "按量",
          en ? "Pay-as-you-go; no cycle limit" : "按量计费，无周期限额",
        )
      : windowMetric(quota?.secondary, en ? "Cycle" : "周期", en),
  ];
  items.push(resetMetric({ official: false, wallet, quota, bars: null, en }));
  return items;
}

function resolveStatus(quota, loading, error, en) {
  if (error) return quota ? (en ? "Cached" : "缓存") : en ? "Failed" : "读取失败";
  if (loading) return en ? "Loading" : "读取中";
  return "";
}

// 只生成展示数据和来源标识，绝不把 API Key 或站点 URL 广播到其他窗口。
export function buildTaskbarView(state, sourceItems = []) {
  const settings = state.settings || {};
  const en = settings.locale === "en";
  const quota = state.quota;
  const active = settings.activeTarget || { type: "official" };
  const activeKey = targetCacheKey(active);
  const official = active.type === "official";
  const site = settings.sites?.find((item) => item.id === active.siteId);
  const key = site?.keys?.find((item) => item.id === active.keyId);
  const metrics = buildMetricsForTarget({ target: active, quota, settings, en });

  const sources = sourceItems.map(({ label, group, active: isActive, target }) => {
    const keyName = targetCacheKey(target);
    const cached = state.sourceQuotas?.[keyName];
    const itemQuota = keyName === activeKey ? quota || cached?.quota || null : cached?.quota || null;
    const itemLoading = keyName === activeKey ? Boolean(state.loading || cached?.loading) : Boolean(cached?.loading);
    const itemError = keyName === activeKey ? state.errors?.quota || cached?.error || "" : cached?.error || "";
    const itemOfficial = !target || target.type === "official";
    return {
      label,
      group,
      active: isActive,
      target,
      plan: itemOfficial && itemQuota?.planType ? itemQuota.planType : "",
      loading: itemLoading,
      error: itemError,
      status: resolveStatus(itemQuota, itemLoading, itemError, en),
      metrics: buildMetricsForTarget({ target, quota: itemQuota, settings, en }),
    };
  });

  return {
    enabled: settings.taskbarEnabled === true,
    locale: en ? "en" : "zh",
    site: official ? (en ? "Official" : "官方") : site?.name || (en ? "Relay" : "中转站"),
    account: official ? quota?.planType || "Codex" : key?.name || "Key",
    loading: state.loading,
    status: resolveStatus(quota, state.loading, state.errors?.quota, en),
    error: state.errors?.quota || "",
    metrics,
    sources,
  };
}
