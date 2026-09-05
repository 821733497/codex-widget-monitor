import * as THREE from "three";
import { create3DMeterBase } from "./meter-base-3d.js";

const PETAL_COUNT = 36;

export function mount(root) {
  let waveMesh1 = null;
  let waveMesh2 = null;
  let petalParticles = null;
  let petalPositions = null;
  let petalSpeeds = null;

  return create3DMeterBase(root, {
    themePrefix: "sakura",
    colors: {
      normalTop: "#f472b6",
      normalBottom: "#9d174d",
      lowTop: "#fb923c",
      lowBottom: "#7c2d12",
    },
    onInitObjects({ scene, currentColorTop, currentColorBottom }) {
      // 1. 落樱主能量流体 (Front Sakura Wave)
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
            // 优雅柔顺轻盈樱浪
            float wave = sin(pos.x * 3.8 + uTime * 2.2) * 0.038
                       + cos(pos.x * 2.4 - uTime * 1.6) * 0.022;
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
            vec3 crestColor = mix(uColorTop, vec3(1.0, 0.85, 0.92), 0.5);
            vec3 baseColor = mix(uColorBottom, uColorTop, smoothstep(-1.2, 0.0, vHeight));
            vec3 finalColor = mix(baseColor, crestColor, crest * 0.82);

            gl_FragColor = vec4(finalColor, uOpacity);
          }
        `,
      });
      waveMesh1 = new THREE.Mesh(waveGeo1, waveMat1);
      scene.add(waveMesh1);

      // 2. 落樱背景次级流体 (Back Sakura Wave)
      const waveGeo2 = new THREE.PlaneGeometry(2.4, 2.4, 36, 36);
      const waveMat2 = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
          uTime: { value: 0 },
          uWaterLevel: { value: 0.0 },
          uColorTop: { value: currentColorTop },
          uColorBottom: { value: currentColorBottom },
          uOpacity: { value: 0.46 },
        },
        vertexShader: `
          varying vec2 vUv;
          varying float vHeight;
          uniform float uTime;
          uniform float uWaterLevel;

          void main() {
            vUv = uv;
            vec3 pos = position;
            float wave = sin(pos.x * 3.0 - uTime * 1.8 + 0.8) * 0.032
                       + cos(pos.x * 1.6 + uTime * 1.2) * 0.018;
            vHeight = pos.y - (uWaterLevel + wave - 0.032);
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

            vec3 baseColor = mix(uColorBottom, uColorTop, 0.35);
            gl_FragColor = vec4(baseColor, uOpacity);
          }
        `,
      });
      waveMesh2 = new THREE.Mesh(waveGeo2, waveMat2);
      waveMesh2.position.z = -0.05;
      scene.add(waveMesh2);

      // 3. 落樱花瓣光粒 (Sakura Petal Particles)
      const petalGeo = new THREE.BufferGeometry();
      petalPositions = new Float32Array(PETAL_COUNT * 3);
      petalSpeeds = new Float32Array(PETAL_COUNT);

      for (let i = 0; i < PETAL_COUNT; i++) {
        petalPositions[i * 3] = (Math.random() - 0.5) * 1.4;
        petalPositions[i * 3 + 1] = -0.9 + Math.random() * 1.4;
        petalPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
        petalSpeeds[i] = 0.12 + Math.random() * 0.2;
      }
      petalGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(petalPositions, 3),
      );

      const petalMat = new THREE.PointsMaterial({
        color: new THREE.Color("#fbcfe8"),
        size: 0.046,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });
      petalParticles = new THREE.Points(petalGeo, petalMat);
      scene.add(petalParticles);
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

      if (petalParticles && petalPositions) {
        for (let i = 0; i < PETAL_COUNT; i++) {
          petalPositions[i * 3 + 1] += petalSpeeds[i] * delta;
          petalPositions[i * 3] += Math.sin(timeSec * 2.0 + i) * 0.003;

          if (
            petalPositions[i * 3 + 1] > waterLevelY ||
            petalPositions[i * 3 + 1] > 0.85
          ) {
            petalPositions[i * 3 + 1] = -0.95 + Math.random() * 0.15;
            petalPositions[i * 3] = (Math.random() - 0.5) * 1.3;
          }
        }
        petalParticles.geometry.attributes.position.needsUpdate = true;
        petalParticles.material.color.copy(currentColorTop);
      }
    },
  });
}
