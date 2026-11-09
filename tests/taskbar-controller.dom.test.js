// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTaskbarController } from "../src/app/taskbar-controller.js";

afterEach(() => vi.restoreAllMocks());

function fixture(windows = true) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(windows ? "Windows NT 10.0" : "Macintosh; Intel Mac OS X");
  document.body.innerHTML = '<div id="basicSettingsScroll"></div>';
  const state = { settings: { activeTarget: { type: "official" }, taskbarEnabled: false }, errors: {}, locale: "zh" };
  const handlers = {};
  const service = { isAvailable: () => true, commands: { setTaskbarEnabled: vi.fn().mockResolvedValue(), showMainWindow: vi.fn().mockResolvedValue() }, events: { emitTo: vi.fn().mockResolvedValue(), listen: vi.fn(async (name, handler) => { handlers[name] = handler; }) } };
  const persistSettings = vi.fn(async update => { state.settings = update(state.settings); });
  const sourcePicker = { buildSourceItems: () => [{ label: "官方", target: { type: "official" } }], cycleToNextSource: vi.fn(), switchSource: vi.fn() };
  const windowController = { hideWindow: vi.fn(), setWidgetMode: vi.fn() };
  const controller = createTaskbarController({ state, service, persistSettings, sourcePicker, refreshQuota: vi.fn(), openSettings: vi.fn(), windowController, logger: { error: vi.fn() } });
  return { controller, state, service, persistSettings, handlers, sourcePicker, windowController };
}

describe("任务栏窗口编排", () => {
  it("macOS 不增加入口、不创建任务栏窗口", async () => {
    const f = fixture(false);
    await f.controller.start(); f.controller.render();
    expect(document.getElementById("taskbarModeBtn")).toBeNull();
    expect(f.service.commands.setTaskbarEnabled).not.toHaveBeenCalled();
    expect(f.service.events.listen).not.toHaveBeenCalled();
  });

  it("Windows 开启成功后保存并隐藏主窗口，退出后恢复主窗口", async () => {
    const f = fixture(); await f.controller.start();
    expect(document.getElementById("taskbarModeBtn")).not.toBeNull();
    await f.controller.setEnabled(true);
    expect(f.state.settings.taskbarEnabled).toBe(true);
    expect(f.windowController.hideWindow).toHaveBeenCalledOnce();
    await f.controller.setEnabled(false);
    expect(f.state.settings.taskbarEnabled).toBe(false);
    expect(f.service.commands.showMainWindow).toHaveBeenCalledOnce();
  });

  it("保存失败回滚原生状态，不隐藏原面板", async () => {
    const f = fixture(); await f.controller.start();
    f.persistSettings.mockRejectedValue(new Error("写盘失败"));
    await f.controller.setEnabled(true);
    expect(f.service.commands.setTaskbarEnabled.mock.calls).toEqual([[true], [false]]);
    expect(f.windowController.hideWindow).not.toHaveBeenCalled();
    expect(f.state.errors.window).toBe("写盘失败");
  });

  it("指定来源须属于当前来源列表，点击名称直接轮换", async () => {
    const f = fixture(); await f.controller.start();
    await f.handlers["taskbar:action"]({ payload: { action: "next" } });
    expect(f.sourcePicker.cycleToNextSource).toHaveBeenCalledOnce();
    await f.handlers["taskbar:action"]({ payload: { action: "source", target: { type: "siteKey", siteId: "unknown" } } });
    expect(f.sourcePicker.switchSource).not.toHaveBeenCalled();
    await f.handlers["taskbar:action"]({ payload: { action: "source", target: { type: "official" } } });
    expect(f.sourcePicker.switchSource).toHaveBeenCalledWith({ type: "official" });
  });

  it("IPC 重排 JSON 字段后仍可指定第三方账户", async () => {
    const f = fixture();
    const target = { type: "siteKey", siteId: "s", keyId: "k" };
    f.sourcePicker.buildSourceItems = () => [{ label: "工作", target }];
    await f.controller.start();
    await f.handlers["taskbar:action"]({ payload: { action: "source", target: { keyId: "k", siteId: "s", type: "siteKey" } } });
    expect(f.sourcePicker.switchSource).toHaveBeenCalledWith(target);
  });
});
