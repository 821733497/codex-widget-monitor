const finite = (value) => typeof value === "number" && Number.isFinite(value);
const money = (value, unit = "USD") => finite(value) ? `${unit === "USD" ? "$" : unit === "CNY" ? "¥" : `${unit} `}${value.toFixed(2)}` : "--";
const targetKey = (target) => target?.type === "siteKey" ? `${target.siteId}:${target.keyId}` : "official";

function windowMetric(window, fallback, en) {
  const mins = window?.windowDurationMins;
  const period = mins === 300 ? "5h" : mins === 10080 ? (en ? "Week" : "周") : fallback;
  return {
    label: `${period}${en ? " left" : "剩余"}`,
    value: finite(window?.remainingPercent) ? `${window.remainingPercent}%` : "--",
    warning: finite(window?.remainingPercent) && window.remainingPercent <= 10,
    detail: window?.resetsAt ? `${en ? "Resets" : "重置时间"}：${new Date(window.resetsAt).toLocaleString()}` : "",
  };
}

function metricsFor(target, quota, en) {
  const credit = quota?.credits;
  if (!target || target.type === "official") return [
    windowMetric(quota?.primary, "5h", en),
    windowMetric(quota?.secondary, en ? "Week" : "周", en),
    { label: en ? "Plan" : "套餐", value: quota?.planType || "--" },
    { label: en ? "Resets in" : "距重置", value: quota?.resetsAt ? new Date(quota.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--", resetAt: quota?.resetsAt || "" },
  ];
  const wallet = credit?.isUnrestricted || credit?.subType === "unrestricted" || credit?.limit == null;
  return [
    { label: en ? "Today" : "今日消耗", value: money(credit?.todayCost, credit?.currency) },
    { label: wallet ? (en ? "Balance" : "余额") : (en ? "Cycle left" : "周期剩余"), value: money(wallet ? credit?.balance ?? credit?.remaining : credit?.remaining, credit?.currency), warning: credit?.isValid === false },
    wallet ? { label: en ? "Billing" : "计费模式", value: en ? "Usage" : "按量" } : windowMetric(quota?.secondary, en ? "Cycle" : "周期", en),
    { label: en ? "Resets in" : "距重置", value: quota?.resetsAt ? new Date(quota.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--", resetAt: quota?.resetsAt || "" },
  ];
}

function sameTarget(a, b) { return targetKey(a) === targetKey(b); }

export function buildTaskbarView(state, sources = []) {
  const settings = state.settings || {};
  const active = settings.activeTarget || { type: "official" };
  const site = settings.sites?.find((item) => item.id === active.siteId);
  const key = site?.keys?.find((item) => item.id === active.keyId);
  const en = settings.locale === "en";
  const cacheFor = (target) => state.sourceQuotas?.[targetKey(target)] || {};
  const activeCache = cacheFor(active);
  const activeQuota =
    activeCache.quota ||
    (state.quotaTarget
      ? sameTarget(state.quotaTarget, active)
        ? state.quota
        : null
      : state.quota);
  const activeError = activeCache.error || state.errors?.quota;
  const activeLoading = activeCache.loading || state.loading;
  const sourceViews = sources.map((source) => {
    const cached = cacheFor(source.target);
    const quota = sameTarget(source.target, active) ? activeQuota : cached.quota;
    return { ...source, plan: source.target.type === "official" ? quota?.planType : "", error: cached.error || "", status: cached.error ? (quota ? "缓存" : "读取失败") : cached.loading ? "读取中" : "", metrics: metricsFor(source.target, quota, en) };
  });
  return {
    enabled: settings.taskbarEnabled === true,
    locale: en ? "en" : "zh",
    site: active.type === "official" ? (en ? "Official" : "官方") : site?.name || "中转站",
    account: active.type === "official" ? activeQuota?.planType || "Codex" : key?.name || "Key",
    status: activeError ? (activeQuota ? "缓存" : "读取失败") : activeLoading ? "读取中" : "",
    error: activeError || "",
    loading: activeLoading,
    metrics: metricsFor(active, activeQuota, en),
    sources: sourceViews,
    glassOpacity:
      typeof settings.glassOpacity === "number" ? settings.glassOpacity : 50,
  };
}
