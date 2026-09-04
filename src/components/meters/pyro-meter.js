import * as THREE from "three";

export function mount(root) {
  const meter = document.createElement("div");
  meter.className = "pyro-meter";
  meter.setAttribute("role", "img");
  meter.setAttribute("aria-live", "polite");
  meter.dataset.mode = "panel";
  meter.dataset.dock = "none";
  meter.dataset.level = "normal";

  // 外围熔岩呼吸暖光
  const glow = document.createElement("div");
  glow.className = "pyro-meter-glow";

  // 核心圆球容器（高透水晶力场，无死板黑底与硬线条）
  const sphereContainer = document.createElement("div");
  sphereContainer.className = "pyro-sphere-container";

  // 3D Canvas
  const canvas = document.createElement("canvas");
  canvas.className = "pyro-canvas";

  // 顶部暖金微弧反射
  const glassReflect = document.createElement("div");
  glassReflect.className = "pyro-glass-reflect";

  // 居中文字层
  const content = document.createElement("div");
  content.className = "pyro-content";

  const percentEl = document.createElement("div");
  percentEl.className = "pyro-percent";
  percentEl.textContent = "--%";

  const labelEl = document.createElement("div");
  labelEl.className = "pyro-label";
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

  // 3D 烈焰对象
  let waveMesh1 = null;
  let waveMesh2 = null;
  let embers = null;
  let emberPositions = null;
  let emberSpeeds = null;
  const EMBER_COUNT = 40;

  // 球外飞溅火星微粒
  let outerEmbers = null;
  let outerPositions = null;
  let outerSpeeds = null;
  const OUTER_COUNT = 32;

  // 状态变量
  let currentSize = 130;
  let targetPercent = 50;
  let currentPercent = 50;
  let isLowLevel = false;

  // 烈焰配色：熔金橙 (#fbbf24) -> 炽烈火红 (#ef4444) -> 深焰熔浆 (#991b1b)
  const normalColorTop = new THREE.Color("#fbbf24");
  const normalColorBottom = new THREE.Color("#b91c1c");
  const lowColorTop = new THREE.Color("#f87171");
  const lowColorBottom = new THREE.Color("#7f1d1d");
  const currentColorTop = new THREE.Color("#fbbf24");
  const currentColorBottom = new THREE.Color("#b91c1c");

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
    // 1. 烈焰主浪网格 (Front Fire Wave Mesh)
    const waveGeo1 = new THREE.PlaneGeometry(2.4, 2.4, 48, 48);
    const waveMat1 = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uWaterLevel: { value: 0.0 },
        uColorTop: { value: currentColorTop },
        uColorBottom: { value: currentColorBottom },
        uOpacity: { value: 0.9 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying float vHeight;
        uniform float uTime;
        uniform float uWaterLevel;

        void main() {
          vUv = uv;
          vec3 pos = position;
          // 狂烈岩浆波浪扰动
          float wave = sin(pos.x * 4.8 + uTime * 2.8) * 0.05
                     + cos(pos.x * 3.2 - uTime * 2.1) * 0.03;
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
          if (vHeight > 0.0) discard;
          vec2 centerUv = (vUv - 0.5) * 2.0;
          if (dot(centerUv, centerUv) > 1.0) discard;

          float depthFactor = clamp(-vHeight * 1.7, 0.0, 1.0);
          vec3 magmaColor = mix(uColorTop, uColorBottom, depthFactor);

          // 熔浆边缘炽热高光带
          if (vHeight > -0.045) {
            magmaColor += vec3(0.5, 0.45, 0.25);
          }

          gl_FragColor = vec4(magmaColor, uOpacity);
        }
      `,
    });
    waveMesh1 = new THREE.Mesh(waveGeo1, waveMat1);
    scene.add(waveMesh1);

    // 2. 烈焰辅浪深层网格 (Back Fire Wave Mesh)
    const waveGeo2 = new THREE.PlaneGeometry(2.4, 2.4, 36, 36);
    const waveMat2 = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uWaterLevel: { value: 0.0 },
        uColorTop: { value: currentColorTop },
        uColorBottom: { value: currentColorBottom },
        uOpacity: { value: 0.5 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying float vHeight;
        uniform float uTime;
        uniform float uWaterLevel;

        void main() {
          vUv = uv;
          vec3 pos = position;
          float wave = cos(pos.x * 4.1 - uTime * 2.3) * 0.055
                     + sin(pos.x * 5.6 + uTime * 1.7) * 0.025;
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

          vec3 backColor = mix(uColorTop * 0.85, uColorBottom * 0.65, clamp(-vHeight * 2.0, 0.0, 1.0));
          gl_FragColor = vec4(backColor, uOpacity);
        }
      `,
    });
    waveMesh2 = new THREE.Mesh(waveGeo2, waveMat2);
    waveMesh2.position.z = -0.1;
    scene.add(waveMesh2);

    // 3. 升腾的火星灰烬粒子 (Rising Fire Embers)
    emberPositions = new Float32Array(EMBER_COUNT * 3);
    emberSpeeds = new Float32Array(EMBER_COUNT);

    for (let i = 0; i < EMBER_COUNT; i++) {
      emberPositions[i * 3] = (Math.random() - 0.5) * 1.4;
      emberPositions[i * 3 + 1] = -0.9 + Math.random() * 1.6;
      emberPositions[i * 3 + 2] = 0.05;
      emberSpeeds[i] = 0.22 + Math.random() * 0.45;
    }

    const emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(emberPositions, 3),
    );
    const emberMat = new THREE.PointsMaterial({
      size: 0.055,
      color: currentColorTop,
      transparent: true,
      opacity: 0.9,
    });
    embers = new THREE.Points(emberGeo, emberMat);
    scene.add(embers);

    // 4. 球外飞溅缭绕火星粒子 (Outer Flame Leaping Sparks)
    outerPositions = new Float32Array(OUTER_COUNT * 3);
    outerSpeeds = new Float32Array(OUTER_COUNT);

    for (let i = 0; i < OUTER_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.86 + Math.random() * 0.12;
      outerPositions[i * 3] = Math.cos(angle) * radius;
      outerPositions[i * 3 + 1] = Math.sin(angle) * radius;
      outerPositions[i * 3 + 2] = 0.08;
      outerSpeeds[i] = 0.35 + Math.random() * 0.55;
    }

    const outerGeo = new THREE.BufferGeometry();
    outerGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(outerPositions, 3),
    );
    const outerMat = new THREE.PointsMaterial({
      size: 0.065,
      color: currentColorTop,
      transparent: true,
      opacity: 0.95,
    });
    outerEmbers = new THREE.Points(outerGeo, outerMat);
    scene.add(outerEmbers);
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

      // 平滑插值水位百分比
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

      // 更新熔浆内部火星飘逸升腾
      if (embers && emberPositions) {
        for (let i = 0; i < EMBER_COUNT; i++) {
          emberPositions[i * 3 + 1] += emberSpeeds[i] * delta;
          emberPositions[i * 3] += Math.sin(timeSec * 3.0 + i) * 0.003;

          if (
            emberPositions[i * 3 + 1] > waterLevelY ||
            emberPositions[i * 3 + 1] > 0.85
          ) {
            emberPositions[i * 3 + 1] = -0.95 + Math.random() * 0.15;
            emberPositions[i * 3] = (Math.random() - 0.5) * 1.3;
          }
        }
        embers.geometry.attributes.position.needsUpdate = true;
        embers.material.color.copy(currentColorTop);
      }

      // 更新球外边缘跳跃升腾的火星粒子
      if (outerEmbers && outerPositions) {
        for (let i = 0; i < OUTER_COUNT; i++) {
          outerPositions[i * 3 + 1] += outerSpeeds[i] * delta;
          outerPositions[i * 3] += Math.sin(timeSec * 4.5 + i * 2.0) * 0.005;

          // 飞升到顶端或者超出边界后从球体底部外围重新喷发
          if (outerPositions[i * 3 + 1] > 0.96) {
            const bottomAngle = -Math.PI * 0.8 + Math.random() * Math.PI * 0.6;
            const r = 0.86 + Math.random() * 0.12;
            outerPositions[i * 3] = Math.cos(bottomAngle) * r;
            outerPositions[i * 3 + 1] = Math.sin(bottomAngle) * r;
          }
        }
        outerEmbers.geometry.attributes.position.needsUpdate = true;
        outerEmbers.material.color.copy(currentColorTop);
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
