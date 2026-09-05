import * as THREE from "three";
import { create3DMeterBase } from "./meter-base-3d.js";

const PLASMA_COUNT = 40;

export function mount(root) {
  let waveMesh1 = null;
  let waveMesh2 = null;
  let plasma = null;
  let plasmaPositions = null;
  let plasmaSpeeds = null;

  return create3DMeterBase(root, {
    themePrefix: "cyber",
    colors: {
      normalTop: "#c084fc",
      normalBottom: "#6b21a8",
      lowTop: "#f43f5e",
      lowBottom: "#881337",
    },
    onInitObjects({ scene, currentColorTop, currentColorBottom }) {
      // 1. 幻紫赛博等离子主浪 (Front Plasma Mesh)
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
            // 赛博电浆高频轻微脉冲波
            float wave = sin(pos.x * 4.5 + uTime * 2.6) * 0.046
                       + cos(pos.x * 3.0 - uTime * 1.9) * 0.028;
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
            vec3 plasmaColor = mix(uColorTop, uColorBottom, depthFactor);

            // 电浆层顶高亮边缘
            if (vHeight > -0.042) {
              plasmaColor += vec3(0.4, 0.35, 0.65);
            }

            gl_FragColor = vec4(plasmaColor, uOpacity);
          }
        `,
      });
      waveMesh1 = new THREE.Mesh(waveGeo1, waveMat1);
      scene.add(waveMesh1);

      // 2. 幻紫辅波浪 (Back Plasma Mesh)
      const waveGeo2 = new THREE.PlaneGeometry(2.4, 2.4, 36, 36);
      const waveMat2 = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
          uTime: { value: 0 },
          uWaterLevel: { value: 0.0 },
          uColorTop: { value: currentColorTop },
          uColorBottom: { value: currentColorBottom },
          uOpacity: { value: 0.48 },
        },
        vertexShader: `
          varying vec2 vUv;
          varying float vHeight;
          uniform float uTime;
          uniform float uWaterLevel;

          void main() {
            vUv = uv;
            vec3 pos = position;
            float wave = cos(pos.x * 3.8 + uTime * 1.8) * 0.038
                       + sin(pos.x * 2.4 - uTime * 2.1) * 0.032;
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
            vec3 plasmaColor = mix(uColorTop, uColorBottom, depthFactor) * 0.75;

            gl_FragColor = vec4(plasmaColor, uOpacity);
          }
        `,
      });
      waveMesh2 = new THREE.Mesh(waveGeo2, waveMat2);
      waveMesh2.position.z = -0.05;
      scene.add(waveMesh2);

      // 3. 赛博浮空高能微粒 (Floating Plasma Sparks)
      const plasmaGeo = new THREE.BufferGeometry();
      plasmaPositions = new Float32Array(PLASMA_COUNT * 3);
      plasmaSpeeds = new Float32Array(PLASMA_COUNT);

      for (let i = 0; i < PLASMA_COUNT; i++) {
        plasmaPositions[i * 3] = (Math.random() - 0.5) * 1.4;
        plasmaPositions[i * 3 + 1] = -0.9 + Math.random() * 1.4;
        plasmaPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
        plasmaSpeeds[i] = 0.16 + Math.random() * 0.26;
      }

      plasmaGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(plasmaPositions, 3),
      );

      const plasmaMat = new THREE.PointsMaterial({
        color: currentColorTop,
        size: 0.054,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });

      plasma = new THREE.Points(plasmaGeo, plasmaMat);
      scene.add(plasma);
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

      if (plasma && plasmaPositions) {
        for (let i = 0; i < PLASMA_COUNT; i++) {
          plasmaPositions[i * 3 + 1] += plasmaSpeeds[i] * delta;
          plasmaPositions[i * 3] += Math.sin(timeSec * 2.4 + i) * 0.0025;

          if (
            plasmaPositions[i * 3 + 1] > waterLevelY ||
            plasmaPositions[i * 3 + 1] > 0.85
          ) {
            plasmaPositions[i * 3 + 1] = -0.95 + Math.random() * 0.15;
            plasmaPositions[i * 3] = (Math.random() - 0.5) * 1.3;
          }
        }
        plasma.geometry.attributes.position.needsUpdate = true;
        plasma.material.color.copy(currentColorTop);
      }
    },
  });
}
