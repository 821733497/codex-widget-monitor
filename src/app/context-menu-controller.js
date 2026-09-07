import { IPC_EVENTS, WIDGET_MODES } from "./constants.js";
import {
  resolveActiveSourceName,
  resolveActiveThemeName,
} from "./settings-model.js";

export function createContextMenuController({
  state,
  service,
  openSettings,
  sourcePickerController,
  refreshQuota,
  cycleTheme,
  hideWindow,
  logger,
}) {
  let isListening = false;

  function bindEvents() {
    document.addEventListener("contextmenu", handleContextMenu, {
      capture: true,
    });
    window.addEventListener("contextmenu", handleContextMenu, {
      capture: true,
    });

    if (service.isAvailable() && service.events?.listen && !isListening) {
      isListening = true;
      service.events.listen(
        IPC_EVENTS.QUICK_MENU_ACTION,
        handleQuickMenuAction,
      );
    }
  }

  function syncQuickMenuData() {
    if (!service.events?.emit) return;
    const sources = sourcePickerController?.buildSourceItems
      ? sourcePickerController.buildSourceItems()
      : [];
    service.events
      .emit(IPC_EVENTS.QUICK_MENU_SYNC, {
        sources,
        activeTarget: state.settings?.activeTarget,
        theme: state.settings?.theme,
        themeName: resolveActiveThemeName(
          state.settings?.theme,
          state.settings?.locale,
        ),
        sourceName: resolveActiveSourceName(state.settings, {
          format: "short",
          locale: state.settings?.locale,
        }),
      })
      .catch(() => {});
  }

  async function handleContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!service.isAvailable() || !service.commands?.showQuickMenu) {
      return;
    }

    try {
      syncQuickMenuData();

      let targetX = 100;
      let targetY = 100;

      if (service.window?.outerPosition && service.window?.outerSize) {
        try {
          const [winPos, winSize, scaleFactor] = await Promise.all([
            service.window.outerPosition(),
            service.window.outerSize(),
            service.window.scaleFactor ? service.window.scaleFactor() : 1.0,
          ]);

          const factor = scaleFactor || 1.0;
          const menuWidth = Math.round(176 * factor);
          const menuHeight = Math.round(186 * factor);

          const monitor = service.window.currentMonitor
            ? await service.window.currentMonitor()
            : null;
          const screenWidth = monitor?.size?.width || 1920;
          const screenLeft = monitor?.position?.x || 0;
          const screenTop = monitor?.position?.y || 0;
          const screenHeight = monitor?.size?.height || 1080;

          if (state.widgetMode === WIDGET_MODES.BALL) {
            // 悬浮球模式：如果靠右侧弹在左边，靠左侧弹在右边
            if (winPos.x > screenLeft + screenWidth / 2) {
              targetX = winPos.x - menuWidth - 8;
            } else {
              targetX = winPos.x + winSize.width + 8;
            }
            targetY = Math.round(winPos.y + (winSize.height - menuHeight) / 2);
          } else {
            // 面板模式：在鼠标位置附近弹出
            targetX = Math.round((event.screenX || 100) * factor);
            targetY = Math.round((event.screenY || 100) * factor);
            if (targetX + menuWidth > screenLeft + screenWidth - 8) {
              targetX = targetX - menuWidth;
            }
            if (targetY + menuHeight > screenTop + screenHeight - 8) {
              targetY = targetY - menuHeight;
            }
          }

          // 保持在显示器垂直边界内
          targetY = Math.max(
            screenTop + 8,
            Math.min(screenTop + screenHeight - menuHeight - 8, targetY),
          );
        } catch {
          targetX = Math.round(event.screenX || 100);
          targetY = Math.round(event.screenY || 100);
        }
      }

      await service.commands.showQuickMenu(targetX, targetY);
    } catch (error) {
      logger?.error("弹出快捷功能菜单失败", error, "frontend.context-menu");
    }
  }

  async function handleQuickMenuAction(event) {
    const { action, payload } = event.payload || {};

    try {
      switch (action) {
        case "open-settings": {
          if (openSettings) {
            await openSettings("basic");
          }
          break;
        }
        case "switch-source": {
          if (sourcePickerController?.cycleToNextSource) {
            await sourcePickerController.cycleToNextSource();
          } else if (sourcePickerController?.switchSource && payload) {
            await sourcePickerController.switchSource(payload);
          }
          break;
        }
        case "toggle-theme": {
          if (cycleTheme) {
            await cycleTheme();
          }
          break;
        }
        case "refresh-quota": {
          if (refreshQuota) {
            try {
              await refreshQuota();
            } finally {
              syncQuickMenuData();
            }
          }
          break;
        }
        case "minimize-to-tray": {
          if (hideWindow) {
            await hideWindow();
          }
          break;
        }
        case "quit": {
          if (service.commands?.closeApp) {
            await service.commands.closeApp();
          }
          break;
        }
        case "sync-requested": {
          syncQuickMenuData();
          break;
        }
        default:
          break;
      }
    } catch (error) {
      logger?.error(
        `执行快捷菜单动作 [${action}] 失败`,
        error,
        "frontend.context-menu",
      );
    }
  }

  return {
    bindEvents,
    handleContextMenu,
    syncQuickMenuState: syncQuickMenuData,
  };
}
