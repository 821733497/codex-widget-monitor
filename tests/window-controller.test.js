import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WIDGET_MODES } from "../src/app/constants.js";
import { applyNormalizedSettings, createAppState } from "../src/app/state.js";
import { createWindowController } from "../src/app/window-controller.js";

const WORK_AREA = {
  position: { x: 0, y: 0 },
  size: { width: 1920, height: 1040 },
};

describe("窗口模式事务", () => {
  let originalWindow;
  let originalRaf;
  let originalCaf;

  beforeEach(() => {
    originalWindow = globalThis.window;
    originalRaf = globalThis.requestAnimationFrame;
    originalCaf = globalThis.cancelAnimationFrame;
    vi.useFakeTimers();
    globalThis.window = globalThis;
    globalThis.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16));
    globalThis.cancelAnimationFrame = vi.fn((id) => clearTimeout(id));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
    if (originalRaf === undefined) {
      delete globalThis.requestAnimationFrame;
    } else {
      globalThis.requestAnimationFrame = originalRaf;
    }
    if (originalCaf === undefined) {
      delete globalThis.cancelAnimationFrame;
    } else {
      globalThis.cancelAnimationFrame = originalCaf;
    }
  });

  it("成功切换只保存一次最终模式和旧窗口位置", async () => {
    const fixture = createFixture();

    await fixture.controller.setWidgetMode(WIDGET_MODES.BALL);

    expect(fixture.persistSettings).toHaveBeenCalledOnce();
    expect(fixture.state.settings).toMatchObject({
      widgetMode: WIDGET_MODES.BALL,
      panelPosition: { x: 120, y: 90 },
      ballPosition: { x: 600, y: 240 },
    });
    expect(fixture.native.size).toEqual({ width: 64, height: 64 });
    expect(fixture.state.errors.window).toBe("");
  });

  it("大尺寸配置下切换悬浮球模式使用 88x88", async () => {
    const fixture = createFixture();
    fixture.state.settings.ballSize = "medium";

    await fixture.controller.setWidgetMode(WIDGET_MODES.BALL);

    expect(fixture.native.size).toEqual({ width: 88, height: 88 });
  });

  it("忙碌期间相同意图合并且保持原生操作串行", async () => {
    const firstSizeWrite = deferred();
    let activeWrites = 0;
    let maxActiveWrites = 0;
    const fixture = createFixture({
      setSize: vi.fn(async (size) => {
        activeWrites += 1;
        maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
        fixture.native.size = { ...size };
        if (activeWrites === 1) await firstSizeWrite.promise;
        activeWrites -= 1;
      }),
    });

    const first = fixture.controller.setWidgetMode(WIDGET_MODES.BALL);
    const second = fixture.controller.setWidgetMode(WIDGET_MODES.BALL);
    const third = fixture.controller.setWidgetMode(WIDGET_MODES.BALL);
    await vi.waitFor(() =>
      expect(fixture.service.window.setSize).toHaveBeenCalledOnce(),
    );
    firstSizeWrite.resolve();
    await Promise.all([first, second, third]);

    expect(fixture.persistSettings).toHaveBeenCalledOnce();
    expect(fixture.state.widgetMode).toBe(WIDGET_MODES.BALL);
    expect(maxActiveWrites).toBe(1);
  });

  it("新意图覆盖进行中的旧意图且不保存中间模式", async () => {
    const ballSizeWrite = deferred();
    const fixture = createFixture({
      setSize: vi.fn(async (size) => {
        fixture.native.size = { ...size };
        if (size.width === 64) await ballSizeWrite.promise;
      }),
    });

    const toBall = fixture.controller.setWidgetMode(WIDGET_MODES.BALL);
    await vi.waitFor(() =>
      expect(fixture.service.window.setSize).toHaveBeenCalledOnce(),
    );
    const backToPanel = fixture.controller.setWidgetMode(WIDGET_MODES.PANEL);
    ballSizeWrite.resolve();
    await Promise.all([toBall, backToPanel]);

    expect(fixture.persistSettings).not.toHaveBeenCalled();
    expect(fixture.state.widgetMode).toBe(WIDGET_MODES.PANEL);
    expect(fixture.native.size).toEqual({ width: 390, height: 236 });
    expect(fixture.native.position).toEqual({ x: 120, y: 90 });
  });

  it("原生切换失败时恢复旧窗口且不保存新模式", async () => {
    const fixture = createFixture();
    fixture.service.window.setPosition
      .mockRejectedValueOnce(new Error("移动失败"))
      .mockImplementation(async (position) => {
        fixture.native.position = { ...position };
      });

    await fixture.controller.setWidgetMode(WIDGET_MODES.BALL);

    expect(fixture.persistSettings).not.toHaveBeenCalled();
    expect(fixture.state.widgetMode).toBe(WIDGET_MODES.PANEL);
    expect(fixture.native.size).toEqual({ width: 390, height: 236 });
    expect(fixture.native.position).toEqual({ x: 120, y: 90 });
    expect(fixture.state.errors.window).toContain("移动失败");
  });

  it("设置保存失败时回滚原生窗口和前端状态", async () => {
    const fixture = createFixture({
      persistSettings: vi.fn().mockRejectedValue(new Error("保存失败")),
    });

    await fixture.controller.setWidgetMode(WIDGET_MODES.BALL);

    expect(fixture.persistSettings).toHaveBeenCalledOnce();
    expect(fixture.state.widgetMode).toBe(WIDGET_MODES.PANEL);
    expect(fixture.native.size).toEqual({ width: 390, height: 236 });
    expect(fixture.native.position).toEqual({ x: 120, y: 90 });
    expect(fixture.state.errors.window).toContain("保存失败");
  });

  it("整个转换及收尾期持续抑制窗口移动保存", async () => {
    const sizeWrite = deferred();
    const fixture = createFixture({
      setSize: vi.fn(async (size) => {
        fixture.native.size = { ...size };
        await sizeWrite.promise;
      }),
    });
    await fixture.controller.registerWindowMoveSave();
    const transition = fixture.controller.setWidgetMode(WIDGET_MODES.BALL);
    await vi.waitFor(() =>
      expect(fixture.service.window.setSize).toHaveBeenCalledOnce(),
    );

    fixture.native.onMoved?.();
    expect(fixture.state.isApplyingWindowMode).toBe(true);
    expect(fixture.state.positionSaveTimer).toBeNull();
    sizeWrite.resolve();
    await transition;

    expect(fixture.persistSettings).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(99);
    expect(fixture.state.isApplyingWindowMode).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.state.isApplyingWindowMode).toBe(false);
  });

  it.each(["Enter", " "])("悬浮球支持 %j 键返回面板", async (key) => {
    const fixture = createFixture({ initialMode: WIDGET_MODES.BALL });
    fixture.controller.bindEvents();
    const preventDefault = vi.fn();

    await fixture.els.widget.emit("keydown", { key, preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(fixture.state.widgetMode).toBe(WIDGET_MODES.PANEL);
    expect(fixture.persistSettings).toHaveBeenCalledOnce();
  });

  it("打开设置默认在屏幕工作区居中展示，并在关闭后精准恢复悬浮球原位", async () => {
    const fixture = createFixture({ initialMode: WIDGET_MODES.BALL });
    expect(fixture.native.position).toEqual({ x: 600, y: 240 });

    // 打开设置：默认居中于当前工作区 (1920-800)/2 = 560, (1040-500)/2 = 270
    await fixture.controller.adjustWindowForSettings(true);
    expect(fixture.native.size).toEqual({ width: 800, height: 500 });
    expect(fixture.native.position).toEqual({ x: 560, y: 270 });

    // 模拟用户在设置期间拖动移动了设置面板
    fixture.native.position = { x: 100, y: 100 };

    // 关闭设置：悬浮球精准恢复打开前所在的原位 (600, 240)，不被移动所影响
    await fixture.controller.adjustWindowForSettings(false);
    expect(fixture.native.size).toEqual({ width: 64, height: 64 });
    expect(fixture.native.position).toEqual({ x: 600, y: 240 });

    // 悬浮球靠边 (1850, 400) 再次打开设置：依然屏幕居中，关闭恢复 (1850, 400)
    fixture.native.position = { x: 1850, y: 400 };
    await fixture.controller.adjustWindowForSettings(true);
    expect(fixture.native.size).toEqual({ width: 800, height: 500 });
    expect(fixture.native.position).toEqual({ x: 560, y: 270 });

    await fixture.controller.adjustWindowForSettings(false);
    expect(fixture.native.size).toEqual({ width: 64, height: 64 });
    expect(fixture.native.position).toEqual({ x: 1850, y: 400 });
  });

  it("设置面板打开时双击不切换小组件模式", async () => {
    const fixture = createFixture();
    fixture.state.settingsOpen = true;
    fixture.controller.bindEvents();

    await fixture.els.widget.emit("pointerdown", {
      button: 0,
      screenX: 100,
      screenY: 100,
      preventDefault: vi.fn(),
    });
    vi.advanceTimersByTime(50);
    await fixture.els.widget.emit("pointerdown", {
      button: 0,
      screenX: 102,
      screenY: 101,
      preventDefault: vi.fn(),
    });

    expect(fixture.state.widgetMode).toBe(WIDGET_MODES.PANEL);
  });

  it("悬浮球在屏幕内正常展开时单击触发切换托盘概览卡片", async () => {
    const fixture = createFixture({ initialMode: WIDGET_MODES.BALL });
    fixture.controller.bindEvents();

    await fixture.els.widget.emit("pointerdown", {
      button: 0,
      pointerId: 1,
      screenX: 600,
      screenY: 240,
      preventDefault: vi.fn(),
    });
    await fixture.els.widget.emit("pointerup", {
      button: 0,
      pointerId: 1,
      screenX: 600,
      screenY: 240,
      preventDefault: vi.fn(),
    });

    expect(fixture.service.commands.toggleTrayPreview).toHaveBeenCalledOnce();
  });

  it("悬浮球在边缘吸附时单击仅展开悬浮球且不触发托盘卡片", async () => {
    const fixture = createFixture({ initialMode: WIDGET_MODES.BALL });
    fixture.state.ballDock = "right";
    fixture.controller.bindEvents();

    await fixture.els.widget.emit("pointerdown", {
      button: 0,
      pointerId: 1,
      screenX: 1900,
      screenY: 240,
      preventDefault: vi.fn(),
    });
    await fixture.els.widget.emit("pointerup", {
      button: 0,
      pointerId: 1,
      screenX: 1900,
      screenY: 240,
      preventDefault: vi.fn(),
    });

    expect(fixture.state.ballDock).toBeNull();
    expect(fixture.service.commands.toggleTrayPreview).not.toHaveBeenCalled();
  });

  it("拖动悬浮球超过阈值松手时不触发托盘卡片", async () => {
    const fixture = createFixture({ initialMode: WIDGET_MODES.BALL });
    fixture.controller.bindEvents();

    await fixture.els.widget.emit("pointerdown", {
      button: 0,
      pointerId: 1,
      screenX: 600,
      screenY: 240,
      preventDefault: vi.fn(),
    });
    await fixture.els.widget.emit("pointermove", {
      pointerId: 1,
      screenX: 650,
      screenY: 240,
    });
    await fixture.els.widget.emit("pointerup", {
      button: 0,
      pointerId: 1,
      screenX: 650,
      screenY: 240,
      preventDefault: vi.fn(),
    });

    expect(fixture.service.commands.toggleTrayPreview).not.toHaveBeenCalled();
  });
});

function createFixture({
  initialMode = WIDGET_MODES.PANEL,
  persistSettings: customPersistSettings,
  setSize: customSetSize,
} = {}) {
  const state = createAppState();
  applyNormalizedSettings(state, {
    ...state.settings,
    widgetMode: initialMode,
    panelPosition: { x: 120, y: 90 },
    ballPosition: { x: 600, y: 240 },
    ballDock: null,
  });
  const native = {
    position:
      initialMode === WIDGET_MODES.BALL
        ? { x: 600, y: 240 }
        : { x: 120, y: 90 },
    size:
      initialMode === WIDGET_MODES.BALL
        ? { width: 88, height: 88 }
        : { width: 390, height: 236 },
    onMoved: null,
  };
  const els = createElements();
  const render = vi.fn();
  const service = {
    isAvailable: () => true,
    commands: {
      closeApp: vi.fn(),
      hideWindow: vi.fn(),
      setSkipTaskbar: vi.fn(),
      toggleTrayPreview: vi.fn(),
    },
    window: {
      availableMonitors: vi.fn(async () => [{ workArea: WORK_AREA }]),
      currentMonitor: vi.fn(async () => ({ workArea: WORK_AREA })),
      onMoved: vi.fn(async (handler) => {
        native.onMoved = handler;
        return vi.fn();
      }),
      outerPosition: vi.fn(async () => ({ ...native.position })),
      outerSize: vi.fn(async () => ({ ...native.size })),
      scaleFactor: vi.fn(async () => 1),
      setPosition: vi.fn(async (position) => {
        native.position = { ...position };
      }),
      setSize:
        customSetSize ||
        vi.fn(async (size) => {
          native.size = { ...size };
        }),
      startDragging: vi.fn(),
    },
  };
  const persistSettings =
    customPersistSettings ||
    vi.fn(async (updateSettings, options = {}) => {
      const saved = updateSettings(state.settings);
      applyNormalizedSettings(state, saved, {
        syncDraft: options.syncDraft ?? true,
      });
      render();
      return saved;
    });
  const logger = { error: vi.fn() };
  const controller = createWindowController({
    els,
    state,
    service,
    render,
    persistSettings,
    logger,
  });

  return {
    controller,
    els,
    logger,
    native,
    persistSettings,
    render,
    service,
    state,
  };
}

function createElements() {
  return {
    widget: createEventTarget(),
    modeBtn: createEventTarget(),
    minimizeBtn: createEventTarget(),
    closeBtn: createEventTarget(),
  };
}

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener: vi.fn((type, handler) => {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    }),
    async emit(type, event) {
      const results = (listeners.get(type) || []).map((handler) =>
        handler(event),
      );
      await Promise.all(results);
    },
    releasePointerCapture: vi.fn(),
    setPointerCapture: vi.fn(),
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
