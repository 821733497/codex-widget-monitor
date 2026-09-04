import * as THREE from "three";
import { create3DMeterBase } from "./meter-base-3d.js";

const PARTICLE_COUNT = 36;

export function mount(root) {
  let waveMesh1 = null;
  let waveMesh2 = null;
  let particles = null;
  let particlePositions = null;
  let particleSpeeds = null;

  return create3DMeterBase(root, {
    themePrefix: "holo",
    colors: {
      normalTop: "#38bdf8",
      normalBottom: "#0369a1",
      lowTop: "#ef4444",
      lowBottom: "#991b1b",
    },
    onInitObjects({ scene, currentColorTop, currentColorBottom }) {
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
            float wave = cos(pos.x * 3.6 + uTime * 1.6) * 0.035
                       + sin(pos.x * 2.0 - uTime * 2.2) * 0.03;
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
            vec3 waterColor = mix(uColorTop, uColorBottom, depthFactor) * 0.75;

            gl_FragColor = vec4(waterColor, uOpacity);
          }
        `,
      });
      waveMesh2 = new THREE.Mesh(waveGeo2, waveMat2);
      waveMesh2.position.z = -0.05;
      scene.add(waveMesh2);

      // 3. 悬浮能量微粒 (Floating Energy Particles)
      const particleGeo = new THREE.BufferGeometry();
      particlePositions = new Float32Array(PARTICLE_COUNT * 3);
      particleSpeeds = new Float32Array(PARTICLE_COUNT);

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particlePositions[i * 3] = (Math.random() - 0.5) * 1.4;
        particlePositions[i * 3 + 1] = -0.9 + Math.random() * 1.4;
        particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
        particleSpeeds[i] = 0.15 + Math.random() * 0.25;
      }

      particleGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(particlePositions, 3),
      );

      const particleMat = new THREE.PointsMaterial({
        color: currentColorTop,
        size: 0.05,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
      });

      particles = new THREE.Points(particleGeo, particleMat);
      scene.add(particles);
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
    },
  });
}
