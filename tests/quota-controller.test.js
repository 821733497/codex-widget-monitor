import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createQuotaController } from "../src/app/quota-controller.js";
import { createAppState } from "../src/app/state.js";

describe("额度刷新定时器", () => {
  let originalWindow;

  beforeEach(() => {
    originalWindow = globalThis.window;
    vi.useFakeTimers();
    globalThis.window = globalThis;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it("刷新进行中不会并发启动第二个请求", async () => {
    const pendingQuota = deferred();
    const { controller, service, state } = createFixture(() => pendingQuota.promise);

    const first = controller.refreshQuota();
    const second = controller.refreshQuota();

    expect(service.commands.getQuota).toHaveBeenCalledTimes(1);
    pendingQuota.resolve(quotaResult());
    await Promise.all([first, second]);
    expect(service.commands.getQuota).toHaveBeenCalledTimes(2);
    expect(state.loading).toBe(false);
  });

  it("忙碌期间多个请求只追加一次尾随刷新", async () => {
    const firstQuota = deferred();
    const secondQuota = deferred();
    const { controller, service, state } = createFixture(
      vi.fn()
        .mockImplementationOnce(() => firstQuota.promise)
        .mockImplementationOnce(() => secondQuota.promise)
    );

    const first = controller.refreshQuota();
    const second = controller.refreshQuota();
    const third = controller.refreshQuota();

    expect(service.commands.getQuota).toHaveBeenCalledOnce();
    firstQuota.resolve(quotaResult({ id: "first" }));
    await vi.waitFor(() => expect(service.commands.getQuota).toHaveBeenCalledTimes(2));
    secondQuota.resolve(quotaResult({ id: "latest" }));
    await Promise.all([first, second, third]);

    expect(service.commands.getQuota).toHaveBeenCalledTimes(2);
    expect(state.quota.id).toBe("latest");
    expect(state.loading).toBe(false);
  });

  it("失败保留旧快照且尾随刷新继续执行", async () => {
    const failedQuota = deferred();
    const latestQuota = deferred();
    const { controller, service, state, logger } = createFixture(
      vi.fn()
        .mockImplementationOnce(() => failedQuota.promise)
        .mockImplementationOnce(() => latestQuota.promise)
    );
    const previousQuota = quotaResult({ id: "previous" });
    state.quota = previousQuota;
    state.resetCreditExpiries = ["2026-01-01T00:00:00Z"];
    state.resetCreditExpiriesStatus = "success";

    const first = controller.refreshQuota();
    const trailing = controller.refreshQuota();
    failedQuota.reject(new Error("第一次失败"));
    await vi.waitFor(() => expect(service.commands.getQuota).toHaveBeenCalledTimes(2));

    expect(state.quota).toBe(previousQuota);
    expect(state.resetCreditExpiries).toEqual(["2026-01-01T00:00:00Z"]);
    latestQuota.resolve(quotaResult({ id: "latest" }));
    await Promise.all([first, trailing]);

    expect(state.quota.id).toBe("latest");
    expect(state.errors.quota).toBe("");
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("单次失败保留最后成功值和错误", async () => {
    const { controller, state } = createFixture(async () => {
      throw new Error("网络失败");
    });
    const previousQuota = quotaResult({ id: "previous" });
    state.quota = previousQuota;

    await controller.refreshQuota();

    expect(state.quota).toBe(previousQuota);
    expect(state.errors.quota).toContain("网络失败");
    expect(state.loading).toBe(false);
  });

  it("按设置间隔自动刷新", async () => {
    const { controller, service, state } = createFixture(async () => quotaResult());
    state.settings.refreshIntervalMinutes = 1;

    controller.scheduleAutoRefresh();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(service.commands.getQuota).toHaveBeenCalledTimes(1);
  });

  it("切换来源后不接收旧来源的延迟结果", async () => {
    const pending = deferred();
    const { controller, state } = createFixture(() => pending.promise);
    const refresh = controller.refreshQuota();
    state.settings.activeTarget = { type: "siteKey", siteId: "new", keyId: "k" };
    state.quota = null;
    pending.resolve(quotaResult({ id: "old-source" }));
    await refresh;
    expect(state.quota).toBeNull();
    expect(state.errors.quota).toBe("");
  });

  it("多来源预取写入独立缓存，单源失败不污染当前主额度且支持节流与强制刷新", async () => {
    const getQuotaForTarget = vi.fn(async (target) => {
      if (target.type === "official") return quotaResult({ id: "official-latest" });
      if (target.keyId === "key-1") return quotaResult({ id: "site-key-1" });
      throw new Error("site key-2 network failed");
    });
    const { controller, service, state } = createFixture(vi.fn(), getQuotaForTarget);
    state.settings.activeTarget = { type: "official" };
    state.settings.sites = [
      {
        id: "site-a",
        keys: [{ id: "key-1" }, { id: "key-2" }]
      }
    ];
    state.quota = quotaResult({ id: "current-active" });

    await controller.refreshAllSources({ staleMs: 30_000 });

    expect(service.commands.getQuotaForTarget).toHaveBeenCalledTimes(3);
    expect(state.sourceQuotas["official"].quota.id).toBe("official-latest");
    expect(state.sourceQuotas["official"].error).toBe("");
    expect(state.sourceQuotas["official"].loading).toBe(false);
    expect(state.sourceQuotas["siteKey:site-a:key-1"].quota.id).toBe("site-key-1");
    expect(state.sourceQuotas["siteKey:site-a:key-1"].error).toBe("");
    expect(state.sourceQuotas["siteKey:site-a:key-2"].quota).toBeNull();
    expect(state.sourceQuotas["siteKey:site-a:key-2"].error).toContain("site key-2 network failed");
    expect(state.quota.id).toBe("official-latest");

    // 节流窗口内再次非强制预取：已成功的来源跳过，失败的来源（updatedAt=0）会重试。
    await controller.refreshAllSources({ staleMs: 30_000 });
    expect(service.commands.getQuotaForTarget).toHaveBeenCalledTimes(4);

    // 强制预取应忽略节流窗口重新拉取全部 3 个来源。
    await controller.refreshAllSources({ force: true, staleMs: 30_000 });
    expect(service.commands.getQuotaForTarget).toHaveBeenCalledTimes(7);
  });
});

function createFixture(getQuota, getQuotaForTarget = vi.fn()) {
  const state = createAppState();
  const service = {
    commands: {
      getQuota: vi.fn(getQuota),
      getQuotaForTarget: vi.fn(getQuotaForTarget),
      getResetCreditExpiries: vi.fn()
    }
  };
  const logger = { error: vi.fn() };
  const controller = createQuotaController({
    state,
    service,
    render: vi.fn(),
    normalizeError: (error) => String(error),
    logger
  });
  return { controller, service, state, logger };
}

function quotaResult(overrides = {}) {
  return {
    resetsAt: null,
    resetCredits: { expiries: [] },
    ...overrides
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, reject, resolve };
}
