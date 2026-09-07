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

  // 流体晃荡阻尼物理引擎状态
  let sloshAngle = 0; // 水面倾角 (rad)
  let sloshAngleVel = 0; // 水面倾角角速度 (rad/s)
  let sloshOffset = 0; // 水面垂直涌动偏移
  let sloshOffsetVel = 0; // 垂直速度
  let targetSloshAngle = 0; // 拖动即时目标倾角
  let targetSloshOffset = 0; // 拖动即时目标偏移
  let waveTurbulence = 0; // 湍流激发增强 (0.0 ~ 2.5)
  let wavePhase = 0; // 连续积分波浪相位
  let agitation = 0; // 液体激荡能量指数 (0.0 ~ 1.0)

  // 拖拽采样追踪
  let lastDragX = null;
  let lastDragY = null;
  let lastDragTime = null;
  let dragVelocityX = 0;
  let dragVelocityY = 0;

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

  function notifyDrag(screenX, screenY) {
    const now = performance.now();
    if (lastDragX !== null && lastDragY !== null && lastDragTime !== null) {
      const dt = Math.max((now - lastDragTime) / 1000, 0.008);
      if (dt < 0.25) {
        const vx = (screenX - lastDragX) / dt;
        const vy = (screenY - lastDragY) / dt;

        const ax = (vx - dragVelocityX) / dt;
        const ay = (vy - dragVelocityY) / dt;

        dragVelocityX = vx;
        dragVelocityY = vy;

        const clampedVx = Math.max(-2500, Math.min(2500, vx));
        const clampedVy = Math.max(-2500, Math.min(2500, vy));
        const clampedAx = Math.max(-12000, Math.min(12000, ax));
        const clampedAy = Math.max(-12000, Math.min(12000, ay));

        // 目标倾角与垂直涌动位移由惯性加速度与拖拽速度共同驱动，产生即时且自然的物理响应
        targetSloshAngle = Math.max(
          -0.62,
          Math.min(0.62, clampedAx * 0.000035 + clampedVx * 0.00038),
        );
        // 屏幕坐标 Y 增加为向下：向下拖拽(vy>0)时惯性使水体向上涌起(targetSloshOffset>0)；向上拖拽(vy<0)时水体向下压迫(targetSloshOffset<0)
        // 允许极速下移时产生充沛动量直接冲上球顶
        targetSloshOffset = Math.max(
          -0.85,
          Math.min(1.4, clampedAy * 0.000045 + clampedVy * 0.00045),
        );

        // 注入灵敏有力的初动量与冲量
        sloshAngleVel += (clampedAx * 0.00018 + clampedVx * 0.00025) * dt * 4.0;
        sloshOffsetVel +=
          (clampedAy * 0.00012 + clampedVy * 0.00035) * dt * 4.0;

        // 速度与加速度充分激发波浪翻涌动感与激荡指数
        const speed = Math.hypot(vx, vy);
        waveTurbulence = Math.min(
          2.5,
          waveTurbulence + speed * 0.0009 + Math.hypot(ax, ay) * 0.000045,
        );
        agitation = Math.min(
          1.0,
          Math.max(
            agitation,
            speed * 0.0006 +
              Math.hypot(ax, ay) * 0.00004 +
              Math.abs(sloshOffsetVel) * 0.15,
          ),
        );
      }
    }
    lastDragX = screenX;
    lastDragY = screenY;
    lastDragTime = now;
  }

  function notifyDragEnd(vx = 0, vy = 0) {
    if (Math.abs(vx) > 30 || Math.abs(vy) > 30) {
      sloshAngleVel += Math.max(-9, Math.min(9, vx * 0.003));
      sloshOffsetVel += Math.max(-4.0, Math.min(6.5, vy * 0.0035));
      waveTurbulence = Math.min(
        2.5,
        waveTurbulence + Math.hypot(vx, vy) * 0.0009,
      );
      agitation = Math.min(
        1.0,
        Math.max(
          agitation,
          Math.hypot(vx, vy) * 0.00075 + Math.abs(sloshOffsetVel) * 0.18,
        ),
      );
    }
    targetSloshAngle = 0;
    targetSloshOffset = 0;
    lastDragX = null;
    lastDragY = null;
    lastDragTime = null;
    dragVelocityX = 0;
    dragVelocityY = 0;
  }

  let lastTime = performance.now();
  function startAnimation() {
    function tick(now) {
      if (isDestroyed) return;

      const delta = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // 鼠标在拖拽中停顿时，目标倾角与垂直位移平缓回归
      if (lastDragTime && now - lastDragTime > 50) {
        targetSloshAngle *= Math.exp(-delta * 5.0);
        targetSloshOffset *= Math.exp(-delta * 5.0);
        dragVelocityX = 0;
        dragVelocityY = 0;
      }

      // 平滑插值水位百分比 (-0.95 到 +0.95)
      currentPercent +=
        (targetPercent - currentPercent) * Math.min(delta * 4, 1);
      const waterLevelY = -0.95 + (currentPercent / 100) * 1.9;

      // 目标驱动型二阶欠阻尼物理系统：
      // omega0 = 7.2 rad/s (振荡周期约 0.87s，动感充沛、敏捷而不抖动)
      // zeta = 0.23 (欠阻尼：急停或释放后产生 3~4 次富有弹性的优美液面回荡)
      const omega0 = 7.2;
      const zeta = 0.23;
      const angleSpringAcc =
        -omega0 * omega0 * (sloshAngle - targetSloshAngle) -
        2 * zeta * omega0 * sloshAngleVel;
      sloshAngleVel += angleSpringAcc * delta;
      sloshAngle += sloshAngleVel * delta;

      // 限制倾斜极限角度（+-0.62 弧度，约 +-35.5 度）
      if (sloshAngle > 0.62) {
        sloshAngle = 0.62;
        sloshAngleVel *= -0.25;
      } else if (sloshAngle < -0.62) {
        sloshAngle = -0.62;
        sloshAngleVel *= -0.25;
      }

      // 垂直涌动二阶欠阻尼解算 (omegaV = 7.6 rad/s, zetaV = 0.22，急停与释放后产生 3~4 次富有弹性的上下弹跳与回荡)
      const omegaV = 7.6;
      const zetaV = 0.22;
      const offsetSpringAcc =
        -omegaV * omegaV * (sloshOffset - targetSloshOffset) -
        2 * zetaV * omegaV * sloshOffsetVel;
      sloshOffsetVel += offsetSpringAcc * delta;
      sloshOffset += sloshOffsetVel * delta;

      // 动态物理边界：极速下移冲量下水体可一路冲至球顶内壁(+0.95)，触顶反弹后哗啦落下
      const maxAllowedOffset = Math.max(0.2, 0.95 - waterLevelY);
      const minAllowedOffset = Math.min(-0.2, -0.95 - waterLevelY);
      if (sloshOffset > maxAllowedOffset) {
        sloshOffset = maxAllowedOffset;
        if (sloshOffsetVel > 0) {
          sloshOffsetVel *= -0.35; // 撞击球顶内壁反弹，水体加速跌落
        }
      } else if (sloshOffset < minAllowedOffset) {
        sloshOffset = minAllowedOffset;
        if (sloshOffsetVel < 0) {
          sloshOffsetVel *= -0.35; // 砸向球底内壁反弹，水体弹起
        }
      }

      // 湍流波浪指数衰减
      waveTurbulence = Math.max(
        0,
        waveTurbulence - waveTurbulence * Math.min(delta * 1.6, 1),
      );

      // 激荡能量指数指数衰减 + 内部晃荡/撞击补充
      agitation = Math.max(0, agitation - agitation * Math.min(delta * 2.0, 1));
      const internalSloshAgitation = Math.min(
        1.0,
        (Math.abs(sloshAngleVel) / 8.0) * 0.4 +
          (Math.abs(sloshOffsetVel) / 3.5) * 0.6 +
          (waveTurbulence / 2.5) * 0.5,
      );
      const effectiveAgitation = Math.min(
        1.0,
        Math.max(agitation, internalSloshAgitation),
      );

      // 动态连续累加水波相位，拖动越剧烈，波涛越汹涌且完全平滑无撕裂
      wavePhase += (2.4 + waveTurbulence * 2.0) * delta;
      const timeSec = wavePhase;

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
          sloshAngle,
          sloshOffset,
          waveTurbulence,
          agitation: effectiveAgitation,
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

  return { update, destroy, notifyDrag, notifyDragEnd };
}
