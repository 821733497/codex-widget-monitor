import { DEFAULT_SETTINGS, RESET_CREDIT_EXPIRY_DISPLAY_LIMIT } from "./constants.js";
import { targetCacheKey } from "./state.js";

export function createQuotaController({ state, service, render, normalizeError, logger }) {
  let activeRefresh = null;
  let refreshPending = false;
  const inFlightTargets = new Map();

  function ensureSourceQuotas() {
    if (!state.sourceQuotas || typeof state.sourceQuotas !== "object") {
      state.sourceQuotas = {};
    }
    return state.sourceQuotas;
  }

  function updateSourceCache(target, patch) {
    const store = ensureSourceQuotas();
    const key = targetCacheKey(target);
    store[key] = { quota: null, error: "", loading: false, updatedAt: 0, ...store[key], ...patch };
  }

  function collectConfiguredTargets() {
    const targets = [{ type: "official" }];
    for (const site of state.settings?.sites || []) {
      for (const key of site?.keys || []) {
        if (site.id && key?.id) {
          targets.push({ type: "siteKey", siteId: site.id, keyId: key.id });
        }
      }
    }
    return targets;
  }

  function refreshQuota() {
    if (activeRefresh) {
      // 刷新参数来自最新设置；忙碌期间只需保留一次尾随刷新。
      refreshPending = true;
      return activeRefresh;
    }

    activeRefresh = drainQuotaRefreshes();
    return activeRefresh;
  }

  async function drainQuotaRefreshes() {
    let shouldRestart = false;
    try {
      do {
        refreshPending = false;
        await refreshQuotaOnce();
      } while (refreshPending);
    } finally {
      activeRefresh = null;
      state.loading = false;
      render();
      shouldRestart = refreshPending;
    }

    // 防御 Promise 收尾与新事件同拍发生；不能把最后一次刷新留在队列外。
    if (shouldRestart) await refreshQuota();
  }

  async function refreshQuotaOnce() {
    const target = state.settings.activeTarget || { type: "official" };
    const source = JSON.stringify(target);
    startQuotaRefresh(target);
    render();

    try {
      const quota = await service.commands.getQuota();
      updateSourceCache(target, { quota, error: "", loading: false, updatedAt: Date.now() });
      if (source !== JSON.stringify(state.settings.activeTarget)) return;
      applyQuotaSuccess(quota);
      const hasAppServerExpiries = applyAppServerResetCreditExpiries(quota);
      render();
      if (!hasAppServerExpiries) {
        refreshResetCreditExpiriesFromHttp();
      }
    } catch (error) {
      updateSourceCache(target, { error: normalizeError(error), loading: false });
      if (source !== JSON.stringify(state.settings.activeTarget)) return;
      applyQuotaError(error);
      render();
    }
  }

  function startQuotaRefresh(target) {
    state.loading = true;
    state.errors.quota = "";
    updateSourceCache(target, { loading: true, error: "" });
    invalidateResetCreditExpiriesRequest();
  }

  function applyQuotaSuccess(quota) {
    state.quota = quota;
    state.errors.quota = "";
    scheduleResetRefresh(state.quota?.resetsAt);
  }

  function applyQuotaError(error) {
    // 临时失败不能抹掉最后一次成功快照和对应重置时间。
    state.errors.quota = normalizeError(error);
    logger?.error("刷新数据失败", error, "frontend.quota");
  }

  function applyAppServerResetCreditExpiries(quota) {
    const expiries = quota?.resetCredits?.expiries;
    if (!Array.isArray(expiries)) return false;

    applyResetCreditExpiriesResult({ expiries });
    return true;
  }

  async function refreshResetCreditExpiriesFromHttp() {
    const requestId = startResetCreditExpiriesRequest();
    render();

    try {
      const result = await service.commands.getResetCreditExpiries();
      if (!isCurrentResetCreditExpiriesRequest(requestId)) return;

      applyResetCreditExpiriesResult(result);
    } catch (error) {
      if (!isCurrentResetCreditExpiriesRequest(requestId)) return;

      applyResetCreditExpiriesError(error);
    } finally {
      if (isCurrentResetCreditExpiriesRequest(requestId)) {
        render();
      }
    }
  }

  function startResetCreditExpiriesRequest() {
    const requestId = state.resetCreditExpiriesRequestId + 1;
    state.resetCreditExpiriesRequestId = requestId;
    state.resetCreditExpiries = [];
    state.resetCreditExpiriesStatus = "loading";
    return requestId;
  }

  function isCurrentResetCreditExpiriesRequest(requestId) {
    return state.resetCreditExpiriesRequestId === requestId;
  }

  function applyResetCreditExpiriesResult(result) {
    const expiries = Array.isArray(result?.expiries) ? result.expiries.slice(0, RESET_CREDIT_EXPIRY_DISPLAY_LIMIT) : [];
    state.resetCreditExpiries = expiries;
    state.resetCreditExpiriesStatus = expiries.length ? "success" : "empty";
  }

  function applyResetCreditExpiriesError(error) {
    state.resetCreditExpiries = [];
    state.resetCreditExpiriesStatus = "error";
    logger?.error("读取重置次数过期时间失败", error, "frontend.quota.resetCredits");
  }

  function invalidateResetCreditExpiriesRequest() {
    state.resetCreditExpiriesRequestId += 1;
  }

  function scheduleResetRefresh(resetsAt) {
    if (state.resetTimer) {
      window.clearTimeout(state.resetTimer);
      state.resetTimer = null;
    }

    if (!resetsAt) return;
    const delay = new Date(resetsAt).getTime() - Date.now() + 1500;
    if (!Number.isFinite(delay) || delay <= 0) return;

    state.resetTimer = window.setTimeout(refreshQuota, Math.min(delay, refreshIntervalMs()));
  }

  function scheduleAutoRefresh() {
    if (state.refreshTimer) {
      window.clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
    state.refreshTimer = window.setInterval(refreshQuota, refreshIntervalMs());
  }

  function refreshIntervalMs() {
    const minutes = Number(state.settings.refreshIntervalMinutes) || DEFAULT_SETTINGS.refreshIntervalMinutes;
    return Math.max(1, Math.min(1440, minutes)) * 60 * 1000;
  }

  async function refreshSourceTarget(target, { force = false, staleMs = 30000 } = {}) {
    if (!service.commands?.getQuotaForTarget) return;
    const key = targetCacheKey(target);
    const activeKey = targetCacheKey(state.settings?.activeTarget);
    if (key === activeKey && activeRefresh) return activeRefresh;

    const existing = ensureSourceQuotas()[key];
    if (!force && existing?.updatedAt && Date.now() - existing.updatedAt < staleMs) {
      return;
    }

    if (inFlightTargets.has(key)) return inFlightTargets.get(key);

    const task = (async () => {
      updateSourceCache(target, { loading: true, error: "" });
      render();
      try {
        const quota = await service.commands.getQuotaForTarget(target);
        updateSourceCache(target, { quota, error: "", loading: false, updatedAt: Date.now() });
        if (targetCacheKey(state.settings?.activeTarget) === key) {
          applyQuotaSuccess(quota);
          applyAppServerResetCreditExpiries(quota);
        }
      } catch (error) {
        updateSourceCache(target, { error: normalizeError(error), loading: false });
      } finally {
        inFlightTargets.delete(key);
        render();
      }
    })();

    inFlightTargets.set(key, task);
    return task;
  }

  async function refreshAllSources(options = {}) {
    if (!service.commands?.getQuotaForTarget) return;
    const targets = collectConfiguredTargets();
    await Promise.allSettled(targets.map((target) => refreshSourceTarget(target, options)));
  }

  return {
    refreshQuota,
    refreshAllSources,
    scheduleAutoRefresh
  };
}
