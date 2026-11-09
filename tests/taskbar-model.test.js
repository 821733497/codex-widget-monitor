import { describe, expect, it } from "vitest";
import { buildTaskbarView } from "../src/app/taskbar-model.js";

function fixture(quota = null, official = true) {
  return {
    settings: { locale: "zh", taskbarEnabled: true, activeTarget: official ? { type: "official" } : { type: "siteKey", siteId: "s", keyId: "k" }, sites: [{ id: "s", name: "中转站", baseUrl: "https://private.invalid", keys: [{ id: "k", name: "工作", key: "secret-key" }] }] },
    quota, loading: false, errors: {},
  };
}

describe("任务栏三栏数据", () => {
  it("官方沿用用户三栏配置，并明确估算不是余额", () => {
    const state = fixture({ planType: "plus", primary: { remainingPercent: 84, windowDurationMins: 300 }, secondary: { remainingPercent: 96, windowDurationMins: 10080 }, quotaEstimate: { current: { status: "ready", fullQuotaUsd: 125.6 } }, resetCredits: { availableCount: 2 } });
    let view = buildTaskbarView(state);
    expect(view.metrics.map(m => m.value)).toEqual(["84%", "96%", "≈$126"]);
    expect(view.metrics[2].detail).toContain("非余额或账单");
    state.settings.dataBars = ["resetCredits", "weekly", "fiveHour"];
    view = buildTaskbarView(state);
    expect(view.metrics.map(m => m.value)).toEqual(["2", "96%", "84%"]);
  });

  it("三方订阅显示金额和真实窗口周期", () => {
    const view = buildTaskbarView(fixture({ credits: { type: "sub2api", limit: 125, remaining: 119.55, todayCost: 5.45 }, secondary: { remainingPercent: 96, windowDurationMins: 10080 } }, false));
    expect(view.metrics.map(m => m.value)).toEqual(["$5.45", "$119.55", "96%"]);
    expect(view.metrics[2].label).toBe("周剩余");
    expect(view.account).toBe("工作");
  });

  it("钱包忽略内部兼容百分比，缺失金额不伪造零", () => {
    const state = fixture({ credits: { type: "sub2api", isUnrestricted: true, limit: null, balance: 78.6, todayCost: null }, secondary: { remainingPercent: 100 } }, false);
    const view = buildTaskbarView(state);
    expect(view.metrics.map(m => m.value)).toEqual(["--", "$78.60", "按量"]);
    expect(JSON.stringify(view.metrics)).not.toContain("100%");
    state.quota.credits.currency = "CNY";
    expect(buildTaskbarView(state).metrics[1].value).toBe("¥78.60");
    state.quota.credits.balance = 0.5;
    expect(buildTaskbarView(state).metrics[1].warning).toBe(true);
  });

  it("切换后无数据只显示占位，同源失败明确标记缓存且不泄漏密钥", () => {
    const state = fixture(null, false);
    state.loading = true;
    expect(buildTaskbarView(state).metrics.map(m => m.value)).toEqual(["--", "--", "--"]);
    state.quota = { credits: { type: "sub2api", limit: 10, remaining: 3, todayCost: 1 } };
    state.errors.quota = "网络失败";
    const view = buildTaskbarView(state, [{ label: "工作", group: "中转站", target: state.settings.activeTarget }]);
    expect(view.status).toBe("缓存");
    expect(view.metrics[1].warning).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/secret-key|private.invalid/);
  });
});
