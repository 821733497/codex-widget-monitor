import * as THREE from "three";
import { create3DMeterBase } from "./meter-base-3d.js";

const SPARK_COUNT = 36;

export function mount(root) {
  let waveMesh1 = null;
  let waveMesh2 = null;
  let sparkParticles = null;
  let sparkPositions = null;
  let sparkSpeeds = null;

  return create3DMeterBase(root, {
    themePrefix: "crimson",
    colors: {
      normalTop: "#f43f5e",
      normalBottom: "#881337",
      lowTop: "#fb923c",
      lowBottom: "#7c2d12",
    },
    onInitObjects({ scene, currentColorTop, currentColorBottom }) {
      // 1. 绯红主能量流体 (Front Crimson Wave)
      const waveGeo1 = new THREE.PlaneGeometry(2.4, 2.4, 48, 48);
      const waveMat1 = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
          uTime: { value: 0 },
          uWaterLevel: { value: 0.0 },
          uColorTop: { value: currentColorTop },
          uColorBottom: { value: currentColorBottom },
          uOpacity: { value: 0.93 },
        },
        vertexShader: `
          varying vec2 vUv;
          varying float vHeight;
          uniform float uTime;
          uniform float uWaterLevel;

          void main() {
            vUv = uv;
            vec3 pos = position;
            // 绯红激涌波澜
            float wave = sin(pos.x * 4.2 + uTime * 2.8) * 0.046
                       + cos(pos.x * 2.8 - uTime * 2.1) * 0.026;
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

            float crest = smoothstep(-0.06, 0.0, vHeight);
            vec3 crestColor = mix(uColorTop, vec3(1.0, 0.6, 0.7), 0.45);
            vec3 baseColor = mix(uColorBottom, uColorTop, smoothstep(-1.2, 0.0, vHeight));
            vec3 finalColor = mix(baseColor, crestColor, crest * 0.85);

            gl_FragColor = vec4(finalColor, uOpacity);
          }
        `,
      });
      waveMesh1 = new THREE.Mesh(waveGeo1, waveMat1);
      scene.add(waveMesh1);

      // 2. 绯红背景次级流体 (Back Crimson Wave)
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
            float wave = sin(pos.x * 3.4 - uTime * 2.0 + 1.2) * 0.038
                       + cos(pos.x * 1.8 + uTime * 1.5) * 0.022;
            vHeight = pos.y - (uWaterLevel + wave - 0.035);
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

            vec3 baseColor = mix(uColorBottom, uColorTop, 0.4);
            gl_FragColor = vec4(baseColor, uOpacity);
          }
        `,
      });
      waveMesh2 = new THREE.Mesh(waveGeo2, waveMat2);
      waveMesh2.position.z = -0.05;
      scene.add(waveMesh2);

      // 3. 绯红星火粒子 (Crimson Ember Sparks)
      const sparkGeo = new THREE.BufferGeometry();
      sparkPositions = new Float32Array(SPARK_COUNT * 3);
      sparkSpeeds = new Float32Array(SPARK_COUNT);

      for (let i = 0; i < SPARK_COUNT; i++) {
        sparkPositions[i * 3] = (Math.random() - 0.5) * 1.4;
        sparkPositions[i * 3 + 1] = -0.9 + Math.random() * 1.4;
        sparkPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
        sparkSpeeds[i] = 0.15 + Math.random() * 0.25;
      }
      sparkGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(sparkPositions, 3),
      );

      const sparkMat = new THREE.PointsMaterial({
        color: new THREE.Color("#fda4af"),
        size: 0.048,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });
      sparkParticles = new THREE.Points(sparkGeo, sparkMat);
      scene.add(sparkParticles);
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

      if (sparkParticles && sparkPositions) {
        for (let i = 0; i < SPARK_COUNT; i++) {
          sparkPositions[i * 3 + 1] += sparkSpeeds[i] * delta;
          sparkPositions[i * 3] += Math.sin(timeSec * 2.5 + i) * 0.0025;

          if (
            sparkPositions[i * 3 + 1] > waterLevelY ||
            sparkPositions[i * 3 + 1] > 0.85
          ) {
            sparkPositions[i * 3 + 1] = -0.95 + Math.random() * 0.15;
            sparkPositions[i * 3] = (Math.random() - 0.5) * 1.3;
          }
        }
        sparkParticles.geometry.attributes.position.needsUpdate = true;
        sparkParticles.material.color.copy(currentColorTop);
      }
    },
  });
}
