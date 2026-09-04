import * as THREE from "three";

export function mount(root) {
  const meter = document.createElement("div");
  meter.className = "holo-meter";
  meter.setAttribute("role", "img");
  meter.setAttribute("aria-live", "polite");
  meter.dataset.mode = "panel";
  meter.dataset.dock = "none";
  meter.dataset.level = "normal";

  // 外围全息环境光晕
  const glow = document.createElement("div");
  glow.className = "holo-meter-glow";

  // 核心圆球视口容器（保证无论何种尺寸都是绝对正圆且内容严格居中）
  const sphereContainer = document.createElement("div");
  sphereContainer.className = "holo-sphere-container";

  // 3D Canvas
  const canvas = document.createElement("canvas");
  canvas.className = "holo-canvas";

  // 顶部 3D 水晶高光罩
  const glassReflect = document.createElement("div");
  glassReflect.className = "holo-glass-reflect";

  // 居中文字层
  const content = document.createElement("div");
  content.className = "holo-content";

  const percentEl = document.createElement("div");
  percentEl.className = "holo-percent";
  percentEl.textContent = "--%";

  const labelEl = document.createElement("div");
  labelEl.className = "holo-label";
  labelEl.textContent = "剩余";

  content.append(percentEl, labelEl);
  sphereContainer.append(canvas, glassReflect, content);
  meter.append(glow, sphereContainer);
  root.append(meter);

  // 3D 场景与 WebGL 运行时
  let renderer = null;
  let scene = null;
  let camera = null;
  let animId = null;
  let isDestroyed = false;

  // 3D 对象
  let waveMesh1 = null;
  let waveMesh2 = null;
  let particles = null;
  let particlePositions = null;
  let particleSpeeds = null;
  const PARTICLE_COUNT = 36;

  // 状态变量
  let currentSize = 130;
  let targetPercent = 50;
  let currentPercent = 50;
  let isLowLevel = false;

  // 材质与颜色
  const normalColorTop = new THREE.Color("#38bdf8"); // 冷青蓝
  const normalColorBottom = new THREE.Color("#0369a1");
  const lowColorTop = new THREE.Color("#ef4444"); // 警报红
  const lowColorBottom = new THREE.Color("#991b1b");
  const currentColorTop = new THREE.Color("#38bdf8");
  const currentColorBottom = new THREE.Color("#0369a1");

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

      initThreeObjects();
      resize(130);
      startAnimation();
    }
  } catch (_error) {
    renderer = null;
  }

  function initThreeObjects() {
    // 1. 主能量波浪网格 (Front Wave Mesh)
    const waveGeo1 = new THREE.PlaneGeometry(2.4, 2.4, 48, 48);
    const waveMat1 = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uWaterLevel: { value: 0.0 },
        uColorTop: { value: currentColorTop },
        uColorBottom: { value: currentColorBottom },
        uOpacity: { value: 0.88 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying float vHeight;
        uniform float uTime;
        uniform float uWaterLevel;

        void main() {
          vUv = uv;
          vec3 pos = position;
          // 水面波浪扰动计算
          float wave = sin(pos.x * 4.2 + uTime * 2.4) * 0.045
                     + cos(pos.x * 2.8 - uTime * 1.8) * 0.025;
          vHeight = pos.y - (uWaterLevel + wave);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying float vHeight;
        uniform vec3 uColorTop;
        uniform vec3 uColorBottom;
        uniform float uOpacity;

        void main() {
          // 水位以上裁剪
          if (vHeight > 0.0) discard;

          // 正圆裁剪 (以中心 0.0 为圆心)
          vec2 centerUv = (vUv - 0.5) * 2.0;
          if (dot(centerUv, centerUv) > 1.0) discard;

          // 能量水体纵深渐变 + 水面边缘高光电弧
          float depthFactor = clamp(-vHeight * 1.8, 0.0, 1.0);
          vec3 waterColor = mix(uColorTop, uColorBottom, depthFactor);

          // 水面高光发光边缘
          if (vHeight > -0.04) {
            waterColor += vec3(0.35, 0.45, 0.6);
          }

          gl_FragColor = vec4(waterColor, uOpacity);
        }
      `,
    });
    waveMesh1 = new THREE.Mesh(waveGeo1, waveMat1);
    scene.add(waveMesh1);

    // 2. 辅波浪深层网格 (Back Wave Mesh)
    const waveGeo2 = new THREE.PlaneGeometry(2.4, 2.4, 36, 36);
    const waveMat2 = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uWaterLevel: { value: 0.0 },
        uColorTop: { value: currentColorTop },
        uColorBottom: { value: currentColorBottom },
        uOpacity: { value: 0.45 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying float vHeight;
        uniform float uTime;
        uniform float uWaterLevel;

        void main() {
          vUv = uv;
          vec3 pos = position;
          // 错相位的深层微波
          float wave = cos(pos.x * 3.6 - uTime * 1.9) * 0.05
                     + sin(pos.x * 5.1 + uTime * 1.3) * 0.02;
          vHeight = pos.y - (uWaterLevel + wave - 0.02);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying float vHeight;
        uniform vec3 uColorTop;
        uniform vec3 uColorBottom;
        uniform float uOpacity;

        void main() {
          if (vHeight > 0.0) discard;
          vec2 centerUv = (vUv - 0.5) * 2.0;
          if (dot(centerUv, centerUv) > 1.0) discard;

          vec3 backColor = mix(uColorTop * 0.8, uColorBottom * 0.6, clamp(-vHeight * 2.0, 0.0, 1.0));
          gl_FragColor = vec4(backColor, uOpacity);
        }
      `,
    });
    waveMesh2 = new THREE.Mesh(waveGeo2, waveMat2);
    waveMesh2.position.z = -0.1;
    scene.add(waveMesh2);

    // 3. 升腾的量子发光微粒子 (Rising Quantum Photons)
    particlePositions = new Float32Array(PARTICLE_COUNT * 3);
    particleSpeeds = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 1.4;
      particlePositions[i * 3 + 1] = -0.9 + Math.random() * 1.6;
      particlePositions[i * 3 + 2] = 0.05;
      particleSpeeds[i] = 0.18 + Math.random() * 0.35;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(particlePositions, 3),
    );
    const particleMat = new THREE.PointsMaterial({
      size: 0.05,
      color: currentColorTop,
      transparent: true,
      opacity: 0.85,
    });
    particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);
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

      if (waveMesh1) {
        waveMesh1.material.uniforms.uTime.value = timeSec;
        waveMesh1.material.uniforms.uWaterLevel.value = waterLevelY;
      }

      if (waveMesh2) {
        waveMesh2.material.uniforms.uTime.value = timeSec;
        waveMesh2.material.uniforms.uWaterLevel.value = waterLevelY;
      }

      // 更新发光粒子升腾
      if (particles && particlePositions) {
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          particlePositions[i * 3 + 1] += particleSpeeds[i] * delta;
          // 漂浮扰动
          particlePositions[i * 3] += Math.sin(timeSec * 2.0 + i) * 0.002;

          // 粒子升腾到水面以上时重置到底部
          if (
            particlePositions[i * 3 + 1] > waterLevelY ||
            particlePositions[i * 3 + 1] > 0.85
          ) {
            particlePositions[i * 3 + 1] = -0.95 + Math.random() * 0.15;
            particlePositions[i * 3] = (Math.random() - 0.5) * 1.3;
          }
        }
        particles.geometry.attributes.position.needsUpdate = true;
        particles.material.color.copy(currentColorTop);
      }

      renderer.render(scene, camera);
      animId = requestAnimationFrame(tick);
    }
    animId = requestAnimationFrame(tick);
  }

  function update({
    percent: nextPercent,
    level,
    label: nextLabel,
    mode = "panel",
    dock = "none",
    ballSize = "medium",
  } = {}) {
    const rawPercent = nextPercent;
    const isFinite =
      typeof rawPercent === "number" && Number.isFinite(rawPercent);
    const clampedPercent = isFinite
      ? Math.max(0, Math.min(100, rawPercent))
      : null;
    const rounded = clampedPercent !== null ? Math.round(clampedPercent) : null;

    targetPercent = rounded !== null ? rounded : 0;
    const displayPercent = rounded !== null ? `${rounded}%` : "--%";
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

    // 动态同步视口尺寸
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
