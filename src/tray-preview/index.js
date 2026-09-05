import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { IPC_EVENTS } from "../app/constants.js";

const elements = {
  container: document.getElementById("trayPreviewApp"),
  statusDot: document.getElementById("previewStatusDot"),
  sourceName: document.getElementById("previewSourceName"),
  resetCredits: document.getElementById("previewResetCredits"),
  planBadge: document.getElementById("previewPlanBadge"),
  cardsHost: document.getElementById("previewCardsHost"),
  updatedAt: document.getElementById("previewUpdatedAt"),
};

function updatePreview(data) {
  if (!data) return;

  const {
    sourceName = "官方",
    visualState = "normal",
    theme = "default",
    planType = "PLUS",
    resetCredits = null,
    cardsHtml = "",
    updatedAt = "--",
  } = data;

  document.body.dataset.theme = theme;
  document.body.dataset.state = visualState;

  if (elements.statusDot) {
    elements.statusDot.className = `status-dot ${visualState}`;
  }

  if (elements.sourceName) {
    elements.sourceName.textContent = sourceName;
  }

  if (elements.planBadge) {
    elements.planBadge.textContent = planType
      ? String(planType).toUpperCase()
      : "PLUS";
  }

  if (elements.resetCredits) {
    if (typeof resetCredits === "number" && resetCredits > 0) {
      elements.resetCredits.hidden = false;
      elements.resetCredits.textContent = `↺ ${resetCredits}`;
    } else {
      elements.resetCredits.hidden = true;
    }
  }

  if (elements.cardsHost && cardsHtml) {
    elements.cardsHost.innerHTML = cardsHtml;
  }

  if (elements.updatedAt) {
    elements.updatedAt.textContent = `更新于 ${updatedAt}`;
  }
}

let isPinned = false;

function init() {
  listen(IPC_EVENTS.TRAY_PREVIEW_UPDATE, (event) => {
    updatePreview(event.payload);
  });

  listen(IPC_EVENTS.TRAY_PREVIEW_MODE_CHANGED, (event) => {
    isPinned = Boolean(event.payload);
  });

  // 主动通知主窗口补发当前最新数据
  emit(IPC_EVENTS.TRAY_PREVIEW_READY).catch(() => {});

  // 窗口可见或获得焦点时再次请求数据
  window.addEventListener("focus", () => {
    emit(IPC_EVENTS.TRAY_PREVIEW_READY).catch(() => {});
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      emit(IPC_EVENTS.TRAY_PREVIEW_READY).catch(() => {});
    }
  });

  // 鼠标移入概览窗口：避免从托盘移动到卡片间隙触发误关闭
  window.addEventListener("mouseenter", () => {
    emit(IPC_EVENTS.TRAY_PREVIEW_KEEP_OPEN).catch(() => {});
  });

  // 鼠标移出：只有在非固定（Hover Peek）状态下才自动收起
  window.addEventListener("mouseleave", () => {
    if (!isPinned) {
      invoke("hide_tray_preview").catch(() => {});
    }
  });

  // 失焦（用户点击了桌面任意其他应用或屏幕空白处）：自动收起（Light Dismiss）
  window.addEventListener("blur", () => {
    isPinned = false;
    invoke("hide_tray_preview").catch(() => {});
  });
}

init();
