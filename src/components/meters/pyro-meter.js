import * as THREE from "three";
import { create3DMeterBase } from "./meter-base-3d.js";

const EMBER_COUNT = 54;
const OUTER_COUNT = 32;

export function mount(root) {
  let waveMesh1 = null;
  let waveMesh2 = null;
  let embers = null;
  let emberPositions = null;
  let emberSpeeds = null;
  let outerEmbers = null;
  let outerPositions = null;
  let outerSpeeds = null;

  return create3DMeterBase(root, {
    themePrefix: "pyro",
    colors: {
      normalTop: "#fbbf24",
      normalBottom: "#b91c1c",
      lowTop: "#f87171",
      lowBottom: "#7f1d1d",
    },
    onInitObjects({ scene, currentColorTop, currentColorBottom }) {
      // 1. 烈焰主浪网格 (Front Fire Wave Mesh)
      const waveGeo1 = new THREE.PlaneGeometry(2.4, 2.4, 48, 48);
      const waveMat1 = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
          uTime: { value: 0 },
          uWaterLevel: { value: 0.0 },
          uSloshAngle: { value: 0.0 },
          uSloshOffset: { value: 0.0 },
          uWaveTurbulence: { value: 0.0 },
          uColorTop: { value: currentColorTop },
          uColorBottom: { value: currentColorBottom },
          uOpacity: { value: 0.9 },
        },
        vertexShader: `
          varying vec2 vUv;
          varying float vHeight;
          uniform float uTime;
          uniform float uWaterLevel;
          uniform float uSloshAngle;
          uniform float uSloshOffset;
          uniform float uWaveTurbulence;

          void main() {
            vUv = uv;
            vec3 pos = position;
            float turb = 1.0 + uWaveTurbulence * 1.6;
            // 狂烈岩浆波浪扰动 + 晃动增强
            float wave = (sin(pos.x * 4.8 + uTime * 2.2) * 0.056
                       + cos(pos.x * 3.2 - uTime * 1.6) * 0.034) * turb;
            float sloshY = -pos.x * sin(uSloshAngle);
            float verticalDome = max(0.0, 1.0 - pos.x * pos.x * 1.8) * uSloshOffset * 0.35;
            vHeight = pos.y - (uWaterLevel + uSloshOffset + verticalDome + sloshY + wave);
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
          uSloshAngle: { value: 0.0 },
          uSloshOffset: { value: 0.0 },
          uWaveTurbulence: { value: 0.0 },
          uColorTop: { value: currentColorTop },
          uColorBottom: { value: currentColorBottom },
          uOpacity: { value: 0.5 },
        },
        vertexShader: `
          varying vec2 vUv;
          varying float vHeight;
          uniform float uTime;
          uniform float uWaterLevel;
          uniform float uSloshAngle;
          uniform float uSloshOffset;
          uniform float uWaveTurbulence;

          void main() {
            vUv = uv;
            vec3 pos = position;
            float turb = 1.0 + uWaveTurbulence * 1.4;
            float wave = (cos(pos.x * 4.1 - uTime * 1.8) * 0.054
                       + sin(pos.x * 5.6 + uTime * 1.4) * 0.026) * turb;
            float sloshY = -pos.x * sin(uSloshAngle * 0.85);
            float verticalDome = max(0.0, 1.0 - pos.x * pos.x * 1.8) * uSloshOffset * 0.30;
            vHeight = pos.y - (uWaterLevel + uSloshOffset + verticalDome + sloshY + wave - 0.02);
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

            float backColor = mix(uColorTop * 0.85, uColorBottom * 0.65, clamp(-vHeight * 2.0, 0.0, 1.0));
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
    },
    onRenderTick({
      timeSec,
      delta,
      waterLevelY,
      currentColorTop,
      sloshAngle = 0,
      sloshOffset = 0,
      waveTurbulence = 0,
      agitation = 0,
    }) {
      if (waveMesh1) {
        waveMesh1.material.uniforms.uTime.value = timeSec;
        waveMesh1.material.uniforms.uWaterLevel.value = waterLevelY;
        waveMesh1.material.uniforms.uSloshAngle.value = sloshAngle;
        waveMesh1.material.uniforms.uSloshOffset.value = sloshOffset;
        waveMesh1.material.uniforms.uWaveTurbulence.value = waveTurbulence;
      }

      if (waveMesh2) {
        waveMesh2.material.uniforms.uTime.value = timeSec;
        waveMesh2.material.uniforms.uWaterLevel.value = waterLevelY;
        waveMesh2.material.uniforms.uSloshAngle.value = sloshAngle;
        waveMesh2.material.uniforms.uSloshOffset.value = sloshOffset;
        waveMesh2.material.uniforms.uWaveTurbulence.value = waveTurbulence;
      }

      // 更新熔浆内部激荡火星与气泡升腾 (Agitation Embers & Bubbles)
      if (embers && emberPositions) {
        const minActive = 10;
        const activeCount = Math.round(
          minActive + (EMBER_COUNT - minActive) * Math.min(1, agitation * 1.5),
        );
        const speedMult = 1.0 + agitation * 2.4 + waveTurbulence * 0.4;

        if (embers.material) {
          embers.material.opacity = Math.min(0.98, 0.7 + agitation * 0.28);
        }

        for (let i = 0; i < EMBER_COUNT; i++) {
          const idx = i * 3;
          if (i >= activeCount) {
            emberPositions[idx + 1] = -2.0;
            continue;
          }

          if (emberPositions[idx + 1] < -1.1) {
            emberPositions[idx + 1] = -0.95 + Math.random() * 0.2;
            emberPositions[idx] = (Math.random() - 0.5) * 1.3;
          }

          emberPositions[idx + 1] += emberSpeeds[i] * speedMult * delta;
          emberPositions[idx] +=
            (Math.sin(timeSec * 3.6 + i * 1.2) * 0.0035 +
              sloshAngle * delta * 0.1) *
            (1.0 + agitation * 1.5);

          const px = emberPositions[idx];
          const dome = Math.max(0.0, 1.0 - px * px * 1.8) * sloshOffset * 0.35;
          const currentWaterSurface =
            waterLevelY + sloshOffset + dome - px * Math.sin(sloshAngle);

          if (
            emberPositions[idx + 1] > currentWaterSurface ||
            emberPositions[idx + 1] > 0.88
          ) {
            emberPositions[idx + 1] = -0.95 + Math.random() * 0.15;
            emberPositions[idx] = (Math.random() - 0.5) * 1.3;
          }
        }
        embers.geometry.attributes.position.needsUpdate = true;
        embers.material.color.copy(currentColorTop);
      }

      // 更新球外边缘跳跃升腾的火星粒子
      if (outerEmbers && outerPositions) {
        const outerSpeedMult = 1.0 + agitation * 1.8;
        for (let i = 0; i < OUTER_COUNT; i++) {
          outerPositions[i * 3 + 1] += outerSpeeds[i] * outerSpeedMult * delta;
          outerPositions[i * 3] +=
            Math.sin(timeSec * 4.5 + i * 2.0) * 0.005 +
            sloshAngle * delta * 0.1;

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
    },
  });
}
