import { detectWindows } from "./platform.js";
import { buildTaskbarView } from "./taskbar-model.js";

export function createTaskbarController({ state, service, persistSettings, sourcePicker, refreshQuota, openSettings, windowController, logger }) {
  const available = detectWindows() && service.isAvailable() && service.commands.setTaskbarEnabled;
  let lastView = "";
  let busy = false;

  function report(error) {
    state.errors.window = String(error?.message || error);
    logger?.error("任务栏模式操作失败", error, "frontend.taskbar");
  }

  async function update(force = false) {
    if (!available) return;
    const view = buildTaskbarView(state, sourcePicker.buildSourceItems());
    const serialized = JSON.stringify(view);
    if (!force && serialized === lastView) return;
    try {
      await service.events.emitTo("taskbar", "taskbar:update", view);
      lastView = serialized;
    } catch (error) { report(error); }
  }

  async function setEnabled(enabled) {
    if (!available || busy) return;
    busy = true;
    const previous = state.settings.taskbarEnabled;
    try {
      // 原生窗口成功后再保存；写盘失败恢复此前窗口状态。
      await service.commands.setTaskbarEnabled(enabled);
      try {
        await persistSettings((settings) => ({ ...settings, taskbarEnabled: enabled }), { syncDraft: true });
      } catch (error) {
        await service.commands.setTaskbarEnabled(previous);
        throw error;
      }
      await update(true);
      if (enabled) {
        if (state.settingsOpen) await openSettings(false);
        await windowController.hideWindow();
      } else await service.commands.showMainWindow();
    } catch (error) { report(error); }
    finally { busy = false; }
  }

  async function handleAction(event) {
    const { action, target } = event.payload || {};
    try {
      if (action === "next") await sourcePicker.cycleToNextSource();
      if (action === "source") {
        const item = sourcePicker.buildSourceItems().find(({ target: known }) =>
          known.type === target?.type && (known.type === "official" ||
            (known.siteId === target.siteId && known.keyId === target.keyId)),
        );
        if (item) await sourcePicker.switchSource(item.target);
      }
      if (action === "refresh") await refreshQuota();
      if (action === "panel" || action === "settings") {
        await service.commands.showMainWindow();
        if (action === "panel") await windowController.setWidgetMode("panel");
        else await openSettings("basic");
      }
      if (action === "disable") await setEnabled(false);
      await update(true);
    } catch (error) { report(error); }
  }

  async function start() {
    if (!available) return;
    const row = document.createElement("div");
    row.id = "taskbarModeRow";
    row.className = "settings-field";
    row.style.gridColumn = "1 / -1";
    const label = document.createElement("span");
    label.textContent = state.locale === "en" ? "Windows taskbar" : "Windows 任务栏";
    const entry = document.createElement("button");
    entry.id = "taskbarModeBtn";
    entry.type = "button";
    entry.className = "settings-input";
    entry.setAttribute("data-no-drag", "");
    row.append(label, entry);
    document.getElementById("basicSettingsScroll")?.append(row);
    const button = document.getElementById("taskbarModeBtn");
    button?.addEventListener("click", () => void setEnabled(!state.settings.taskbarEnabled));
    await service.events.listen("taskbar:ready", () => void update(true));
    await service.events.listen("taskbar:action", handleAction);
    render();
    if (state.settings.taskbarEnabled) {
      await service.commands.setTaskbarEnabled(true);
      await windowController.hideWindow();
    }
    await update(true);
  }

  function render() {
    if (!available) return;
    const button = document.getElementById("taskbarModeBtn");
    if (button) button.textContent = state.locale === "en"
      ? state.settings.taskbarEnabled ? "Exit taskbar mode" : "Enter taskbar mode"
      : state.settings.taskbarEnabled ? "退出任务栏模式" : "进入任务栏模式";
    void update();
  }
  return { start, render, setEnabled };
}
