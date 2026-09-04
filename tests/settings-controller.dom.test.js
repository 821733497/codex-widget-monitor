// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { i18n } from "../src/app/constants.js";
import { createElements } from "../src/app/dom.js";
import { createSettingsController } from "../src/app/settings-controller.js";
import { createAppState } from "../src/app/state.js";
import { loadApplicationMarkup } from "./dom-test-utils.js";

describe("设置面板", () => {
  it("修改选项后自动保存并保持面板开启，启动最新调度", async () => {
    const fixture = createFixture(vi.fn().mockResolvedValue({}));
    fixture.open();
    fixture.els.autoUpdateSwitch.checked = false;
    fixture.els.autoUpdateSwitch.dispatchEvent(
      new Event("change", { bubbles: true }),
    );

    await vi.waitFor(() =>
      expect(fixture.persistSettings).toHaveBeenCalledOnce(),
    );
    await vi.waitFor(() => expect(fixture.state.savingSettings).toBe(false));
    expect(fixture.state.settingsOpen).toBe(true);
    expect(fixture.state.errors.settings).toBe("");
    expect(fixture.scheduleAutoRefresh).toHaveBeenCalledOnce();
    expect(fixture.refreshQuota).toHaveBeenCalledOnce();
    expect(fixture.scheduleUpdateChecks).toHaveBeenCalledOnce();

    fixture.els.settingsCloseBtn.click();
    expect(fixture.state.settingsOpen).toBe(false);
  });

  it("保存失败时留在面板并通过 aria-live 展示错误", async () => {
    const fixture = createFixture(
      vi.fn().mockRejectedValue(new Error("磁盘写入失败")),
    );
    fixture.open();
    fixture.els.autoUpdateSwitch.checked = false;
    fixture.els.autoUpdateSwitch.dispatchEvent(
      new Event("change", { bubbles: true }),
    );

    await vi.waitFor(() => expect(fixture.state.savingSettings).toBe(false));
    expect(fixture.state.settingsOpen).toBe(true);
    expect(fixture.state.errors.settings).toBe("磁盘写入失败");
    expect(fixture.els.settingsError.hidden).toBe(false);
    expect(fixture.els.settingsError.textContent).toBe("磁盘写入失败");
    expect(fixture.els.settingsError.getAttribute("aria-live")).toBe(
      "assertive",
    );
  });

  it("恢复仪表窗口设置并在修改后自动保存", async () => {
    const fixture = createFixture(vi.fn().mockResolvedValue({}));
    fixture.state.settings.meterWindow = "primary";
    fixture.open();

    expect(fixture.els.meterWindowSelect.value).toBe("primary");
    expect(
      fixture.els.meterWindowSelect.closest(".settings-field").hidden,
    ).toBe(false);
    expect(fixture.els.meterWindowSelect.tabIndex).toBe(-1);
    expect(
      fixture.els.meterWindowSelect
        .closest(".custom-select-shell")
        .querySelector("button").tabIndex,
    ).toBe(0);

    fixture.els.meterWindowSelect.value = "secondary";
    fixture.els.meterWindowSelect.dispatchEvent(
      new Event("change", { bubbles: true }),
    );
    await vi.waitFor(() =>
      expect(fixture.persistSettings).toHaveBeenCalledOnce(),
    );

    const [updateSettings] = fixture.persistSettings.mock.calls[0];
    const savedSettings = updateSettings({
      ...fixture.state.settings,
      meterWindow: "primary",
    });
    expect(savedSettings.meterWindow).toBe("secondary");
  });

  it("修改悬浮球大小后自动保存并生效", async () => {
    const fixture = createFixture(vi.fn().mockResolvedValue({}));
    fixture.open();

    expect(fixture.els.ballSizeSelect.value).toBe("small");
    fixture.els.ballSizeSelect.value = "medium";
    fixture.els.ballSizeSelect.dispatchEvent(
      new Event("change", { bubbles: true }),
    );

    await vi.waitFor(() =>
      expect(fixture.persistSettings).toHaveBeenCalledOnce(),
    );
    const [updateSettings] = fixture.persistSettings.mock.calls[0];
    expect(updateSettings(fixture.state.settings).ballSize).toBe("medium");
  });

  it("自动数据栏按 Plus 套餐展示且保存其他设置仍保持自动", async () => {
    const fixture = createFixture(vi.fn().mockResolvedValue({}));
    fixture.state.quota = { planType: "plus" };
    fixture.open();

    expect(fixture.els.dataBarSelects.map((select) => select.value)).toEqual([
      "fiveHour",
      "weekly",
      "quotaEstimate",
    ]);
    expect(fixture.els.dataBarLabels.map((label) => label.textContent)).toEqual(
      ["数据栏 1", "数据栏 2", "数据栏 3"],
    );

    fixture.els.autoStartSwitch.checked = true;
    fixture.els.autoStartSwitch.dispatchEvent(
      new Event("change", { bubbles: true }),
    );
    await vi.waitFor(() =>
      expect(fixture.persistSettings).toHaveBeenCalledOnce(),
    );
    const [updateSettings] = fixture.persistSettings.mock.calls[0];
    expect(updateSettings(fixture.state.settings).dataBars).toBeNull();
  });

  it("修改任一数据栏后自动保存完整布局并允许重复", async () => {
    const fixture = createFixture(vi.fn().mockResolvedValue({}));
    fixture.state.quota = { planType: "plus" };
    fixture.open();

    fixture.els.dataBarSelects[0].value = "weekly";
    fixture.els.dataBarSelects[0].dispatchEvent(
      new Event("change", { bubbles: true }),
    );

    expect(fixture.state.settingsDraft.dataBars).toEqual([
      "weekly",
      "weekly",
      "quotaEstimate",
    ]);

    await vi.waitFor(() =>
      expect(fixture.persistSettings).toHaveBeenCalledOnce(),
    );
    const [updateSettings] = fixture.persistSettings.mock.calls[0];
    expect(updateSettings(fixture.state.settings).dataBars).toEqual([
      "weekly",
      "weekly",
      "quotaEstimate",
    ]);
  });

  it("点击关闭按钮关闭面板", () => {
    const fixture = createFixture(vi.fn().mockResolvedValue({}));
    fixture.open();
    expect(fixture.state.settingsOpen).toBe(true);

    fixture.els.settingsCloseBtn.click();
    expect(fixture.state.settingsOpen).toBe(false);
  });

  it("macOS 可预览并自动保存隐藏 Dock 图标设置", async () => {
    const fixture = createFixture(vi.fn().mockResolvedValue({}), {
      isMacOS: true,
    });
    fixture.state.settings.hideDockIcon = false;
    fixture.open();

    expect(fixture.els.hideDockIconRow.hidden).toBe(false);
    expect(fixture.els.hideDockIconSwitch.disabled).toBe(false);
    expect(fixture.els.hideDockIconSwitch.checked).toBe(false);
    expect(fixture.els.hideDockIconLabel.textContent).toBe("隐藏 Dock 图标");

    fixture.els.hideDockIconSwitch.checked = true;
    fixture.els.hideDockIconSwitch.dispatchEvent(
      new Event("change", { bubbles: true }),
    );
    expect(fixture.state.settingsDraft.hideDockIcon).toBe(true);

    await vi.waitFor(() =>
      expect(fixture.persistSettings).toHaveBeenCalledOnce(),
    );
    const [updateSettings] = fixture.persistSettings.mock.calls[0];
    expect(
      updateSettings({ ...fixture.state.settings, hideDockIcon: false })
        .hideDockIcon,
    ).toBe(true);
  });

  it("修改输入框并变更后自动保存", async () => {
    const fixture = createFixture(vi.fn().mockResolvedValue({}));
    fixture.open();

    fixture.els.refreshIntervalInput.value = "15";
    fixture.els.refreshIntervalInput.dispatchEvent(
      new Event("change", { bubbles: true }),
    );

    await vi.waitFor(() =>
      expect(fixture.persistSettings).toHaveBeenCalledOnce(),
    );
    const [updateSettings] = fixture.persistSettings.mock.calls[0];
    expect(updateSettings(fixture.state.settings).refreshIntervalMinutes).toBe(
      15,
    );
  });

  it("非 macOS 隐藏并禁用 Dock 设置", () => {
    const fixture = createFixture(vi.fn().mockResolvedValue({}), {
      isMacOS: false,
    });
    fixture.open();

    expect(fixture.els.hideDockIconRow.hidden).toBe(true);
    expect(fixture.els.hideDockIconSwitch.disabled).toBe(true);
    fixture.els.hideDockIconSwitch.focus();
    expect(document.activeElement).not.toBe(fixture.els.hideDockIconSwitch);
  });

  it("英文设置展示数据栏和 Dock 文案", () => {
    const fixture = createFixture(vi.fn().mockResolvedValue({}), {
      locale: "en",
      isMacOS: true,
    });
    fixture.state.settings.locale = "en";
    fixture.open();

    expect(fixture.els.dataBarLabels.map((label) => label.textContent)).toEqual(
      ["Data bar 1", "Data bar 2", "Data bar 3"],
    );
    expect(
      Array.from(
        fixture.els.dataBarSelects[0].options,
        (option) => option.textContent,
      ),
    ).toEqual([
      "5h window",
      "Weekly window",
      "Reset credits",
      "Quota estimate",
    ]);
    expect(fixture.els.hideDockIconLabel.textContent).toBe("Hide Dock icon");
    expect(fixture.els.hideDockIconHint.textContent).toContain("macOS only");
  });

  it("Escape 关闭面板并恢复打开按钮焦点", () => {
    const fixture = createFixture(vi.fn().mockResolvedValue({}));
    fixture.open();
    expect(document.activeElement).toBe(fixture.els.settingsCloseBtn);

    fixture.els.settingsCloseBtn.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(fixture.state.settingsOpen).toBe(false);
    expect(document.activeElement).toBe(fixture.els.settingsBtn);
  });
  it("打开和关闭设置面板时调用 adjustWindowForSettings 调整窗口尺寸", () => {
    const fixture = createFixture(vi.fn().mockResolvedValue({}));
    fixture.open();
    expect(fixture.adjustWindowForSettings).toHaveBeenCalledWith(true);

    fixture.els.settingsCloseBtn.click();
    expect(fixture.adjustWindowForSettings).toHaveBeenCalledWith(false);
  });

  it("在悬浮球模式下打开并关闭设置面板不会切换为面板模式", async () => {
    const setWidgetMode = vi.fn().mockResolvedValue(undefined);
    const fixture = createFixture(vi.fn().mockResolvedValue({}), {
      setWidgetMode,
    });
    fixture.state.widgetMode = "ball";
    await fixture.open();
    expect(setWidgetMode).not.toHaveBeenCalled();

    await fixture.els.settingsCloseBtn.click();
    expect(setWidgetMode).not.toHaveBeenCalled();
    expect(fixture.adjustWindowForSettings).toHaveBeenCalledWith(false);
  });
});

function createFixture(
  persistSettings,
  { locale = "zh", isMacOS = false, setWidgetMode } = {},
) {
  loadApplicationMarkup();
  const els = createElements();
  const state = createAppState();
  const scheduleAutoRefresh = vi.fn();
  const refreshQuota = vi.fn();
  const scheduleUpdateChecks = vi.fn();
  const adjustWindowForSettings = vi.fn();
  let controller;
  const render = vi.fn(() => controller.renderSettingsPanel(i18n[locale]));
  controller = createSettingsController({
    els,
    state,
    service: {
      isAvailable: () => true,
      dialog: { chooseCodexPath: vi.fn() },
    },
    render,
    renderLocale: () => locale,
    persistSettings,
    normalizeError: (error) => error.message,
    readCurrentWindowPosition: vi.fn().mockResolvedValue(null),
    mergeWindowPosition: (settings) => settings,
    setUpdateStatus: vi.fn(),
    scheduleAutoRefresh,
    refreshQuota,
    scheduleUpdateChecks,
    logger: { error: vi.fn() },
    clearPanelClick: vi.fn(),
    adjustWindowForSettings,
    setWidgetMode,
    isMacOS,
  });
  controller.bindEvents();

  return {
    adjustWindowForSettings,
    controller,
    els,
    state,
    persistSettings,
    scheduleAutoRefresh,
    refreshQuota,
    scheduleUpdateChecks,
    open() {
      els.settingsBtn.focus();
      els.settingsBtn.click();
    },
  };
}
