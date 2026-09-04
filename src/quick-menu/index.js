import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { IPC_EVENTS } from "../app/constants.js";

const elements = {
  btnRefreshQuota: document.getElementById("btnRefreshQuota"),
  btnSwitchSource: document.getElementById("btnSwitchSource"),
  btnToggleTheme: document.getElementById("btnToggleTheme"),
  btnSettings: document.getElementById("btnSettings"),
  btnQuit: document.getElementById("btnQuit"),
  btnMinimizeToTray: document.getElementById("btnMinimizeToTray"),
  refreshIconSvg: document.getElementById("refreshIconSvg"),
  currentSourceBadge: document.getElementById("currentSourceBadge"),
};

async function hideMenu() {
  try {
    await invoke("hide_quick_menu");
  } catch {
    // 忽略未就绪调用
  }
}

async function sendAction(action, payload = null) {
  try {
    await emit(IPC_EVENTS.QUICK_MENU_ACTION, { action, payload });
  } catch (err) {
    console.error("发送快捷操作失败", err);
  } finally {
    void hideMenu();
  }
}

function init() {
  // 点击刷新数据（带动画）
  elements.btnRefreshQuota?.addEventListener("click", () => {
    elements.refreshIconSvg?.classList.add("spinning");
    void sendAction("refresh-quota");
  });

  // 点击直接切换下一个数据源（与主页效果一致）
  elements.btnSwitchSource?.addEventListener("click", () => {
    void sendAction("switch-source");
  });

  // 点击直接切换主题
  elements.btnToggleTheme?.addEventListener("click", () => {
    void sendAction("toggle-theme");
  });

  // 设置
  elements.btnSettings?.addEventListener("click", () => {
    void sendAction("open-settings");
  });

  // 退出
  elements.btnQuit?.addEventListener("click", () => {
    void sendAction("quit");
  });

  // 最底下一排：放至托盘（若恢复解开注释）
  elements.btnMinimizeToTray?.addEventListener("click", () => {
    void sendAction("minimize-to-tray");
  });

  // 接收外部同步的主题与数据源信息
  listen(IPC_EVENTS.QUICK_MENU_SYNC, (event) => {
    const { theme, sourceName } = event.payload || {};
    if (theme) {
      document.documentElement.setAttribute("data-theme", theme);
    }
    if (sourceName && elements.currentSourceBadge) {
      elements.currentSourceBadge.textContent = sourceName;
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      void hideMenu();
    }
  });

  let blurTimer = null;
  window.addEventListener("blur", () => {
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      void hideMenu();
    }, 400);
  });

  window.addEventListener("focus", () => {
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }
  });
}

init();
