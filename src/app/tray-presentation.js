import { IPC_EVENTS } from "./constants.js";
import { selectedMeterWindow } from "./formatters.js";
import { normalizeTheme, resolveActiveSourceName } from "./settings-model.js";

const CANVAS_SIZE = 64;

const TRAY_PALETTES = {
  default: {
    normal: {
      primaryColor: "#38bdf8",
      ringColor: "rgba(56, 189, 248, 1)",
      bgGradientStart: "#0284c7",
      bgGradientEnd: "#0369a1",
    },
    warning: {
      primaryColor: "#ffd60a",
      ringColor: "rgba(255, 214, 10, 1)",
      bgGradientStart: "#ea580c",
      bgGradientEnd: "#7c2d12",
    },
    danger: {
      primaryColor: "#ff453a",
      ringColor: "rgba(255, 69, 58, 1)",
      bgGradientStart: "#dc2626",
      bgGradientEnd: "#7f1d1d",
    },
  },
  pyro: {
    normal: {
      primaryColor: "#ff7a00",
      ringColor: "rgba(255, 122, 0, 1)",
      bgGradientStart: "#d97706",
      bgGradientEnd: "#991b1b",
    },
    warning: {
      primaryColor: "#ff9500",
      ringColor: "rgba(255, 149, 0, 1)",
      bgGradientStart: "#ea580c",
      bgGradientEnd: "#7c2d12",
    },
    danger: {
      primaryColor: "#ff3b30",
      ringColor: "rgba(255, 59, 48, 1)",
      bgGradientStart: "#dc2626",
      bgGradientEnd: "#7f1d1d",
    },
  },
  emerald: {
    normal: {
      primaryColor: "#10b981",
      ringColor: "rgba(16, 185, 129, 1)",
      bgGradientStart: "#059669",
      bgGradientEnd: "#047857",
    },
    warning: {
      primaryColor: "#f97316",
      ringColor: "rgba(249, 115, 22, 1)",
      bgGradientStart: "#ea580c",
      bgGradientEnd: "#7c2d12",
    },
    danger: {
      primaryColor: "#ef4444",
      ringColor: "rgba(239, 68, 68, 1)",
      bgGradientStart: "#dc2626",
      bgGradientEnd: "#7f1d1d",
    },
  },
  cyber: {
    normal: {
      primaryColor: "#a855f7",
      ringColor: "rgba(168, 85, 247, 1)",
      bgGradientStart: "#9333ea",
      bgGradientEnd: "#581c87",
    },
    warning: {
      primaryColor: "#f43f5e",
      ringColor: "rgba(244, 63, 94, 1)",
      bgGradientStart: "#e11d48",
      bgGradientEnd: "#881337",
    },
    danger: {
      primaryColor: "#ef4444",
      ringColor: "rgba(239, 68, 68, 1)",
      bgGradientStart: "#dc2626",
      bgGradientEnd: "#7f1d1d",
    },
  },
  obsidian: {
    normal: {
      primaryColor: "#eab308",
      ringColor: "rgba(234, 179, 8, 1)",
      bgGradientStart: "#ca8a04",
      bgGradientEnd: "#713f12",
    },
    warning: {
      primaryColor: "#f87171",
      ringColor: "rgba(248, 113, 113, 1)",
      bgGradientStart: "#e11d48",
      bgGradientEnd: "#7f1d1d",
    },
    danger: {
      primaryColor: "#ef4444",
      ringColor: "rgba(239, 68, 68, 1)",
      bgGradientStart: "#dc2626",
      bgGradientEnd: "#7f1d1d",
    },
  },
  crimson: {
    normal: {
      primaryColor: "#f43f5e",
      ringColor: "rgba(244, 63, 94, 1)",
      bgGradientStart: "#e11d48",
      bgGradientEnd: "#881337",
    },
    warning: {
      primaryColor: "#fb923c",
      ringColor: "rgba(251, 146, 60, 1)",
      bgGradientStart: "#ea580c",
      bgGradientEnd: "#7c2d12",
    },
    danger: {
      primaryColor: "#ef4444",
      ringColor: "rgba(239, 68, 68, 1)",
      bgGradientStart: "#dc2626",
      bgGradientEnd: "#7f1d1d",
    },
  },
  sakura: {
    normal: {
      primaryColor: "#ec4899",
      ringColor: "rgba(236, 72, 153, 1)",
      bgGradientStart: "#db2777",
      bgGradientEnd: "#831843",
    },
    warning: {
      primaryColor: "#fb923c",
      ringColor: "rgba(251, 146, 60, 1)",
      bgGradientStart: "#ea580c",
      bgGradientEnd: "#7c2d12",
    },
    danger: {
      primaryColor: "#ef4444",
      ringColor: "rgba(239, 68, 68, 1)",
      bgGradientStart: "#dc2626",
      bgGradientEnd: "#7f1d1d",
    },
  },
};
TRAY_PALETTES.holo = TRAY_PALETTES.default;

export function renderTrayBallRgba({
  percent,
  displayText: customText,
  visualState = "normal",
  theme = "default",
}) {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const cx = CANVAS_SIZE / 2;
  const cy = CANVAS_SIZE / 2;
  // 满格球体：半径设为 32.0，直径 64px
  const radius = 32.0;

  // 1. 根据主题和额度状态决定配色（水体渐变色与外环颜色跟随当前主题）
  const normalizedTheme = normalizeTheme(theme);
  const themePalette = TRAY_PALETTES[normalizedTheme] || TRAY_PALETTES.default;
  const palette =
    visualState === "danger"
      ? themePalette.danger
      : visualState === "warning"
        ? themePalette.warning
        : themePalette.normal;

  const { primaryColor, ringColor, bgGradientStart, bgGradientEnd } = palette;

  // 2. 绘制球体背景水体渐变（深浅通透基底）
  const ballGrad = ctx.createLinearGradient(0, cy - radius, 0, cy + radius);
  ballGrad.addColorStop(0, bgGradientStart);
  ballGrad.addColorStop(1, bgGradientEnd);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = ballGrad;
  ctx.fill();

  // 3. 绘制 3D 底部内壁折射反光（Bottom Ambient Rim Light）
  const bottomGlow = ctx.createRadialGradient(
    cx,
    cy + radius * 0.82,
    1,
    cx,
    cy + radius * 0.82,
    radius * 0.65,
  );
  bottomGlow.addColorStop(0, "rgba(255, 255, 255, 0.28)");
  bottomGlow.addColorStop(0.6, "rgba(255, 255, 255, 0.08)");
  bottomGlow.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.restore();

  // 4. 绘制 3D 顶部玻璃弧面月牙高光（Top Specular Glass Highlight）
  const glassGrad = ctx.createLinearGradient(
    cx,
    cy - radius * 0.85,
    cx,
    cy - radius * 0.1,
  );
  glassGrad.addColorStop(0, "rgba(255, 255, 255, 0.45)");
  glassGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.16)");
  glassGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(
    cx,
    cy - radius * 0.45,
    radius * 0.62,
    radius * 0.32,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = glassGrad;
  ctx.fill();
  ctx.restore();

  // 5. 绘制精致外环（3.5px 适中粗细，带主题色外发光）
  const ringLineWidth = 3.5;
  const ringRadius = radius - ringLineWidth / 2; // 30.25px
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = ringLineWidth;
  ctx.shadowColor = primaryColor;
  ctx.shadowBlur = 4;
  ctx.stroke();
  ctx.restore();

  // 6. 计算显示的整数文本（不显示 %，不显示“剩余”）
  let displayText = customText;
  if (!displayText) {
    if (typeof percent === "number" && !Number.isNaN(percent)) {
      displayText = String(Math.max(0, Math.min(100, Math.round(percent))));
    } else {
      displayText = "--";
    }
  }

  // 7. 最大化字号并居中绘制
  let fontSize = 38;
  if (displayText === "--") {
    fontSize = 32;
  } else if (displayText.length >= 3) {
    fontSize = 26;
  } else if (displayText.length === 2) {
    fontSize = 34;
  } else {
    fontSize = 42;
  }

  ctx.save();
  ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 8. 暗色外轮廓描边：物理隔离亮色水体与白色数字，100% 杜绝融色看不清
  ctx.lineWidth = 2.8;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
  ctx.strokeText(displayText, cx, cy + 0.5);

  // 9. 纯白文字与微投影叠加填充
  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;

  ctx.fillStyle = "#ffffff";
  ctx.fillText(displayText, cx, cy + 0.5);
  ctx.restore();

  const imgData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  return imgData.data;
}

export function createTrayPresentationManager({ service, state, logger }) {
  let lastDisplayText = null;
  let lastVisualState = null;
  let lastTheme = null;
  let isUpdating = false;

  // 监听来自预览窗口的 ready 信号与托盘触发事件，窗口一就绪或弹出立即补发最新数据
  if (service.isAvailable() && service.events?.listen) {
    service.events
      .listen("tray-preview:ready", () => {
        void syncTrayPreviewData();
      })
      .catch(() => {});
    service.events
      .listen("tray:preview-shown", () => {
        void syncTrayPreviewData();
      })
      .catch(() => {});
  }

  function resolveTrayDisplayInfo() {
    const quota = state.quota;
    if (!quota) {
      return {
        percent: null,
        displayText: "--",
        visualState: "unknown",
        statusText: "暂无数据",
        isUnrestricted: false,
      };
    }

    const cred = quota.credits;
    const isUnrestricted =
      cred?.type === "sub2api" &&
      (cred?.isUnrestricted ||
        cred?.subType === "unrestricted" ||
        cred?.limit === null ||
        cred?.limit === undefined);

    if (isUnrestricted) {
      const balance =
        typeof cred?.balance === "number"
          ? cred.balance
          : typeof cred?.remaining === "number"
            ? cred.remaining
            : null;

      let visualState = "normal";
      if (cred?.isValid === false || balance === null || balance <= 0) {
        visualState = "danger";
      } else if (balance <= 1) {
        visualState = "danger";
      } else if (balance <= 5) {
        visualState = "warning";
      }

      let displayText = "--";
      if (typeof balance === "number" && !Number.isNaN(balance)) {
        if (balance <= 0) {
          displayText = "0";
        } else if (balance >= 1000) {
          displayText = "999+";
        } else if (balance >= 100) {
          displayText = String(Math.round(balance));
        } else {
          displayText = String(Math.floor(balance)); // 显示整数金额，如 9.17 显示 "9"
        }
      }

      const statusText = state.loading
        ? "读取中"
        : state.errors?.quota
          ? "读取异常"
          : visualState === "danger"
            ? "余额告急"
            : visualState === "warning"
              ? "余额偏低"
              : "状态正常";

      return {
        percent: 100,
        displayText,
        visualState,
        statusText,
        isUnrestricted: true,
      };
    }

    const activeSettings = state.settings || {};
    const meterWindowData = selectedMeterWindow(
      quota,
      activeSettings.meterWindow,
    );
    const percent =
      typeof meterWindowData?.remainingPercent === "number"
        ? meterWindowData.remainingPercent
        : typeof quota.remainingPercent === "number"
          ? quota.remainingPercent
          : null;

    let visualState = "normal";
    if (percent === null) {
      visualState = "unknown";
    } else if (percent <= (activeSettings.dangerThreshold ?? 10)) {
      visualState = "danger";
    } else if (percent <= (activeSettings.warningThreshold ?? 25)) {
      visualState = "warning";
    }

    let displayText = "--";
    if (typeof percent === "number" && !Number.isNaN(percent)) {
      displayText = String(Math.max(0, Math.min(100, Math.round(percent))));
    }

    const statusText = state.loading
      ? "读取中"
      : state.errors?.quota
        ? "读取异常"
        : visualState === "danger"
          ? "额度告急"
          : visualState === "warning"
            ? "额度较低"
            : "状态正常";

    return {
      percent,
      displayText,
      visualState,
      statusText,
      isUnrestricted: false,
    };
  }

  async function updateTrayIcon() {
    if (!service.isAvailable() || isUpdating) return;

    const { percent, displayText, visualState } = resolveTrayDisplayInfo();
    const activeSettings = state.settings || {};
    const theme = normalizeTheme(activeSettings.theme);

    if (
      displayText === lastDisplayText &&
      visualState === lastVisualState &&
      theme === lastTheme
    ) {
      return;
    }

    lastDisplayText = displayText;
    lastVisualState = visualState;
    lastTheme = theme;

    try {
      isUpdating = true;
      const rgbaData = renderTrayBallRgba({
        percent,
        displayText,
        visualState,
        theme,
      });
      if (rgbaData && service.commands?.updateTrayIcon) {
        await service.commands.updateTrayIcon(
          Array.from(rgbaData),
          CANVAS_SIZE,
          CANVAS_SIZE,
        );
      }
    } catch (error) {
      logger?.error("更新托盘动态图标失败", error, "frontend.tray");
    } finally {
      isUpdating = false;
    }
  }

  async function syncTrayPreviewData() {
    if (!service.isAvailable() || !service.events?.emit) return;

    try {
      const quota = state.quota;
      const activeSettings = state.settings || {};
      const sourceName = resolveActiveSourceName(activeSettings, {
        format: "full",
      });

      const { percent, visualState, statusText } = resolveTrayDisplayInfo();

      // 直接从主界面已渲染的 .quota-panel 抓取 1:1 完整的卡片 DOM
      const quotaPanel = document.querySelector(".quota-panel");
      const cardsHtml = quotaPanel ? quotaPanel.innerHTML : "";

      const previewData = {
        sourceName,
        statusText,
        remainingPercent: percent,
        visualState,
        theme: normalizeTheme(activeSettings.theme),
        planType: quota?.planType || "Free",
        resetCredits: quota?.resetCredits?.availableCount ?? null,
        cardsHtml,
        updatedAt: quota?.fetchedAt
          ? new Date(quota.fetchedAt).toLocaleTimeString()
          : new Date().toLocaleTimeString(),
      };

      await service.events.emit(IPC_EVENTS.TRAY_PREVIEW_UPDATE, previewData);
    } catch (error) {
      logger?.error("分发托盘预览数据失败", error, "frontend.tray");
    }
  }

  function update() {
    void updateTrayIcon();
    void syncTrayPreviewData();
  }

  return {
    update,
    updateTrayIcon,
    syncTrayPreviewData,
  };
}
