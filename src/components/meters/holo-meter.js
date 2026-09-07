import * as THREE from "three";
import { create3DMeterBase } from "./meter-base-3d.js";

const PARTICLE_COUNT = 54;

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
          uSloshAngle: { value: 0.0 },
          uSloshOffset: { value: 0.0 },
          uWaveTurbulence: { value: 0.0 },
          uColorTop: { value: currentColorTop },
          uColorBottom: { value: currentColorBottom },
          uOpacity: { value: 0.88 },
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
            float turb = 1.0 + uWaveTurbulence * 1.5;
            float wave = (sin(pos.x * 4.2 + uTime * 2.0) * 0.052
                       + cos(pos.x * 2.8 - uTime * 1.5) * 0.030) * turb;
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
          uSloshAngle: { value: 0.0 },
          uSloshOffset: { value: 0.0 },
          uWaveTurbulence: { value: 0.0 },
          uColorTop: { value: currentColorTop },
          uColorBottom: { value: currentColorBottom },
          uOpacity: { value: 0.45 },
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
            float turb = 1.0 + uWaveTurbulence * 1.3;
            float wave = (cos(pos.x * 3.6 + uTime * 1.5) * 0.040
                       + sin(pos.x * 2.0 - uTime * 1.8) * 0.032) * turb;
            float sloshY = -pos.x * sin(uSloshAngle * 0.85);
            float verticalDome = max(0.0, 1.0 - pos.x * pos.x * 1.8) * uSloshOffset * 0.30;
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

      // 激荡气泡群更新 (Agitation Dynamic Bubbles)
      if (particles && particlePositions) {
        // 静止时活跃少量呼吸微粒，激荡时激活全量气泡喷涌
        const minActive = 10;
        const activeCount = Math.round(
          minActive +
            (PARTICLE_COUNT - minActive) * Math.min(1, agitation * 1.5),
        );
        const speedMult = 1.0 + agitation * 2.4 + waveTurbulence * 0.4;

        if (particles.material) {
          particles.material.opacity = Math.min(0.95, 0.65 + agitation * 0.3);
        }

        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const idx = i * 3;
          if (i >= activeCount) {
            // 未激活气泡置于可视区外隐藏
            particlePositions[idx + 1] = -2.0;
            continue;
          }

          // 刚被激活的气泡从底部生成
          if (particlePositions[idx + 1] < -1.1) {
            particlePositions[idx + 1] = -0.95 + Math.random() * 0.2;
            particlePositions[idx] = (Math.random() - 0.5) * 1.3;
          }

          // 气泡升腾速度随激荡暴增
          particlePositions[idx + 1] += particleSpeeds[i] * speedMult * delta;

          // 紊流横向摆动 + 随水流倾角流动
          particlePositions[idx] +=
            (Math.sin(timeSec * 3.2 + i * 1.3) * 0.003 +
              sloshAngle * delta * 0.1) *
            (1.0 + agitation * 1.5);

          // 结合水面倾角与弧面形变检测水面破裂
          const px = particlePositions[idx];
          const dome = Math.max(0.0, 1.0 - px * px * 1.8) * sloshOffset * 0.35;
          const currentWaterSurface =
            waterLevelY + sloshOffset + dome - px * Math.sin(sloshAngle);

          // 气泡触碰水面瞬间破裂，从底部重新生成
          if (
            particlePositions[idx + 1] > currentWaterSurface ||
            particlePositions[idx + 1] > 0.88
          ) {
            particlePositions[idx + 1] = -0.95 + Math.random() * 0.15;
            particlePositions[idx] = (Math.random() - 0.5) * 1.3;
          }
        }
        particles.geometry.attributes.position.needsUpdate = true;
        particles.material.color.copy(currentColorTop);
      }
    },
  });
}
