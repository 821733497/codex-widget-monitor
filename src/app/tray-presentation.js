import { IPC_EVENTS } from "./constants.js";
import { selectedMeterWindow } from "./formatters.js";
import { normalizeTheme, resolveActiveSourceName } from "./settings-model.js";

const CANVAS_SIZE = 64;

const TRAY_PALETTES = {
  default: {
    normal: {
      primaryColor: "#38bdf8",
      ringColor: "rgba(56, 189, 248, 0.95)",
      bgGradientStart: "#0f2b38",
      bgGradientEnd: "#05131b",
    },
    warning: {
      primaryColor: "#ffd60a",
      ringColor: "rgba(255, 214, 10, 0.95)",
      bgGradientStart: "#3e320c",
      bgGradientEnd: "#1a1403",
    },
    danger: {
      primaryColor: "#ff453a",
      ringColor: "rgba(255, 69, 58, 0.95)",
      bgGradientStart: "#421010",
      bgGradientEnd: "#1a0505",
    },
  },
  pyro: {
    normal: {
      primaryColor: "#ff7a00",
      ringColor: "rgba(255, 122, 0, 0.95)",
      bgGradientStart: "#401900",
      bgGradientEnd: "#1a0800",
    },
    warning: {
      primaryColor: "#ff9500",
      ringColor: "rgba(255, 149, 0, 0.95)",
      bgGradientStart: "#3e2409",
      bgGradientEnd: "#1a0d03",
    },
    danger: {
      primaryColor: "#ff3b30",
      ringColor: "rgba(255, 59, 48, 0.95)",
      bgGradientStart: "#420e0e",
      bgGradientEnd: "#1c0505",
    },
  },
  emerald: {
    normal: {
      primaryColor: "#10b981",
      ringColor: "rgba(16, 185, 129, 0.95)",
      bgGradientStart: "#062b1b",
      bgGradientEnd: "#02120b",
    },
    warning: {
      primaryColor: "#f97316",
      ringColor: "rgba(249, 115, 22, 0.95)",
      bgGradientStart: "#3d1f08",
      bgGradientEnd: "#170a02",
    },
    danger: {
      primaryColor: "#ef4444",
      ringColor: "rgba(239, 68, 68, 0.95)",
      bgGradientStart: "#421010",
      bgGradientEnd: "#1a0505",
    },
  },
  cyber: {
    normal: {
      primaryColor: "#a855f7",
      ringColor: "rgba(168, 85, 247, 0.95)",
      bgGradientStart: "#280f3d",
      bgGradientEnd: "#0f0517",
    },
    warning: {
      primaryColor: "#f43f5e",
      ringColor: "rgba(244, 63, 94, 0.95)",
      bgGradientStart: "#3b0d1e",
      bgGradientEnd: "#17030a",
    },
    danger: {
      primaryColor: "#ef4444",
      ringColor: "rgba(239, 68, 68, 0.95)",
      bgGradientStart: "#421010",
      bgGradientEnd: "#1a0505",
    },
  },
  obsidian: {
    normal: {
      primaryColor: "#eab308",
      ringColor: "rgba(234, 179, 8, 0.95)",
      bgGradientStart: "#332704",
      bgGradientEnd: "#140e01",
    },
    warning: {
      primaryColor: "#f87171",
      ringColor: "rgba(248, 113, 113, 0.95)",
      bgGradientStart: "#3d1313",
      bgGradientEnd: "#170505",
    },
    danger: {
      primaryColor: "#ef4444",
      ringColor: "rgba(239, 68, 68, 0.95)",
      bgGradientStart: "#421010",
      bgGradientEnd: "#1a0505",
    },
  },
  crimson: {
    normal: {
      primaryColor: "#f43f5e",
      ringColor: "rgba(244, 63, 94, 0.95)",
      bgGradientStart: "#3d0d1e",
      bgGradientEnd: "#17030a",
    },
    warning: {
      primaryColor: "#fb923c",
      ringColor: "rgba(251, 146, 60, 0.95)",
      bgGradientStart: "#3d1c0b",
      bgGradientEnd: "#170a03",
    },
    danger: {
      primaryColor: "#ef4444",
      ringColor: "rgba(239, 68, 68, 0.95)",
      bgGradientStart: "#421010",
      bgGradientEnd: "#1a0505",
    },
  },
  sakura: {
    normal: {
      primaryColor: "#ec4899",
      ringColor: "rgba(236, 72, 153, 0.95)",
      bgGradientStart: "#3b0e24",
      bgGradientEnd: "#17040d",
    },
    warning: {
      primaryColor: "#fb923c",
      ringColor: "rgba(251, 146, 60, 0.95)",
      bgGradientStart: "#3d1c0b",
      bgGradientEnd: "#170a03",
    },
    danger: {
      primaryColor: "#ef4444",
      ringColor: "rgba(239, 68, 68, 0.95)",
      bgGradientStart: "#421010",
      bgGradientEnd: "#1a0505",
    },
  },
};

export function renderTrayBallRgba({
  percent,
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
  // 最大化球体：半径由原先过小的 27 调整为 31.2，直径 62.4px，几乎 100% 填满 64px 空间
  const radius = 31.2;

  // 1. 根据主题和额度状态决定配色
  const normalizedTheme = normalizeTheme(theme);
  const themePalette = TRAY_PALETTES[normalizedTheme] || TRAY_PALETTES.default;
  const palette =
    visualState === "danger"
      ? themePalette.danger
      : visualState === "warning"
        ? themePalette.warning
        : themePalette.normal;

  const { primaryColor, ringColor, bgGradientStart, bgGradientEnd } = palette;

  // 2. 绘制球体背景渐变
  const ballGrad = ctx.createRadialGradient(
    cx - radius * 0.35,
    cy - radius * 0.35,
    radius * 0.1,
    cx,
    cy,
    radius,
  );
  ballGrad.addColorStop(0, bgGradientStart);
  ballGrad.addColorStop(1, bgGradientEnd);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = ballGrad;
  ctx.fill();

  // 3. 绘制球体外环发光
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 1.25, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = primaryColor;
  ctx.shadowBlur = 4;
  ctx.stroke();
  ctx.restore();

  // 4. 计算显示的整数文本（不显示 %，不显示“剩余”）
  let displayText = "--";
  if (typeof percent === "number" && !Number.isNaN(percent)) {
    displayText = String(Math.max(0, Math.min(100, Math.round(percent))));
  }

  // 5. 最大化字号并居中绘制
  let fontSize = 36;
  if (displayText === "--") {
    fontSize = 30;
  } else if (displayText.length >= 3) {
    fontSize = 26;
  } else if (displayText.length === 2) {
    fontSize = 36;
  } else {
    fontSize = 44;
  }

  ctx.save();
  ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 文字深色阴影增强在各种任务栏下的对比度
  ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
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
  let lastPercent = null;
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

  function resolveCurrentQuotaPercent() {
    const quota = state.quota;
    if (!quota) return null;
    const activeSettings = state.settings || {};
    const meterWindowData = selectedMeterWindow(
      quota,
      activeSettings.meterWindow,
    );
    if (typeof meterWindowData?.remainingPercent === "number") {
      return meterWindowData.remainingPercent;
    }
    if (typeof quota.remainingPercent === "number") {
      return quota.remainingPercent;
    }
    return null;
  }

  async function updateTrayIcon() {
    if (!service.isAvailable() || isUpdating) return;

    const percent = resolveCurrentQuotaPercent();
    const activeSettings = state.settings || {};

    let visualState = "normal";
    if (percent === null) {
      visualState = "unknown";
    } else if (percent <= (activeSettings.dangerThreshold ?? 10)) {
      visualState = "danger";
    } else if (percent <= (activeSettings.warningThreshold ?? 25)) {
      visualState = "warning";
    }

    const theme = normalizeTheme(activeSettings.theme);

    if (
      percent === lastPercent &&
      visualState === lastVisualState &&
      theme === lastTheme
    ) {
      return;
    }

    lastPercent = percent;
    lastVisualState = visualState;
    lastTheme = theme;

    try {
      isUpdating = true;
      const rgbaData = renderTrayBallRgba({ percent, visualState, theme });
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

      const percent = resolveCurrentQuotaPercent();

      let visualState = "normal";
      if (percent === null) {
        visualState = "unknown";
      } else if (percent <= (activeSettings.dangerThreshold ?? 10)) {
        visualState = "danger";
      } else if (percent <= (activeSettings.warningThreshold ?? 25)) {
        visualState = "warning";
      }

      // 直接从主界面已渲染的 .quota-panel 抓取 1:1 完整的卡片 DOM
      const quotaPanel = document.querySelector(".quota-panel");
      const cardsHtml = quotaPanel ? quotaPanel.innerHTML : "";

      const previewData = {
        sourceName,
        statusText: state.loading
          ? "读取中"
          : state.errors?.quota
            ? "读取异常"
            : visualState === "danger"
              ? "额度告急"
              : visualState === "warning"
                ? "额度较低"
                : "状态正常",
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
