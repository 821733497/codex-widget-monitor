import { describe, expect, it } from "vitest";
import { buildTaskbarView, formatMenubarTitle } from "../src/app/taskbar-model.js";

describe("buildTaskbarView", () => {
  it("maps official windows into taskbar metrics", () => {
    const resetsAt = "2026-11-20T12:00:00Z";
    const view = buildTaskbarView({
      settings: { taskbarEnabled: true, activeTarget: { type: "official" }, sites: [] },
      quota: { planType: "plus", primary: { remainingPercent: 83, windowDurationMins: 300, resetsAt }, secondary: { remainingPercent: 61, windowDurationMins: 10080, resetsAt } },
    });
    expect(view.metrics.map(({ value }) => value)).toEqual(["83%", "61%", "plus", "--"]);
    for (const metric of view.metrics.slice(0, 2)) {
      expect(metric.resetAt).toBeUndefined();
      expect(metric.detail).toContain("重置时间");
    }
    expect(view.enabled).toBe(true);
  });

  it("keeps relay weekly percentages separate from reset countdowns in active and cached sources", () => {
    const target = { type: "siteKey", siteId: "s1", keyId: "k1" };
    const cachedTarget = { ...target, keyId: "k2" };
    const resetsAt = "2026-11-20T12:00:00Z";
    const quota = {
      credits: { type: "sub2api", limit: 125, remaining: 21.89, todayCost: 1.87 },
      secondary: { remainingPercent: 18, windowDurationMins: 10080, resetsAt },
      resetsAt,
    };
    const view = buildTaskbarView({
      settings: { activeTarget: target },
      quota,
      sourceQuotas: { "s1:k2": { quota } },
    }, [{ target }, { target: cachedTarget }]);
    for (const metrics of [view.metrics, ...view.sources.map((source) => source.metrics)]) {
      expect(metrics[2]).toMatchObject({ label: "周剩余", value: "18%" });
      expect(metrics[2].resetAt).toBeUndefined();
      expect(metrics[2].detail).toContain("重置时间");
      expect(metrics[3]).toMatchObject({ label: "距重置", resetAt: resetsAt });
    }
  });

  it("shows relay wallet balances without a fake cycle limit", () => {
    const target = { type: "siteKey", siteId: "s1", keyId: "k1" };
    const view = buildTaskbarView({
      settings: { activeTarget: target, sites: [{ id: "s1", name: "Relay", keys: [{ id: "k1", name: "Main" }] }] },
      quota: { credits: { type: "sub2api", isUnrestricted: true, balance: 12.5, todayCost: 1.25, currency: "USD" } },
    });
    expect(view.site).toBe("Relay");
    expect(view.account).toBe("Main");
    expect(view.metrics.map(({ value }) => value).slice(0, 3)).toEqual(["$1.25", "$12.50", "按量"]);
  });

  it("keeps cached source data and displays its read error", () => {
    const target = { type: "official" };
    const resetsAt = "2026-11-20T12:00:00Z";
    const view = buildTaskbarView({
      settings: { activeTarget: target, sites: [] },
      errors: { quota: "temporarily unavailable" },
      quota: { planType: "plus", resetsAt },
      sourceQuotas: { official: { quota: { planType: "plus", resetsAt }, error: "temporarily unavailable" } },
    }, [{ label: "Official", target, active: true }]);
    expect(view.status).toBe("缓存");
    expect(view.sources[0].error).toBe("temporarily unavailable");
    expect(view.metrics[3].resetAt).toBe(resetsAt);
  });

  it("uses the active source cache instead of leaking the previous source quota", () => {
    const official = { type: "official" };
    const relay = { type: "siteKey", siteId: "s1", keyId: "k1" };
    const view = buildTaskbarView({
      settings: { activeTarget: relay, sites: [{ id: "s1", name: "Relay", keys: [{ id: "k1", name: "Main" }] }] },
      quota: { planType: "plus", primary: { remainingPercent: 99, windowDurationMins: 300 } },
      sourceQuotas: {
        official: { quota: { planType: "plus", primary: { remainingPercent: 99, windowDurationMins: 300 } } },
        "s1:k1": { quota: { credits: { balance: 12.5, todayCost: 1.25, currency: "USD" } } },
      },
    }, [{ target: official }, { target: relay }]);

    expect(view.site).toBe("Relay");
    expect(view.metrics[0].value).toBe("$1.25");
    expect(view.sources[0].metrics[0].value).toBe("99%");
  });

  it("includes glassOpacity from settings or defaults to 50", () => {
    const defaultView = buildTaskbarView({ settings: {} });
    expect(defaultView.glassOpacity).toBe(50);

    const customView = buildTaskbarView({ settings: { glassOpacity: 75 } });
    expect(customView.glassOpacity).toBe(75);
  });
});

describe("formatMenubarTitle", () => {
  it("formats official, cycle relay, and wallet relay quotas concisely", () => {
    const officialView = buildTaskbarView({
      settings: { activeTarget: { type: "official" }, sites: [] },
      quota: {
        planType: "plus",
        primary: { remainingPercent: 83, windowDurationMins: 300 },
        secondary: { remainingPercent: 61, windowDurationMins: 10080 },
      },
    });
    expect(formatMenubarTitle(officialView)).toBe("官方 · 5h 83% · 周 61%");

    const cycleTarget = { type: "siteKey", siteId: "s1", keyId: "k1" };
    const cycleView = buildTaskbarView({
      settings: {
        activeTarget: cycleTarget,
        sites: [{ id: "s1", name: "fcodex", keys: [{ id: "k1", name: "公司自用" }] }],
      },
      quota: {
        credits: { type: "sub2api", limit: 125, remaining: 119.08, todayCost: 0 },
        secondary: { remainingPercent: 95, windowDurationMins: 10080 },
      },
    });
    expect(formatMenubarTitle(cycleView)).toBe("公司自用 · 剩$119.08 · 今$0.00");

    const walletTarget = { type: "siteKey", siteId: "s1", keyId: "k2" };
    const walletView = buildTaskbarView({
      settings: {
        activeTarget: walletTarget,
        sites: [{ id: "s1", name: "Relay", keys: [{ id: "k2", name: "Main" }] }],
      },
      quota: {
        credits: { type: "sub2api", isUnrestricted: true, balance: 12.5, todayCost: 1.25, currency: "USD" },
      },
    });
    expect(formatMenubarTitle(walletView)).toBe("Main · 余$12.50 · 今$1.25");
  });

  it("handles loading, errors, and long key name truncation", () => {
    const loadingView = buildTaskbarView({
      settings: { activeTarget: { type: "official" }, sites: [] },
      loading: true,
    });
    expect(formatMenubarTitle(loadingView)).toBe("官方 · 读取中");

    const errorView = buildTaskbarView({
      settings: { activeTarget: { type: "official" }, sites: [] },
      errors: { quota: "failed" },
    });
    expect(formatMenubarTitle(errorView)).toBe("官方 · 读取失败");

    const longTarget = { type: "siteKey", siteId: "s1", keyId: "k1" };
    const longView = buildTaskbarView({
      settings: {
        activeTarget: longTarget,
        sites: [{ id: "s1", name: "Relay", keys: [{ id: "k1", name: "VeryLongApiKeyName" }] }],
      },
    });
    expect(formatMenubarTitle(longView)).toBe("VeryLongApi… · --");
  });
});
