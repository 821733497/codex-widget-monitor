import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const iconDir = join("src-tauri", "icons");
mkdirSync(iconDir, { recursive: true });

// 精心设计的 1024x1024 矢量 SVG：
// 结合 Codex CLI（极客终端 >_ 符号）与 Quota Widget（悬浮能量球、流体水波液位与环形额度刻度仪表）。
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <!-- 背景渐变：深邃极客哑光黑 -->
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="55%" stop-color="#090f1d" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>

    <!-- 边框流光微渐变 -->
    <linearGradient id="borderGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#34d399" stop-opacity="0.45" />
      <stop offset="50%" stop-color="#10b981" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#064e3b" stop-opacity="0.6" />
    </linearGradient>

    <!-- 环形仪表充能渐变 -->
    <linearGradient id="ringGrad" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="35%" stop-color="#10b981" />
      <stop offset="70%" stop-color="#34d399" />
      <stop offset="100%" stop-color="#6ee7b7" />
    </linearGradient>

    <!-- 能量球玻璃腔体渐变 -->
    <radialGradient id="sphereBg" cx="38%" cy="32%" r="65%">
      <stop offset="0%" stop-color="#1e293b" />
      <stop offset="55%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#020617" />
    </radialGradient>

    <!-- 后波浪渐变 -->
    <linearGradient id="backWaveGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#059669" stop-opacity="0.75" />
      <stop offset="100%" stop-color="#022c22" stop-opacity="0.95" />
    </linearGradient>

    <!-- 前波浪翡翠渐变（呼应小组件 Liquid Meter） -->
    <linearGradient id="frontWaveGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="25%" stop-color="#10b981" />
      <stop offset="65%" stop-color="#059669" />
      <stop offset="100%" stop-color="#022c22" />
    </linearGradient>

    <!-- 核心命令行提示符渐变 -->
    <linearGradient id="codeGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#e0e7ff" />
    </linearGradient>

    <!-- 发光滤镜 -->
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="16" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>

    <filter id="subtleGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>

    <!-- 球体剪裁遮罩 -->
    <clipPath id="sphereClip">
      <circle cx="512" cy="512" r="310" />
    </clipPath>
  </defs>

  <!-- 1. 外层 Squircle 矩形底座（保障 Windows 深浅色任务栏与托盘高对比度） -->
  <rect x="36" y="36" width="952" height="952" rx="228" fill="url(#bgGrad)" stroke="url(#borderGrad)" stroke-width="4" />

  <!-- 2. 环境微光 -->
  <circle cx="512" cy="512" r="360" fill="#10b981" opacity="0.09" filter="url(#glow)" />

  <!-- 3. 外围 Quota 额度环形刻度圈 -->
  <circle cx="512" cy="512" r="396" fill="none" stroke="#162e2a" stroke-width="26" stroke-dasharray="1950" stroke-dashoffset="440" stroke-linecap="round" transform="rotate(135 512 512)" />
  <circle cx="512" cy="512" r="396" fill="none" stroke="url(#ringGrad)" stroke-width="26" stroke-dasharray="1950" stroke-dashoffset="920" stroke-linecap="round" filter="url(#subtleGlow)" transform="rotate(135 512 512)" />
  <circle cx="230" cy="780" r="16" fill="#6ee7b7" filter="url(#glow)" />

  <!-- 4. 核心悬浮能量球体 (Liquid Ball) -->
  <g id="liquidSphere">
    <!-- 球体深色底仓 -->
    <circle cx="512" cy="512" r="310" fill="url(#sphereBg)" stroke="#10b981" stroke-opacity="0.35" stroke-width="6" />

    <!-- 液体波浪层 -->
    <g clip-path="url(#sphereClip)">
      <!-- 后浪 -->
      <path d="M 120 570 Q 280 525 470 570 T 900 550 L 900 860 L 120 860 Z" fill="url(#backWaveGrad)" />
      <!-- 前浪波涛 -->
      <path d="M 120 595 Q 300 645 500 595 T 900 610 L 900 860 L 120 860 Z" fill="url(#frontWaveGrad)" />
      <!-- 水面泛光微高光弧 -->
      <path d="M 150 597 Q 300 647 500 597 T 870 612" fill="none" stroke="#a7f3d0" stroke-width="6" opacity="0.75" />
      <!-- 微气泡粒子 -->
      <circle cx="410" cy="670" r="14" fill="#a7f3d0" opacity="0.35" />
      <circle cx="590" cy="710" r="18" fill="#a7f3d0" opacity="0.3" />
      <circle cx="485" cy="765" r="11" fill="#a7f3d0" opacity="0.35" />
    </g>

    <!-- 顶部高光弧线（3D 玻璃球质感） -->
    <ellipse cx="430" cy="285" rx="150" ry="50" fill="#ffffff" opacity="0.16" transform="rotate(-22 430 285)" />
    <!-- 球体内沿发光环 -->
    <circle cx="512" cy="512" r="310" fill="none" stroke="#34d399" stroke-width="4" opacity="0.45" />
  </g>

  <!-- 5. 极客核心图腾：Codex CLI 命令提示符 >_ （悬浮居中，高反差高对比） -->
  <g id="cliSymbol" filter="url(#subtleGlow)">
    <!-- 尖括号 > -->
    <path d="M 370 380 L 485 470 L 370 560" fill="none" stroke="url(#codeGrad)" stroke-width="52" stroke-linecap="round" stroke-linejoin="round" />
    <!-- 终端光标下划线 _ -->
    <line x1="530" y1="560" x2="650" y2="560" stroke="#34d399" stroke-width="52" stroke-linecap="round" />
  </g>
</svg>`;

const svgPath = join(iconDir, "icon.svg");
writeFileSync(svgPath, svgContent, "utf8");
console.log(`[1/2] 矢量图标已生成：${svgPath}`);

console.log("[2/2] 正在调用 @tauri-apps/cli 生成全平台图标...");
execSync(`npx tauri icon "${svgPath}" -o "${iconDir}"`, {
  stdio: "inherit",
});

console.log("全套应用与托盘图标生成完毕！");

