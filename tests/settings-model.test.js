import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../src/app/constants.js";
import {
  normalizeBallDock,
  normalizeBallSize,
  normalizeDataBars,
  normalizeInputValue,
  normalizeSettings,
  normalizeWindowPosition,
  resolveActiveSourceName,
  resolveDataBars,
} from "../src/app/settings-model.js";

describe("设置标准化", () => {
  it("保留合法边界并修正坐标", () => {
    const settings = normalizeSettings({
      refreshIntervalMinutes: 1440,
      locale: "en",
      theme: "pyro",
      meterWindow: "primary",
      dataBars: ["weekly", "weekly", "quotaEstimate"],
      logLevel: "debug",
      hideDockIcon: true,
      widgetMode: "ball",
      panelPosition: { x: -10.6, y: 20.4 },
      ballDock: "right",
    });

    expect(settings).toMatchObject({
      refreshIntervalMinutes: 1440,
      locale: "en",
      theme: "pyro",
      meterWindow: "primary",
      dataBars: ["weekly", "weekly", "quotaEstimate"],
      logLevel: "debug",
      hideDockIcon: true,
      widgetMode: "ball",
      panelPosition: { x: -11, y: 20 },
      ballDock: "right",
    });
  });

  it.each([0, 1441, Number.NaN])("无效刷新间隔 %s 回退默认值", (value) => {
    expect(
      normalizeSettings({ refreshIntervalMinutes: value })
        .refreshIntervalMinutes,
    ).toBe(DEFAULT_SETTINGS.refreshIntervalMinutes);
  });

  it("旧配置和非法 Dock 设置回退显示图标", () => {
    expect(normalizeSettings({}).hideDockIcon).toBe(false);
    expect(normalizeSettings({ hideDockIcon: "true" }).hideDockIcon).toBe(
      false,
    );
  });

  it("拒绝无效位置、停靠方向并清理空文本", () => {
    expect(normalizeWindowPosition({ x: "bad", y: 1 })).toBeNull();
    expect(normalizeBallDock("top")).toBeNull();
    expect(normalizeInputValue("   ")).toBeNull();
    expect(normalizeInputValue("  value  ")).toBe("value");
  });

  it("数据栏严格要求三个合法值并允许重复", () => {
    expect(normalizeDataBars(["weekly", "weekly", "quotaEstimate"])).toEqual([
      "weekly",
      "weekly",
      "quotaEstimate",
    ]);
    expect(normalizeDataBars(["weekly", "quotaEstimate"])).toBeNull();
    expect(normalizeDataBars(["weekly", "bad", "quotaEstimate"])).toBeNull();
  });

  it("未自定义数据栏时按套餐选择默认布局", () => {
    expect(resolveDataBars(null, " PLUS ")).toEqual([
      "fiveHour",
      "weekly",
      "quotaEstimate",
    ]);
    expect(resolveDataBars(null, "business")).toEqual([
      "quotaEstimate",
      "weekly",
      "resetCredits",
    ]);
    expect(resolveDataBars(null, null)).toEqual([
      "quotaEstimate",
      "weekly",
      "resetCredits",
    ]);
    expect(
      resolveDataBars(["fiveHour", "fiveHour", "fiveHour"], "plus"),
    ).toEqual(["fiveHour", "fiveHour", "fiveHour"]);
  });

  it("悬浮球尺寸仅允许 small 或 medium，非法值回退 medium", () => {
    expect(normalizeBallSize("small")).toBe("small");
    expect(normalizeBallSize("medium")).toBe("medium");
    expect(normalizeBallSize("invalid")).toBe("medium");
    expect(normalizeSettings({ ballSize: "small" }).ballSize).toBe("small");
    expect(normalizeSettings({ ballSize: "large" }).ballSize).toBe("medium");
  });

  it("正确解析数据源名称（官方与自定义站点Key）", () => {
    // 官方默认
    expect(resolveActiveSourceName({})).toBe("官方 Codex CLI");
    expect(resolveActiveSourceName({}, { format: "short" })).toBe("官方");
    expect(resolveActiveSourceName({}, { locale: "en" })).toBe(
      "Official Codex CLI",
    );
    expect(resolveActiveSourceName({}, { format: "short", locale: "en" })).toBe(
      "Official",
    );

    // 中转站站点与Key
    const customSettings = {
      activeTarget: { type: "siteKey", siteId: "site-1", keyId: "key-1" },
      sites: [
        {
          id: "site-1",
          name: "DeepSeek",
          keys: [{ id: "key-1", name: "MainKey" }],
        },
      ],
    };
    expect(resolveActiveSourceName(customSettings)).toBe("DeepSeek · MainKey");
    expect(resolveActiveSourceName(customSettings, { format: "short" })).toBe(
      "MainKey",
    );

    // 缺少 Key 时的回退
    const fallbackSettings = {
      activeTarget: {
        type: "siteKey",
        siteId: "site-1",
        keyId: "non-existent",
      },
      sites: [{ id: "site-1", name: "DeepSeek", keys: [] }],
    };
    expect(resolveActiveSourceName(fallbackSettings)).toBe("DeepSeek · Key");
    expect(resolveActiveSourceName(fallbackSettings, { format: "short" })).toBe(
      "DeepSeek",
    );
  });
});
