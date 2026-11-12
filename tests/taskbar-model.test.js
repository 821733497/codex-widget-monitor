import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTaskbarView } from "../src/app/taskbar-model.js";

function fixture(quota = null, official = true) {
  return {
    settings: {
      locale: "zh",
      taskbarEnabled: true,
      activeTarget: official ? { type: "official" } : { type: "siteKey", siteId: "s", keyId: "k" },
      sites: [{ id: "s", name: "中转站", baseUrl: "https://private.invalid", keys: [{ id: "k", name: "工作", key: "secret-key" }] }],
    },
    quota,
    sourceQuotas: {},
    loading: false,
    errors: {},
  };
}

describe("任务栏四栏数据与弹窗多源详情", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T15:27:12+08:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("官方沿用用户三栏配置并在最后一列展示距重置倒计时，明确估算不是余额", () => {
    const fiveHourReset = new Date("2026-11-12T19:52:00+08:00").toISOString();
    const state = fixture({
      planType: "plus",
      primary: { remainingPercent: 84, windowDurationMins: 300, resetsAt: fiveHourReset },
      secondary: { remainingPercent: 96, windowDurationMins: 10080 },
      quotaEstimate: { current: { status: "ready", fullQuotaUsd: 125.6 } },
      resetCredits: { availableCount: 2 },
    });
    let view = buildTaskbarView(state);
    expect(view.metrics.map((m) => m.value)).toEqual(["84%", "96%", "≈$126", "4时 25分"]);
    expect(view.metrics[3].label).toBe("距重置");
    expect(view.metrics[3].resetAt).toBe(fiveHourReset);
    expect(view.metrics[3].detail).toContain("5h重置：");
    expect(view.metrics[2].detail).toContain("非余额或账单");

    state.settings.dataBars = ["resetCredits", "weekly", "fiveHour"];
    view = buildTaskbarView(state);
    expect(view.metrics.map((m) => m.value)).toEqual(["2", "96%", "84%", "4时 25分"]);
  });

  it("三方订阅显示金额、真实窗口周期及距重置倒计时", () => {
    const future = new Date("2026-11-16T00:00:00+08:00").toISOString();
    const view = buildTaskbarView(
      fixture(
        {
          credits: { type: "sub2api", limit: 125, remaining: 119.55, todayCost: 5.45 },
          secondary: { remainingPercent: 96, windowDurationMins: 10080, resetsAt: future },
        },
        false,
      ),
    );
    expect(view.metrics.map((m) => m.value)).toEqual(["$5.45", "$119.55", "96%", "3天 8时 33分"]);
    expect(view.metrics[2].label).toBe("周剩余");
    expect(view.metrics[3].label).toBe("距重置");
    expect(view.metrics[3].resetAt).toBe(future);
    expect(view.metrics[3].detail).toContain("重置时间：");
    expect(view.account).toBe("工作");
  });

  it("钱包忽略内部兼容百分比，缺失金额不伪造零，无周期重置显示占位", () => {
    const state = fixture(
      { credits: { type: "sub2api", isUnrestricted: true, limit: null, balance: 78.6, todayCost: null }, secondary: { remainingPercent: 100 } },
      false,
    );
    const view = buildTaskbarView(state);
    expect(view.metrics.map((m) => m.value)).toEqual(["--", "$78.60", "按量", "--"]);
    expect(JSON.stringify(view.metrics)).not.toContain("100%");
    state.quota.credits.currency = "CNY";
    expect(buildTaskbarView(state).metrics[1].value).toBe("¥78.60");
    state.quota.credits.balance = 0.5;
    expect(buildTaskbarView(state).metrics[1].warning).toBe(true);
  });

  it("切换后无数据只显示占位，同时为下拉列表中的各供应商生成脱敏具体信息", () => {
    const state = fixture(null, false);
    state.loading = true;
    expect(buildTaskbarView(state).metrics.map((m) => m.value)).toEqual(["--", "--", "--", "--"]);

    state.quota = { credits: { type: "sub2api", limit: 10, remaining: 3, todayCost: 1 } };
    state.errors.quota = "网络失败";
    state.sourceQuotas.official = {
      quota: {
        planType: "plus",
        primary: { remainingPercent: 90, windowDurationMins: 300 },
        secondary: { remainingPercent: 80, windowDurationMins: 10080 },
      },
      loading: false,
      error: "",
    };

    const view = buildTaskbarView(state, [
      { label: "官方 Codex CLI", active: false, target: { type: "official" } },
      { label: "工作", group: "中转站", active: true, target: state.settings.activeTarget },
    ]);
    expect(view.status).toBe("缓存");
    expect(view.metrics[1].warning).toBe(true);
    expect(view.sources[0].plan).toBe("plus");
    expect(view.sources[0].metrics.map((m) => m.value)).toEqual(["90%", "80%", "--", "--"]);
    expect(view.sources[1].status).toBe("缓存");
    expect(view.sources[1].metrics.map((m) => m.value)).toEqual(["$1.00", "$3.00", "--", "--"]);
    expect(JSON.stringify(view)).not.toMatch(/secret-key|private.invalid/);
  });
});
