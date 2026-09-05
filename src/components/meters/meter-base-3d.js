import * as THREE from "three";

/**
 * 3D 水球仪表盘通用基座工厂
 *
 * 封装通用生命周期：
 * 1. DOM 结构构建（外层光晕、正圆视口、WebGL 画布、高光层、居中文字与剩余标签）
 * 2. WebGLRenderer、Scene、OrthographicCamera 初始化与上下文安全保护
 * 3. Resize 适配逻辑（面板 130px、悬浮球 small 64px / medium 88px）
 * 4. RAF 驱动的物理动画循环、水位高度计算、平滑颜色过渡插值
 * 5. 状态同步（dataset.level / mode / dock，aria-label）
 * 6. 完整的 Three.js 内存与 DOM 节点释放
 */
export function create3DMeterBase(root, config) {
  const {
    themePrefix,
    colors: { normalTop, normalBottom, lowTop, lowBottom },
    onInitObjects,
    onRenderTick,
  } = config;

  const meter = document.createElement("div");
  meter.className = `${themePrefix}-meter`;
  meter.setAttribute("role", "img");
  meter.setAttribute("aria-live", "polite");
  meter.dataset.mode = "panel";
  meter.dataset.dock = "none";
  meter.dataset.level = "normal";

  // 外围环境光晕
  const glow = document.createElement("div");
  glow.className = `${themePrefix}-meter-glow`;

  // 核心圆球视口容器
  const sphereContainer = document.createElement("div");
  sphereContainer.className = `${themePrefix}-sphere-container`;

  // 3D Canvas
  const canvas = document.createElement("canvas");
  canvas.className = `${themePrefix}-canvas`;

  // 顶部水晶反射罩
  const glassReflect = document.createElement("div");
  glassReflect.className = `${themePrefix}-glass-reflect`;

  // 居中文字层
  const content = document.createElement("div");
  content.className = `${themePrefix}-content`;

  const percentEl = document.createElement("div");
  percentEl.className = `${themePrefix}-percent`;
  percentEl.textContent = "--%";

  const labelEl = document.createElement("div");
  labelEl.className = `${themePrefix}-label`;
  labelEl.textContent = "剩余";

  content.append(percentEl, labelEl);
  sphereContainer.append(canvas, glassReflect, content);
  meter.append(glow, sphereContainer);
  root.append(meter);

  // 3D 运行时与状态
  let renderer = null;
  let scene = null;
  let camera = null;
  let animId = null;
  let isDestroyed = false;

  let currentSize = 130;
  let targetPercent = 50;
  let currentPercent = 50;
  let isLowLevel = false;

  const normalColorTop = new THREE.Color(normalTop);
  const normalColorBottom = new THREE.Color(normalBottom);
  const lowColorTop = new THREE.Color(lowTop);
  const lowColorBottom = new THREE.Color(lowBottom);
  const currentColorTop = new THREE.Color(normalTop);
  const currentColorBottom = new THREE.Color(normalBottom);

  try {
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (gl) {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      scene = new THREE.Scene();
      camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 2;

      if (onInitObjects) {
        onInitObjects({
          scene,
          camera,
          renderer,
          currentColorTop,
          currentColorBottom,
        });
      }

      resize(130);
      startAnimation();
    }
  } catch (_error) {
    renderer = null;
  }

  function resize(size) {
    if (!renderer) return;
    currentSize = size;
    renderer.setSize(size, size);
    camera.left = -1;
    camera.right = 1;
    camera.top = 1;
    camera.bottom = -1;
    camera.updateProjectionMatrix();
  }

  let lastTime = performance.now();
  function startAnimation() {
    function tick(now) {
      if (isDestroyed) return;

      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      const timeSec = now * 0.001;

      // 平滑插值水位百分比 (-0.95 到 +0.95)
      currentPercent +=
        (targetPercent - currentPercent) * Math.min(delta * 4, 1);
      const waterLevelY = -0.95 + (currentPercent / 100) * 1.9;

      // 平滑插值颜色
      const targetTop = isLowLevel ? lowColorTop : normalColorTop;
      const targetBottom = isLowLevel ? lowColorBottom : normalColorBottom;
      currentColorTop.lerp(targetTop, delta * 3);
      currentColorBottom.lerp(targetBottom, delta * 3);

      if (onRenderTick) {
        onRenderTick({
          now,
          timeSec,
          delta,
          waterLevelY,
          currentPercent,
          isLowLevel,
          currentColorTop,
          currentColorBottom,
        });
      }

      renderer.render(scene, camera);
      animId = requestAnimationFrame(tick);
    }
    animId = requestAnimationFrame(tick);
  }

  function update({
    displayText,
    percent: nextPercent,
    level,
    label: nextLabel,
    mode = "panel",
    dock = "none",
    ballSize = "small",
  } = {}) {
    const rawPercent = nextPercent;
    const isFinite =
      typeof rawPercent === "number" && Number.isFinite(rawPercent);
    const clampedPercent = isFinite
      ? Math.max(0, Math.min(100, rawPercent))
      : null;
    const rounded = clampedPercent !== null ? Math.round(clampedPercent) : null;

    targetPercent = rounded !== null ? rounded : 0;
    const displayPercent =
      displayText || (rounded !== null ? `${rounded}%` : "--%");
    const labelText = nextLabel || "";

    percentEl.textContent = displayPercent;
    labelEl.textContent = labelText;

    const gaugeMode = mode === "ball" ? "ball" : "panel";
    const gaugeDock = dock === "left" || dock === "right" ? dock : "none";

    meter.dataset.level = level || "unknown";
    meter.dataset.mode = gaugeMode;
    meter.dataset.dock = gaugeDock;
    meter.setAttribute(
      "aria-label",
      `${nextLabel || "Quota"} ${displayPercent}`,
    );
    isLowLevel =
      level === "low" ||
      level === "critical" ||
      (rounded !== null && rounded < 20);

    const expectedSize =
      gaugeMode === "ball" ? (ballSize === "small" ? 64 : 88) : 130;
    if (currentSize !== expectedSize) {
      resize(expectedSize);
    }
  }

  function destroy() {
    isDestroyed = true;
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    if (scene) {
      scene.traverse((obj) => {
        if (obj.geometry) {
          obj.geometry.dispose();
        }
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      scene.clear();
      scene = null;
    }
    if (renderer) {
      renderer.dispose();
      renderer = null;
    }
    if (meter.parentNode === root) {
      root.replaceChildren();
    } else {
      meter.remove();
    }
  }

  return { update, destroy };
}
