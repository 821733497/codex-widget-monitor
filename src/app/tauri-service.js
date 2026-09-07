import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import {
  availableMonitors,
  currentMonitor,
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
} from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { check } from "@tauri-apps/plugin-updater";

export function createTauriService() {
  return {
    isAvailable,
    commands: {
      closeApp: () => invoke("close_app"),
      getAlwaysOnTop: () => invoke("get_always_on_top"),
      getQuota: () => invoke("get_quota"),
      getResetCreditExpiries: () => invoke("get_reset_credit_expiries"),
      getSettings: () => invoke("get_settings"),
      hideQuickMenu: () => invoke("hide_quick_menu"),
      hideWindow: () => invoke("hide_window"),
      setSkipTaskbar: (skip) => invoke("set_skip_taskbar", { skip }),
      saveSettings: (settings) => invoke("save_settings", { settings }),
      setAlwaysOnTop: (value) => invoke("set_always_on_top", { value }),
      showQuickMenu: (x, y) => invoke("show_quick_menu", { x, y }),
      switchActiveTarget: (target) =>
        invoke("switch_active_target", { target }),
      testSub2apiConnection: (baseUrl, apiKey) =>
        invoke("test_sub2api_connection", { baseUrl, apiKey }),
      toggleTrayPreview: () => invoke("toggle_tray_preview"),
      updateTrayIcon: (rgba, width, height) =>
        invoke("update_tray_icon", { rgba, width, height }),
      writeFrontendLog: (level, message, context) =>
        invoke("write_frontend_log", { level, message, context }),
    },
    dialog: {
      chooseCodexPath: () =>
        openDialog({
          multiple: false,
          directory: false,
        }),
    },
    updater: {
      check: (options) => check(options),
    },
    events: {
      emit,
      listen,
    },
    window: {
      availableMonitors,
      currentMonitor,
      onMoved: (handler) => getCurrentWindow().onMoved(handler),
      outerPosition: () => getCurrentWindow().outerPosition(),
      outerSize: () => getCurrentWindow().outerSize(),
      scaleFactor: () => getCurrentWindow().scaleFactor(),
      setPosition: (position) =>
        getCurrentWindow().setPosition(
          new PhysicalPosition(position.x, position.y),
        ),
      setSize: (size) =>
        getCurrentWindow().setSize(new LogicalSize(size.width, size.height)),
      startDragging: () => getCurrentWindow().startDragging(),
    },
  };
}

function isAvailable() {
  return Boolean(window.__TAURI_INTERNALS__);
}
