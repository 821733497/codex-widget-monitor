import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../src/app/constants.js";
import {
  normalizeBallDock,
  normalizeBallSize,
  normalizeBallSnapStyle,
  normalizeDataBars,
  normalizeInputValue,
  normalizeSettings,
  normalizeTheme,
  normalizeWindowPosition,
  resolveActiveSourceName,
  resolveActiveThemeName,
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

  it("悬浮球尺寸仅允许 small 或 medium，非法值回退 small", () => {
    expect(normalizeBallSize("small")).toBe("small");
    expect(normalizeBallSize("medium")).toBe("medium");
    expect(normalizeBallSize("invalid")).toBe("small");
    expect(normalizeSettings({ ballSize: "medium" }).ballSize).toBe("medium");
    expect(normalizeSettings({ ballSize: "large" }).ballSize).toBe("small");
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

  it("吸附样式仅允许 ball 或 bar，非法值回退 ball", () => {
    expect(normalizeBallSnapStyle("ball")).toBe("ball");
    expect(normalizeBallSnapStyle("bar")).toBe("bar");
    expect(normalizeBallSnapStyle("invalid")).toBe("ball");
    expect(normalizeBallSnapStyle(undefined)).toBe("ball");
    expect(normalizeSettings({ ballSnapStyle: "bar" }).ballSnapStyle).toBe(
      "bar",
    );
    expect(normalizeSettings({ ballSnapStyle: "bad" }).ballSnapStyle).toBe(
      "ball",
    );
    expect(normalizeSettings({}).ballSnapStyle).toBe("ball");
  });

  it("主题标准化支持 7 套主题并兼容 holo/非法值回退", () => {
    expect(normalizeTheme("default")).toBe("default");
    expect(normalizeTheme("holo")).toBe("default");
    expect(normalizeTheme("pyro")).toBe("pyro");
    expect(normalizeTheme("emerald")).toBe("emerald");
    expect(normalizeTheme("cyber")).toBe("cyber");
    expect(normalizeTheme("obsidian")).toBe("obsidian");
    expect(normalizeTheme("crimson")).toBe("crimson");
    expect(normalizeTheme("sakura")).toBe("sakura");
    expect(normalizeTheme("unknown")).toBe("default");
    expect(normalizeTheme(undefined)).toBe("default");
    expect(normalizeSettings({ theme: "emerald" }).theme).toBe("emerald");
    expect(normalizeSettings({ theme: "cyber" }).theme).toBe("cyber");
    expect(normalizeSettings({ theme: "obsidian" }).theme).toBe("obsidian");
    expect(normalizeSettings({ theme: "crimson" }).theme).toBe("crimson");
    expect(normalizeSettings({ theme: "sakura" }).theme).toBe("sakura");
    expect(normalizeSettings({ theme: "unknown" }).theme).toBe("default");
  });

  it("主题名称解析支持中英文纯颜色展示", () => {
    expect(resolveActiveThemeName("default", "zh")).toBe("天青");
    expect(resolveActiveThemeName("default", "en")).toBe("Azure");
    expect(resolveActiveThemeName("holo", "zh")).toBe("天青");
    expect(resolveActiveThemeName("pyro", "zh")).toBe("赤金");
    expect(resolveActiveThemeName("emerald", "zh")).toBe("碧翠");
    expect(resolveActiveThemeName("cyber", "zh")).toBe("幻紫");
    expect(resolveActiveThemeName("obsidian", "zh")).toBe("曜金");
    expect(resolveActiveThemeName("crimson", "zh")).toBe("绯红");
    expect(resolveActiveThemeName("sakura", "zh")).toBe("落樱");
    expect(resolveActiveThemeName("sakura", "en")).toBe("Sakura Pink");
    expect(resolveActiveThemeName("invalid", "zh")).toBe("天青");
  });
});
