// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), emitTo: vi.fn(), listen: vi.fn(), focusHandler: null }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ emitTo: mocks.emitTo, listen: mocks.listen }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ onFocusChanged: async handler => { mocks.focusHandler = handler; return () => {}; } }) }));

beforeEach(async () => {
  vi.resetModules();
  mocks.invoke.mockReset().mockResolvedValue();
  mocks.emitTo.mockReset().mockResolvedValue();
  mocks.listen.mockReset().mockResolvedValue(() => {});
  document.open();
  document.write(readFileSync(resolve(process.cwd(), "taskbar.html"), "utf8"));
  document.close();
  await import("../src/taskbar/index.js");
  await vi.waitFor(() => expect(mocks.emitTo).toHaveBeenCalledWith("main", "taskbar:ready"));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("任务栏抓手鼠标事件", () => {
  it("直接把按下起点交给原生，不额外等待关闭不存在的弹层", async () => {
    document.getElementById("grip").dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 11, clientY: 20 }));
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("taskbar_drag", { x: 11, y: 20 }));
    expect(mocks.invoke).not.toHaveBeenCalledWith("taskbar_popup", expect.anything());
  });

  it("弹层收起后的拖动起点仍相对底部组件，而非扩展窗口顶部", async () => {
    document.getElementById("choose").click();
    await vi.waitFor(() => expect(document.getElementById("popup").hidden).toBe(false));
    vi.spyOn(document.getElementById("taskbar"), "getBoundingClientRect").mockReturnValue({ top: 280 });
    document.getElementById("grip").dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 11, clientY: 300 }));
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("taskbar_drag", { x: 11, y: 20 }));
    expect(mocks.invoke).toHaveBeenCalledWith("taskbar_popup", { open: false });
  });

  it("短暂失焦不吞菜单点击，持续失焦才收起弹层", async () => {
    document.getElementById("choose").click();
    await vi.waitFor(() => expect(document.getElementById("popup").hidden).toBe(false));
    vi.useFakeTimers();
    mocks.focusHandler({ payload: false });
    await vi.advanceTimersByTimeAsync(50);
    mocks.focusHandler({ payload: true });
    await vi.advanceTimersByTimeAsync(250);
    expect(document.getElementById("popup").hidden).toBe(false);
    mocks.focusHandler({ payload: false });
    await vi.advanceTimersByTimeAsync(250);
    expect(document.getElementById("popup").hidden).toBe(true);
  });
});
