import { describe, expect, it } from "vitest";

import {
  clampBallPositionToWorkArea,
  clampPositionToWorkArea,
  isBallAtInternalWorkAreaEdge,
  resolveSafeBallDock,
  workAreaForBallPosition,
} from "../src/app/geometry.js";
import { BAR_DOCK_VISIBLE_WIDTH } from "../src/app/constants.js";

const ballSize = { width: 88, height: 88 };
const leftArea = {
  position: { x: 0, y: 0 },
  size: { width: 1920, height: 1040 },
};
const rightArea = {
  position: { x: 1920, y: 0 },
  size: { width: 1920, height: 1040 },
};
const monitors = [{ workArea: leftArea }, { workArea: rightArea }];

describe("窗口几何", () => {
  it("支持负坐标屏幕并限制窗口范围", () => {
    const area = {
      position: { x: -1920, y: -120 },
      size: { width: 1920, height: 1080 },
    };

    expect(
      clampPositionToWorkArea(
        { x: -2500, y: 1200 },
        { width: 390, height: 236 },
        area,
      ),
    ).toEqual({ x: -1920, y: 724 });
  });

  it("内部相邻屏幕边缘不吸附，外侧边缘允许吸附", () => {
    expect(
      resolveSafeBallDock({ x: 1876, y: 200 }, ballSize, leftArea, monitors),
    ).toBeNull();
    expect(
      isBallAtInternalWorkAreaEdge(
        { x: 1876, y: 200 },
        ballSize,
        leftArea,
        monitors,
      ),
    ).toBe(true);
    expect(
      resolveSafeBallDock({ x: 0, y: 200 }, ballSize, leftArea, monitors),
    ).toBe("left");
  });

  it("原屏幕移除后选择距离最近的工作区", () => {
    expect(
      workAreaForBallPosition({ x: 4200, y: 200 }, ballSize, monitors),
    ).toBe(rightArea);
  });

  it("竖向进度条样式（bar）右侧吸附时仅外露 BAR_DOCK_VISIBLE_WIDTH 像素", () => {
    const singleMonitor = [{ workArea: leftArea }];
    const dock = resolveSafeBallDock(
      { x: 1876, y: 200 },
      ballSize,
      leftArea,
      singleMonitor,
      "bar",
    );
    expect(dock).toBe("right");
    const pos = clampBallPositionToWorkArea(
      { x: 1876, y: 200 },
      ballSize,
      leftArea,
      dock,
      "bar",
    );
    // 右侧外露宽度应等于 BAR_DOCK_VISIBLE_WIDTH
    expect(
      leftArea.position.x + leftArea.size.width - (pos.x + ballSize.width),
    ).toBe(-(ballSize.width - BAR_DOCK_VISIBLE_WIDTH));
    const visiblePixels = leftArea.position.x + leftArea.size.width - pos.x;
    expect(visiblePixels).toBe(BAR_DOCK_VISIBLE_WIDTH);
  });

  it("竖向进度条样式（bar）左侧吸附时仅外露 BAR_DOCK_VISIBLE_WIDTH 像素", () => {
    const singleMonitor = [{ workArea: leftArea }];
    const dock = resolveSafeBallDock(
      { x: 0, y: 200 },
      ballSize,
      leftArea,
      singleMonitor,
      "bar",
    );
    expect(dock).toBe("left");
    const pos = clampBallPositionToWorkArea(
      { x: 0, y: 200 },
      ballSize,
      leftArea,
      dock,
      "bar",
    );
    const visiblePixels = pos.x + ballSize.width - leftArea.position.x;
    expect(visiblePixels).toBe(BAR_DOCK_VISIBLE_WIDTH);
  });
});
