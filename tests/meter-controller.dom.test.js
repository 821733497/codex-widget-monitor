// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { createMeterController } from "../src/components/meters/meter-controller.js";

const THEMES = [
  "default",
  "holo",
  "pyro",
  "emerald",
  "cyber",
  "obsidian",
  "crimson",
  "sakura",
];
const BASE_UPDATE = {
  theme: "default",
  percent: 42,
  angle: 151.2,
  level: "normal",
  label: "剩余",
  mode: "panel",
  dock: "none",
};

describe("仪表主题", () => {
  it.each(THEMES)("%s 主题独立挂载面板和悬浮球", (theme) => {
    const { root, controller } = createHarness();

    update(controller, { theme, percent: 42.4 });
    const mountedMeter = findMeter(root, theme);
    expect(root.childElementCount).toBe(1);
    expect(mountedMeter.dataset).toMatchObject({
      level: "normal",
      mode: "panel",
      dock: "none",
    });
    expect(accessibleMeter(root).getAttribute("aria-label")).toBe("剩余 42%");

    update(controller, {
      theme,
      percent: 84.6,
      level: "low",
      mode: "ball",
      dock: "right",
    });
    expect(findMeter(root, theme)).toBe(mountedMeter);
    expect(mountedMeter.dataset).toMatchObject({
      level: "low",
      mode: "ball",
      dock: "right",
    });
    expect(accessibleMeter(root).getAttribute("aria-label")).toBe("剩余 85%");

    controller.destroy();
    expect(root.childElementCount).toBe(0);
  });

  it.each(THEMES)("%s 主题钳制边界并拒绝非有限百分比", (theme) => {
    const { root, controller } = createHarness();
    const cases = [
      { percent: -20, expected: "0%" },
      { percent: 0, expected: "0%" },
      { percent: 42.5, expected: "43%" },
      { percent: 100, expected: "100%" },
      { percent: 120, expected: "100%" },
      { percent: null, expected: "--%" },
      { percent: undefined, expected: "--%" },
      { percent: Number.NaN, expected: "--%" },
      { percent: Number.POSITIVE_INFINITY, expected: "--%" },
      { percent: Number.NEGATIVE_INFINITY, expected: "--%" },
    ];

    for (const { percent, expected } of cases) {
      update(controller, { theme, percent });
      expect(accessibleMeter(root).getAttribute("aria-label")).toBe(
        `剩余 ${expected}`,
      );
    }
  });

  it.each(THEMES)("%s 主题独立归一化状态字段", (theme) => {
    const { root, controller } = createHarness();

    update(controller, {
      theme,
      level: "",
      label: "",
      mode: "popup",
      dock: "top",
    });
    const meter = findMeter(root, theme);
    expect(meter.dataset).toMatchObject({
      level: "unknown",
      mode: "panel",
      dock: "none",
    });
    expect(accessibleMeter(root).getAttribute("aria-label")).toBe("Quota 42%");

    update(controller, { theme, mode: "ball", dock: "left" });
    expect(meter.dataset).toMatchObject({ mode: "ball", dock: "left" });
  });

  it("全息 3D 核心独立维护 Canvas 画布与文字显示", () => {
    const { root, controller } = createHarness();
    update(controller, { theme: "default", percent: 57, label: "剩余" });
    const meter = findMeter(root, "default");
    expect(meter.querySelector(".holo-canvas")).not.toBeNull();
    expect(meter.querySelector(".holo-percent").textContent).toBe("57%");
    expect(meter.querySelector(".holo-label").textContent).toBe("剩余");
  });

  it("烈焰熔核独立维护 Canvas 画布与文字显示", () => {
    const { root, controller } = createHarness();
    update(controller, { theme: "pyro", percent: 57, label: "剩余" });
    const meter = findMeter(root, "pyro");
    expect(meter.querySelector(".pyro-canvas")).not.toBeNull();
    expect(meter.querySelector(".pyro-percent").textContent).toBe("57%");
    expect(meter.querySelector(".pyro-label").textContent).toBe("剩余");
  });

  it("同主题复用节点，切换主题时替换节点", () => {
    const { root, controller } = createHarness();
    update(controller, { theme: "default" });
    const defaultMeter = root.firstElementChild;

    update(controller, { theme: "default", percent: 84 });
    expect(root.firstElementChild).toBe(defaultMeter);

    update(controller, { theme: "pyro" });
    expect(root.firstElementChild).not.toBe(defaultMeter);
    expect(defaultMeter.parentNode).toBeNull();
    expect(findMeter(root, "pyro")).toBe(root.firstElementChild);
  });

  it("未知主题稳定回退默认主题", () => {
    const { root, controller } = createHarness();
    update(controller, { theme: "toString" });
    const defaultMeter = findMeter(root, "default");

    update(controller, { theme: "__proto__", percent: 84 });
    expect(findMeter(root, "default")).toBe(defaultMeter);
    expect(accessibleMeter(root).getAttribute("aria-label")).toBe("剩余 84%");
  });

  it("销毁可重复调用，空根节点安全返回", () => {
    const { root, controller } = createHarness();
    update(controller, { theme: "pyro" });

    controller.destroy();
    controller.destroy();
    expect(root.childElementCount).toBe(0);

    const emptyController = createMeterController(null);
    expect(() => emptyController.update(BASE_UPDATE)).not.toThrow();
    expect(() => emptyController.destroy()).not.toThrow();
  });
});

function createHarness() {
  const root = document.createElement("div");
  return { root, controller: createMeterController(root) };
}

function update(controller, overrides = {}) {
  controller.update({ ...BASE_UPDATE, ...overrides });
}

function findMeter(root, theme) {
  const className = theme === "default" ? "holo" : theme;
  const meter = root.querySelector(`.${className}-meter`);
  expect(meter).not.toBeNull();
  return meter;
}

function accessibleMeter(root) {
  const meter = root.querySelector('[role="img"]');
  expect(meter).not.toBeNull();
  return meter;
}
