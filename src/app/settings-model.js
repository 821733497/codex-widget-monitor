import {
  DATA_BAR_CONTENTS,
  DEFAULT_SETTINGS,
  LOG_LEVELS,
  METER_WINDOWS,
  THEMES,
  WIDGET_MODES,
} from "./constants.js";

export const PLUS_DEFAULT_DATA_BARS = ["fiveHour", "weekly", "quotaEstimate"];
export const OTHER_DEFAULT_DATA_BARS = [
  "quotaEstimate",
  "weekly",
  "resetCredits",
];

export function normalizeSettings(settings) {
  const refreshIntervalMinutes = Number(settings?.refreshIntervalMinutes);
  const widgetMode =
    settings?.widgetMode === WIDGET_MODES.PANEL
      ? WIDGET_MODES.PANEL
      : WIDGET_MODES.BALL;
  return {
    codexCliPath:
      typeof settings?.codexCliPath === "string" ? settings.codexCliPath : "",
    updateProxy:
      typeof settings?.updateProxy === "string" ? settings.updateProxy : "",
    refreshIntervalMinutes:
      Number.isInteger(refreshIntervalMinutes) &&
      refreshIntervalMinutes >= 1 &&
      refreshIntervalMinutes <= 1440
        ? refreshIntervalMinutes
        : DEFAULT_SETTINGS.refreshIntervalMinutes,
    locale: settings?.locale === "en" ? "en" : "zh",
    theme: normalizeTheme(settings?.theme),
    meterWindow: normalizeMeterWindow(settings?.meterWindow),
    dataBars: normalizeDataBars(settings?.dataBars),
    logLevel: normalizeLogLevel(settings?.logLevel),
    autoUpdateEnabled:
      typeof settings?.autoUpdateEnabled === "boolean"
        ? settings.autoUpdateEnabled
        : DEFAULT_SETTINGS.autoUpdateEnabled,
    autoStartEnabled:
      typeof settings?.autoStartEnabled === "boolean"
        ? settings.autoStartEnabled
        : DEFAULT_SETTINGS.autoStartEnabled,
    hideDockIcon:
      typeof settings?.hideDockIcon === "boolean"
        ? settings.hideDockIcon
        : DEFAULT_SETTINGS.hideDockIcon,
    onboardingSeen:
      typeof settings?.onboardingSeen === "boolean"
        ? settings.onboardingSeen
        : DEFAULT_SETTINGS.onboardingSeen,
    widgetMode,
    panelPosition: normalizeWindowPosition(settings?.panelPosition),
    ballPosition: normalizeWindowPosition(settings?.ballPosition),
    ballDock: normalizeBallDock(settings?.ballDock),
    ballSize: normalizeBallSize(settings?.ballSize),
    ballSnapStyle: normalizeBallSnapStyle(settings?.ballSnapStyle),
    sites: normalizeSites(settings?.sites),
    activeTarget: normalizeActiveTarget(
      settings?.activeTarget,
      settings?.sites,
    ),
  };
}

export function normalizeSites(sites) {
  if (!Array.isArray(sites)) return [];
  return sites
    .filter((s) => s && typeof s === "object")
    .map((site) => ({
      id: String(site.id || "").trim(),
      name: String(site.name || "").trim(),
      baseUrl: String(site.baseUrl || "").trim(),
      keys: Array.isArray(site.keys)
        ? site.keys
            .filter((k) => k && typeof k === "object")
            .map((k) => ({
              id: String(k.id || "").trim(),
              name: String(k.name || "").trim(),
              key: String(k.key || "").trim(),
            }))
            .filter((k) => k.id && k.key)
        : [],
    }))
    .filter((s) => s.id && s.baseUrl);
}

export function normalizeActiveTarget(activeTarget, sites = []) {
  if (!activeTarget || typeof activeTarget !== "object") {
    return { type: "official" };
  }
  if (
    activeTarget.type === "siteKey" &&
    activeTarget.siteId &&
    activeTarget.keyId
  ) {
    const site = sites.find((s) => s.id === activeTarget.siteId);
    const key = site?.keys?.find((k) => k.id === activeTarget.keyId);
    if (site && key) {
      return {
        type: "siteKey",
        siteId: activeTarget.siteId,
        keyId: activeTarget.keyId,
      };
    }
  }
  return { type: "official" };
}

export function normalizeWindowPosition(position) {
  if (!position || typeof position !== "object") return null;
  const x = Number(position.x);
  const y = Number(position.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.round(x),
    y: Math.round(y),
  };
}

export function normalizeBallDock(dock) {
  return dock === "left" || dock === "right" ? dock : null;
}

export function normalizeBallSize(ballSize) {
  return ballSize === "medium" ? "medium" : "small";
}

export function normalizeBallSnapStyle(snapStyle) {
  return snapStyle === "bar" ? "bar" : "ball";
}

export function normalizeTheme(theme) {
  if (theme === "holo") return "default";
  return Object.hasOwn(THEMES, theme) ? theme : DEFAULT_SETTINGS.theme;
}

export function normalizeLogLevel(logLevel) {
  return Object.hasOwn(LOG_LEVELS, logLevel)
    ? logLevel
    : DEFAULT_SETTINGS.logLevel;
}

export function normalizeMeterWindow(meterWindow) {
  return Object.hasOwn(METER_WINDOWS, meterWindow)
    ? meterWindow
    : DEFAULT_SETTINGS.meterWindow;
}

export function normalizeDataBarContent(content) {
  return Object.hasOwn(DATA_BAR_CONTENTS, content) ? content : null;
}

export function normalizeDataBars(dataBars) {
  if (!Array.isArray(dataBars) || dataBars.length !== 3) return null;
  const normalized = dataBars.map(normalizeDataBarContent);
  return normalized.every(Boolean) ? normalized : null;
}

export function resolveDataBars(dataBars, planType) {
  const normalized = normalizeDataBars(dataBars);
  if (normalized) return normalized;
  // null 表示尚未自定义；套餐默认只在此状态生效，不能覆盖用户保存的布局。
  const isPlus =
    typeof planType === "string" && planType.trim().toLowerCase() === "plus";
  return [...(isPlus ? PLUS_DEFAULT_DATA_BARS : OTHER_DEFAULT_DATA_BARS)];
}

export function normalizeInputValue(value) {
  const text = value.trim();
  return text ? text : null;
}

export function resolveActiveSourceName(
  settings,
  { format = "full", locale = "zh" } = {},
) {
  const activeTarget = settings?.activeTarget || { type: "official" };
  const isOfficial = !activeTarget || activeTarget.type === "official";

  if (isOfficial) {
    if (format === "short") {
      return locale === "en" ? "Official" : "官方";
    }
    return locale === "en" ? "Official Codex CLI" : "官方 Codex CLI";
  }

  if (activeTarget.type === "siteKey") {
    const sites = settings?.sites || [];
    const site = sites.find((s) => s.id === activeTarget.siteId);
    const key = site?.keys?.find((k) => k.id === activeTarget.keyId);
    const siteName = site?.name || (locale === "en" ? "Relay" : "中转站");
    const keyName = key?.name || "Key";

    if (format === "short") {
      return key?.name || siteName;
    }
    return `${siteName} · ${keyName}`;
  }

  return locale === "en" ? "Official" : "官方";
}
