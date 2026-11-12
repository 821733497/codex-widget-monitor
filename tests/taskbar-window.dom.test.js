// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), emitTo: vi.fn(), listen: vi.fn(), focusHandler: null }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ emitTo: mocks.emitTo, listen: mocks.listen }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: async (handler) => {
      mocks.focusHandler = handler;
      return () => {};
    },
  }),
}));

async function bootTaskbar(search = "") {
  vi.resetModules();
  mocks.invoke.mockReset().mockResolvedValue(undefined);
  mocks.emitTo.mockReset().mockResolvedValue(undefined);
  mocks.listen.mockReset().mockResolvedValue(() => {});
  mocks.focusHandler = null;
  window.history.replaceState({}, "", `/taskbar.html${search}`);
  document.open();
  document.write(readFileSync(resolve(process.cwd(), "taskbar.html"), "utf8"));
  document.close();
  await import("../src/taskbar/index.js");
  await vi.waitFor(() => expect(mocks.emitTo).toHaveBeenCalledWith("main", "taskbar:ready"));
}

function getListener(eventName) {
  const call = mocks.listen.mock.calls.find(([name]) => name === eventName);
  return call?.[1];
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("任务栏底栏窗口（固定尺寸）", () => {
  beforeEach(async () => {
    await bootTaskbar("");
  });

  it("点击展开按钮仅转发到独立 taskbar-popup，不在底栏内撑开或调用 taskbar_popup", async () => {
    document.getElementById("choose").click();
    await vi.waitFor(() =>
      expect(mocks.emitTo).toHaveBeenCalledWith("taskbar-popup", "taskbar:popup-toggle", {
        kind: "sources",
      }),
    );
    expect(document.getElementById("popup").hidden).toBe(true);
    expect(mocks.invoke).not.toHaveBeenCalledWith("taskbar_popup", expect.anything());
  });

  it("直接把抓手按下起点交给原生，无打开弹窗时不额外关闭弹层", async () => {
    document
      .getElementById("grip")
      .dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 11, clientY: 20 }));
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("taskbar_drag", { x: 11, y: 20 }));
    expect(mocks.emitTo).not.toHaveBeenCalledWith("taskbar-popup", "taskbar:popup-close");
  });

  it("弹窗处于打开状态时按住抓手拖动会先通知关闭独立弹窗并保持底栏坐标不变", async () => {
    const stateListener = getListener("taskbar:popup-state");
    stateListener({ payload: { open: true, kind: "sources" } });
    expect(document.getElementById("choose").getAttribute("aria-expanded")).toBe("true");

    vi.spyOn(document.getElementById("taskbar"), "getBoundingClientRect").mockReturnValue({ top: 0 });
    document
      .getElementById("grip")
      .dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 11, clientY: 20 }));
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("taskbar_drag", { x: 11, y: 20 }));
    expect(mocks.emitTo).toHaveBeenCalledWith("taskbar-popup", "taskbar:popup-close");
    expect(document.getElementById("choose").getAttribute("aria-expanded")).toBe("false");
  });
});
describe("任务栏独立弹窗窗口（?popup）", () => {
  beforeEach(async () => {
    await bootTaskbar("?popup");
  });

  it("失去焦点切回外部应用时调用 taskbar_popup_blur_close 收起弹窗，回焦点或系统仍在底栏时保留", async () => {
    const toggleListener = getListener("taskbar:popup-toggle");
    toggleListener({ payload: { kind: "sources" } });
    await vi.waitFor(() => expect(document.getElementById("popup").hidden).toBe(false));

    vi.useFakeTimers();
    // 短暂失焦后立刻回到焦点窗口：不触发失焦关闭检查
    mocks.focusHandler({ payload: false });
    await vi.advanceTimersByTimeAsync(20);
    mocks.focusHandler({ payload: true });
    await vi.advanceTimersByTimeAsync(100);
    expect(mocks.invoke).not.toHaveBeenCalledWith("taskbar_popup_blur_close");
    expect(document.getElementById("popup").hidden).toBe(false);

    // 前台落在底栏窗口时由底栏负责切换：后端返回 false，弹窗不抢先关闭
    mocks.invoke.mockResolvedValueOnce(false);
    mocks.focusHandler({ payload: false });
    await vi.advanceTimersByTimeAsync(80);
    expect(mocks.invoke).toHaveBeenCalledWith("taskbar_popup_blur_close");
    expect(document.getElementById("popup").hidden).toBe(false);

    // 前台切换到外部应用：后端返回 true 并隐藏窗口，前端同步清理 DOM
    mocks.invoke.mockResolvedValueOnce(true);
    mocks.focusHandler({ payload: false });
    await vi.advanceTimersByTimeAsync(80);
    expect(document.getElementById("popup").hidden).toBe(true);
  });

  it("展开来源弹窗时触发预取、展示供应商具体指标且不包含打开完整面板", async () => {
    expect(document.body.dataset.popupWindow).toBe("true");
    const renderHandler = getListener("taskbar:update");
    renderHandler({
      payload: {
        locale: "zh",
        site: "fcodex",
        account: "sy",
        loading: false,
        error: "",
        metrics: [
          { label: "今日消耗", value: "$9.30" },
          { label: "周期剩余", value: "$57.44" },
          { label: "周剩余", value: "46%" },
          { label: "距重置", value: "3天 8时 33分" },
        ],
        sources: [
          {
            label: "官方 Codex CLI",
            plan: "plus",
            active: false,
            target: { type: "official" },
            metrics: [
              { label: "5h剩余", value: "87%" },
              { label: "周剩余", value: "98%" },
              { label: "本期估算", value: "≈$126" },
              { label: "距重置", value: "4时 25分" },
            ],
          },
          {
            label: "sy",
            group: "fcodex",
            active: true,
            target: { type: "siteKey", siteId: "s", keyId: "k" },
            metrics: [
              { label: "今日消耗", value: "$9.30" },
              { label: "周期剩余", value: "$57.44" },
              { label: "周剩余", value: "46%" },
              { label: "距重置", value: "3天 8时 33分" },
            ],
          },
        ],
      },
    });

    getListener("taskbar:popup-toggle")({ payload: { kind: "sources" } });
    await vi.waitFor(() => {
      expect(document.getElementById("popup").hidden).toBe(false);
      expect(mocks.emitTo).toHaveBeenCalledWith("main", "taskbar:action", {
        action: "preloadSources",
        target: undefined,
      });
      expect(mocks.emitTo).toHaveBeenCalledWith("taskbar", "taskbar:popup-state", {
        open: true,
        kind: "sources",
      });
    });

    const popupText = document.getElementById("popup").textContent;
    expect(popupText).toContain("87%");
    expect(popupText).toContain("$57.44");
    expect(popupText).toContain("距重置");
    expect(popupText).toContain("3天 8时 33分");
    expect(popupText).not.toContain("打开完整面板");
    expect(popupText).toContain("设置");
    expect(popupText).toContain("退出任务栏模式");
  });

  it("展开多个供应商时按净内容高度撑开独立弹窗窗口且连续快速点击按序开合", async () => {
    getListener("taskbar:update")({
      payload: {
        locale: "zh",
        site: "官方",
        account: "Plus",
        loading: false,
        error: "",
        metrics: [
          { label: "5h剩余", value: "90%" },
          { label: "周剩余", value: "80%" },
          { label: "本期估算", value: "≈$126" },
          { label: "距重置", value: "4时 25分" },
        ],
        sources: Array.from({ length: 8 }, (_, idx) => ({
          label: `站点 ${idx + 1}`,
          active: idx === 0,
          target: { type: "siteKey", siteId: "s", keyId: `k${idx}` },
          metrics: [
            { label: "今日消耗", value: "$1.00" },
            { label: "周期剩余", value: "$9.00" },
            { label: "周剩余", value: "50%" },
            { label: "距重置", value: "3天 8时 33分" },
          ],
        })),
      },
    });

    const popupEl = document.getElementById("popup");
    Object.defineProperty(popupEl, "scrollHeight", { configurable: true, get: () => 44 });
    Object.defineProperty(popupEl, "offsetHeight", { configurable: true, get: () => 44 });
    const origQuerySelector = popupEl.querySelector.bind(popupEl);
    vi.spyOn(popupEl, "querySelector").mockImplementation((selector) => {
      const el = origQuerySelector(selector);
      if (el && selector === ".popup-body") {
        Object.defineProperty(el, "scrollHeight", { configurable: true, value: 560 });
      }
      if (el && selector === ".popup-actions") {
        Object.defineProperty(el, "offsetHeight", { configurable: true, value: 64 });
      }
      return el;
    });

    const toggle = getListener("taskbar:popup-toggle");
    // 模拟快速连击两次展开按钮，先开后关严格按序完成且互不覆盖
    toggle({ payload: { kind: "sources" } });
    toggle({ payload: { kind: "sources" } });

    await vi.waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("taskbar_popup", {
        open: true,
        width: 400,
        height: 560 + 64 + 2,
      });
      expect(mocks.invoke).toHaveBeenLastCalledWith("taskbar_popup", { open: false });
      expect(popupEl.hidden).toBe(true);
    });
  });

  it("弹窗内携带 resetAt 的距重置字段随时间自动按分钟更新", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T15:27:12+08:00"));
    await bootTaskbar("?popup");
    const resetAt = new Date("2026-11-16T00:00:00+08:00").toISOString();

    getListener("taskbar:update")({
      payload: {
        locale: "zh",
        site: "fcodex",
        account: "sy",
        loading: false,
        error: "",
        metrics: [],
        sources: [
          {
            label: "sy",
            active: true,
            target: { type: "siteKey", siteId: "s", keyId: "k" },
            metrics: [{ label: "距重置", value: "3天 8时 33分", resetAt }],
          },
        ],
      },
    });
    getListener("taskbar:popup-toggle")({ payload: { kind: "sources" } });
    await vi.advanceTimersByTimeAsync(30);
    expect(document.getElementById("popup").textContent).toContain("3天 8时 33分");

    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(document.getElementById("popup").textContent).toContain("3天 8时 32分");
  });
});
