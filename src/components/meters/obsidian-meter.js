import * as THREE from "three";
import { create3DMeterBase } from "./meter-base-3d.js";

const GOLD_DUST_COUNT = 38;

export function mount(root) {
  let waveMesh1 = null;
  let waveMesh2 = null;
  let goldDust = null;
  let dustPositions = null;
  let dustSpeeds = null;

  return create3DMeterBase(root, {
    themePrefix: "obsidian",
    colors: {
      normalTop: "#fde047",
      normalBottom: "#854d0e",
      lowTop: "#ef4444",
      lowBottom: "#7f1d1d",
    },
    onInitObjects({ scene, currentColorTop, currentColorBottom }) {
      // 1. 暗金曜石主能量流体 (Front Gold Liquid Mesh)
      const waveGeo1 = new THREE.PlaneGeometry(2.4, 2.4, 48, 48);
      const waveMat1 = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
          uTime: { value: 0 },
          uWaterLevel: { value: 0.0 },
          uColorTop: { value: currentColorTop },
          uColorBottom: { value: currentColorBottom },
          uOpacity: { value: 0.92 },
        },
        vertexShader: `
          varying vec2 vUv;
          varying float vHeight;
          uniform float uTime;
          uniform float uWaterLevel;

          void main() {
            vUv = uv;
            vec3 pos = position;
            // 沉稳液态金流浪涌
            float wave = sin(pos.x * 3.6 + uTime * 2.0) * 0.04
                       + cos(pos.x * 2.2 - uTime * 1.5) * 0.024;
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

            float depthFactor = clamp(-vHeight * 1.8, 0.0, 1.0);
            vec3 liquidColor = mix(uColorTop, uColorBottom, depthFactor);

            // 金箔液面流光
            if (vHeight > -0.04) {
              liquidColor += vec3(0.45, 0.4, 0.2);
            }

            gl_FragColor = vec4(liquidColor, uOpacity);
          }
        `,
      });
      waveMesh1 = new THREE.Mesh(waveGeo1, waveMat1);
      scene.add(waveMesh1);

      // 2. 辅浪深层网格
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
            float wave = cos(pos.x * 3.2 + uTime * 1.4) * 0.03
                       + sin(pos.x * 2.0 - uTime * 1.8) * 0.025;
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

            float depthFactor = clamp(-vHeight * 1.5, 0.0, 1.0);
            vec3 liquidColor = mix(uColorTop, uColorBottom, depthFactor) * 0.7;

            gl_FragColor = vec4(liquidColor, uOpacity);
          }
        `,
      });
      waveMesh2 = new THREE.Mesh(waveGeo2, waveMat2);
      waveMesh2.position.z = -0.05;
      scene.add(waveMesh2);

      // 3. 曜金浮游金粉微粒
      const dustGeo = new THREE.BufferGeometry();
      dustPositions = new Float32Array(GOLD_DUST_COUNT * 3);
      dustSpeeds = new Float32Array(GOLD_DUST_COUNT);

      for (let i = 0; i < GOLD_DUST_COUNT; i++) {
        dustPositions[i * 3] = (Math.random() - 0.5) * 1.4;
        dustPositions[i * 3 + 1] = -0.9 + Math.random() * 1.4;
        dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
        dustSpeeds[i] = 0.12 + Math.random() * 0.2;
      }

      dustGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(dustPositions, 3),
      );

      const dustMat = new THREE.PointsMaterial({
        color: currentColorTop,
        size: 0.055,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });

      goldDust = new THREE.Points(dustGeo, dustMat);
      scene.add(goldDust);
    },
    onRenderTick({ timeSec, delta, waterLevelY, currentColorTop }) {
      if (waveMesh1) {
        waveMesh1.material.uniforms.uTime.value = timeSec;
        waveMesh1.material.uniforms.uWaterLevel.value = waterLevelY;
      }

      if (waveMesh2) {
        waveMesh2.material.uniforms.uTime.value = timeSec;
        waveMesh2.material.uniforms.uWaterLevel.value = waterLevelY;
      }

      if (goldDust && dustPositions) {
        for (let i = 0; i < GOLD_DUST_COUNT; i++) {
          dustPositions[i * 3 + 1] += dustSpeeds[i] * delta;
          dustPositions[i * 3] += Math.sin(timeSec * 1.8 + i) * 0.002;

          if (
            dustPositions[i * 3 + 1] > waterLevelY ||
            dustPositions[i * 3 + 1] > 0.85
          ) {
            dustPositions[i * 3 + 1] = -0.95 + Math.random() * 0.15;
            dustPositions[i * 3] = (Math.random() - 0.5) * 1.3;
          }
        }
        goldDust.geometry.attributes.position.needsUpdate = true;
        goldDust.material.color.copy(currentColorTop);
      }
    },
  });
}
