import * as THREE from "three";
import { create3DMeterBase } from "./meter-base-3d.js";

const SPORE_COUNT = 36;

export function mount(root) {
  let waveMesh1 = null;
  let waveMesh2 = null;
  let spores = null;
  let sporePositions = null;
  let sporeSpeeds = null;

  return create3DMeterBase(root, {
    themePrefix: "emerald",
    colors: {
      normalTop: "#34d399",
      normalBottom: "#047857",
      lowTop: "#f97316",
      lowBottom: "#9a3412",
    },
    onInitObjects({ scene, currentColorTop, currentColorBottom }) {
      // 1. 翡翠主能量波浪 (Front Wave Mesh)
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
            // 极光律动波浪
            float wave = sin(pos.x * 3.8 + uTime * 2.2) * 0.042
                       + cos(pos.x * 2.5 - uTime * 1.7) * 0.026;
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

            float depthFactor = clamp(-vHeight * 1.75, 0.0, 1.0);
            vec3 waterColor = mix(uColorTop, uColorBottom, depthFactor);

            if (vHeight > -0.04) {
              waterColor += vec3(0.25, 0.55, 0.45);
            }

            gl_FragColor = vec4(waterColor, uOpacity);
          }
        `,
      });
      waveMesh1 = new THREE.Mesh(waveGeo1, waveMat1);
      scene.add(waveMesh1);

      // 2. 翡翠辅波浪 (Back Wave Mesh)
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
            float wave = cos(pos.x * 3.4 + uTime * 1.5) * 0.032
                       + sin(pos.x * 2.2 - uTime * 2.0) * 0.028;
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
            vec3 waterColor = mix(uColorTop, uColorBottom, depthFactor) * 0.72;

            gl_FragColor = vec4(waterColor, uOpacity);
          }
        `,
      });
      waveMesh2 = new THREE.Mesh(waveGeo2, waveMat2);
      waveMesh2.position.z = -0.05;
      scene.add(waveMesh2);

      // 3. 悬浮生机光微粒
      const sporeGeo = new THREE.BufferGeometry();
      sporePositions = new Float32Array(SPORE_COUNT * 3);
      sporeSpeeds = new Float32Array(SPORE_COUNT);

      for (let i = 0; i < SPORE_COUNT; i++) {
        sporePositions[i * 3] = (Math.random() - 0.5) * 1.4;
        sporePositions[i * 3 + 1] = -0.9 + Math.random() * 1.4;
        sporePositions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
        sporeSpeeds[i] = 0.14 + Math.random() * 0.22;
      }

      sporeGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(sporePositions, 3),
      );

      const sporeMat = new THREE.PointsMaterial({
        color: currentColorTop,
        size: 0.052,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
      });

      spores = new THREE.Points(sporeGeo, sporeMat);
      scene.add(spores);
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

      if (spores && sporePositions) {
        for (let i = 0; i < SPORE_COUNT; i++) {
          sporePositions[i * 3 + 1] += sporeSpeeds[i] * delta;
          sporePositions[i * 3] += Math.sin(timeSec * 2.2 + i) * 0.0022;

          if (
            sporePositions[i * 3 + 1] > waterLevelY ||
            sporePositions[i * 3 + 1] > 0.85
          ) {
            sporePositions[i * 3 + 1] = -0.95 + Math.random() * 0.15;
            sporePositions[i * 3] = (Math.random() - 0.5) * 1.3;
          }
        }
        spores.geometry.attributes.position.needsUpdate = true;
        spores.material.color.copy(currentColorTop);
      }
    },
  });
}
