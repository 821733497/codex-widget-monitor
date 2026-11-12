import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { formatResetCountdown } from "../app/formatters.js";

const params = new URLSearchParams(location.search);
const preview = params.has("preview");
const popupWindow = params.has("popup");
const popup = document.getElementById("popup");
const choose = document.getElementById("choose");
let view = null;
let popupKind = null;
let barPopupKind = null;
let popupQueue = Promise.resolve();
let localError = "";
let blurTimer = null;
let lastPopupSize = null;

function resolveMetricValue(metric) {
  return metric?.resetAt ? formatResetCountdown(metric.resetAt, view?.locale) : metric?.value;
}

function updateLiveCountdowns() {
  if (!view) return;
  document.querySelectorAll("[data-reset-at]").forEach((el) => {
    const resetAt = el.dataset.resetAt;
    if (!resetAt) return;
    const next = formatResetCountdown(resetAt, view.locale);
    if (el.textContent !== next) {
      el.textContent = next;
      const metricBtn = el.closest(".metric");
      if (metricBtn) {
        const label = metricBtn.querySelector(".label")?.textContent || "";
        const detail = metricBtn.dataset.detail || "";
        metricBtn.title = `${label}：${next}${detail ? ` · ${detail}` : ""}`;
      }
    }
  });
}

function showError(error) {
  localError = String(error?.message || error);
  document.body.dataset.error = "true";
  document.getElementById("account").textContent = "操作失败";
  document.getElementById("source").title = localError;
}

async function action(action, target) {
  try {
    await emitTo("main", "taskbar:action", { action, target });
  } catch (error) {
    showError(error);
  }
}

function enqueuePopup(task) {
  popupQueue = popupQueue.catch(() => {}).then(task);
  return popupQueue;
}

async function nextFrame() {
  if (typeof requestAnimationFrame === "function") {
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function resetClosedPopupState() {
  popupKind = null;
  lastPopupSize = null;
  popup.hidden = true;
  popup.style.visibility = "";
  popup.removeAttribute("data-kind");
}

function measurePopupBounds(kind) {
  const width = kind === "details" ? 264 : 400;
  popup.classList.add("measuring");
  const bodyEl = popup.querySelector(".popup-body");
  const actionsEl = popup.querySelector(".popup-actions");
  const partsSum =
    (bodyEl ? Math.max(bodyEl.scrollHeight, bodyEl.offsetHeight) : 0) +
    (actionsEl ? actionsEl.offsetHeight : 0);
  const contentHeight = Math.max(popup.scrollHeight, popup.offsetHeight, partsSum);
  popup.classList.remove("measuring");
  const height =
    contentHeight > 0 ? Math.max(60, Math.min(1200, Math.ceil(contentHeight + 2))) : 380;
  return { width, height };
}

async function syncPopupSize() {
  if (!popupWindow || !popupKind || popup.hidden) return;
  const { width, height } = measurePopupBounds(popupKind);
  const sizeKey = `${width}x${height}`;
  if (lastPopupSize === sizeKey) return;
  lastPopupSize = sizeKey;
  await invoke("taskbar_popup", { open: true, height, width });
}

async function closePopup() {
  if (!popupWindow) {
    if (!barPopupKind) return;
    barPopupKind = null;
    choose.setAttribute("aria-expanded", "false");
    await emitTo("taskbar-popup", "taskbar:popup-close");
    return;
  }
  if (!popupKind && popup.hidden) return;
  resetClosedPopupState();
  await invoke("taskbar_popup", { open: false });
  await emitTo("taskbar", "taskbar:popup-state", { open: false, kind: null }).catch(() => {});
}

function button(label, onClick) {
  const result = document.createElement("button");
  result.type = "button";
  result.textContent = label;
  result.addEventListener("click", () => void onClick());
  return result;
}

function buildSourceItem(source) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "popup-source-item";
  item.setAttribute("role", "menuitemradio");
  item.setAttribute("aria-checked", String(source.active));
  if (source.error) item.title = source.error;

  const header = document.createElement("div");
  header.className = "source-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "source-title-wrap";
  const label = document.createElement("span");
  label.className = "item-label";
  label.textContent = source.label;
  titleWrap.append(label);

  if (source.plan) {
    const plan = document.createElement("span");
    plan.className = "source-plan";
    plan.textContent = source.plan;
    titleWrap.append(plan);
  }

  const statusWrap = document.createElement("div");
  statusWrap.className = "source-status-wrap";
  if (source.status) {
    const badge = document.createElement("span");
    badge.className = "source-badge";
    if (source.error) badge.dataset.error = "true";
    badge.textContent = source.status;
    statusWrap.append(badge);
  }
  if (source.active) {
    const check = document.createElement("span");
    check.className = "item-check";
    check.textContent = "✓";
    statusWrap.append(check);
  }

  header.append(titleWrap, statusWrap);
  item.append(header);

  if (Array.isArray(source.metrics) && source.metrics.length > 0) {
    const metricsGrid = document.createElement("div");
    metricsGrid.className = "source-metrics";
    source.metrics.forEach((metric) => {
      const cell = document.createElement("div");
      cell.className = "source-metric";
      if (metric.warning) cell.dataset.warning = "true";

      const mLabel = document.createElement("span");
      mLabel.className = "source-metric-label";
      mLabel.textContent = metric.label;

      const mValue = document.createElement("span");
      mValue.className = "source-metric-value";
      const displayValue = resolveMetricValue(metric);
      mValue.textContent = displayValue;
      if (metric.resetAt) mValue.dataset.resetAt = metric.resetAt;

      cell.append(mLabel, mValue);
      metricsGrid.append(cell);
    });
    item.append(metricsGrid);
  }

  item.addEventListener("click", () => {
    void enqueuePopup(closePopup).then(() => action("source", source.target));
  });
  return item;
}

function renderPopup() {
  popup.replaceChildren();
  popup.dataset.kind = popupKind || "";
  const en = view?.locale === "en";

  const body = document.createElement("div");
  body.className = "popup-body";

  if (popupKind === "sources") {
    const list = document.createElement("div");
    list.className = "source-list";
    let group = null;
    view?.sources?.forEach((source) => {
      if (source.group && source.group !== group) {
        group = source.group;
        const title = document.createElement("div");
        title.className = "group-title";
        title.textContent = group;
        list.append(title);
      }
      list.append(buildSourceItem(source));
    });
    body.append(list);
  } else {
    view?.metrics?.forEach((metric) => {
      const item = document.createElement("div");
      item.className = "detail-row";

      const label = document.createElement("span");
      label.className = "detail-label";
      label.textContent = metric.label;

      const value = document.createElement("span");
      value.className = "detail-value";
      value.textContent = resolveMetricValue(metric);
      if (metric.resetAt) value.dataset.resetAt = metric.resetAt;

      item.append(label, value);
      if (metric.detail) {
        const desc = document.createElement("div");
        desc.className = "detail-desc";
        desc.textContent = metric.detail;
        item.append(desc);
      }
      body.append(item);
    });
    if (view?.error) {
      const error = document.createElement("div");
      error.className = "popup-error";
      error.textContent = `${en ? "Last refresh failed" : "本次读取失败"}：${view.error}`;
      body.append(error);
    }
  }

  if (localError) {
    const error = document.createElement("div");
    error.className = "popup-error";
    error.textContent = `${en ? "Operation failed" : "操作失败"}：${localError}`;
    body.append(error);
  }

  popup.append(body);

  const actions = document.createElement("div");
  actions.className = "popup-actions";
  const actionItems = [
    [en ? "Settings" : "设置", "settings"],
    [en ? "Exit taskbar mode" : "退出任务栏模式", "disable"],
  ];
  actionItems.forEach(([label, name]) => {
    const btn = button(label, async () => {
      await enqueuePopup(closePopup);
      await action(name);
    });
    btn.className = "action-btn";
    actions.append(btn);
  });
  popup.append(actions);
}

async function togglePopup(kind) {
  if (!kind) return;
  if (!popupWindow) {
    await emitTo("taskbar-popup", "taskbar:popup-toggle", { kind });
    return;
  }
  if (popupKind === kind) {
    await closePopup();
    return;
  }
  popupKind = kind;
  lastPopupSize = null;
  renderPopup();
  popup.style.visibility = "hidden";
  popup.hidden = false;
  const { width, height } = measurePopupBounds(kind);
  lastPopupSize = `${width}x${height}`;
  if (kind === "sources") {
    void action("preloadSources");
  }
  await invoke("taskbar_popup", { open: true, height, width });
  if (popupKind !== kind || popup.hidden) return;
  await emitTo("taskbar", "taskbar:popup-state", { open: true, kind }).catch(() => {});
  await nextFrame();
  if (popupKind !== kind || popup.hidden) return;
  popup.style.visibility = "";
  popup.tabIndex = -1;
  popup.focus({ preventScroll: true });
}

function render(data) {
  view = data;
  document.documentElement.lang = data.locale === "en" ? "en" : "zh-CN";
  if (popupWindow) {
    if (popupKind && !popup.hidden) {
      renderPopup();
      void enqueuePopup(() => syncPopupSize()).catch(showError);
    }
    return;
  }
  document.getElementById("site").textContent = data.site;
  document.getElementById("account").textContent = data.status || data.account;
  document.getElementById("source").title = `${data.site} · ${data.account} — ${data.locale === "en" ? "Click to switch source" : "单击切换下一来源"}`;
  document.body.dataset.loading = String(Boolean(data.loading));
  document.body.dataset.error = String(Boolean(data.error));
  document.getElementById("refresh").disabled = Boolean(data.loading);
  document.getElementById("metrics").replaceChildren(
    ...data.metrics.map((metric) => {
      const item = button("", () => togglePopup("details"));
      item.className = "metric";
      item.dataset.warning = String(Boolean(metric.warning));
      if (metric.detail) item.dataset.detail = metric.detail;
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = metric.label;
      const value = document.createElement("span");
      value.className = "value";
      const displayValue = resolveMetricValue(metric);
      value.textContent = displayValue;
      if (metric.resetAt) value.dataset.resetAt = metric.resetAt;
      item.append(label, value);
      item.title = `${metric.label}：${displayValue}${metric.detail ? ` · ${metric.detail}` : ""}`;
      return item;
    }),
  );
}

function startCountdownLoop() {
  setInterval(updateLiveCountdowns, 15000);
}

async function startPopupWindow() {
  document.body.dataset.popupWindow = "true";
  startCountdownLoop();
  await listen("taskbar:update", (event) => render(event.payload));
  await listen("taskbar:popup-toggle", (event) => {
    void enqueuePopup(() => togglePopup(event.payload?.kind)).catch(showError);
  });
  await listen("taskbar:popup-close", () => {
    void enqueuePopup(() => closePopup()).catch(showError);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      void enqueuePopup(() => closePopup()).catch(showError);
    }
  });
  await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }
    // 稍作缓冲再核对系统前台窗口：点中底栏触发按钮时保持交由底栏切换，点中外部应用时立即收起。
    if (!focused && popupKind) {
      blurTimer = setTimeout(() => {
        void enqueuePopup(async () => {
          if (!popupKind) return;
          const closed = await invoke("taskbar_popup_blur_close");
          if (closed) {
            resetClosedPopupState();
          }
        }).catch(showError);
      }, 60);
    }
  });
  await emitTo("main", "taskbar:ready");
}

async function start() {
  if (preview) {
    document.body.classList.add("preview");
    return;
  }
  if (popupWindow) {
    await startPopupWindow();
    return;
  }
  document.body.dataset.docked = "true";
  startCountdownLoop();
  await listen("taskbar:update", (event) => render(event.payload));
  await listen("taskbar:placement", (event) => {
    document.body.dataset.docked = String(event.payload.docked);
    document.body.dataset.snap = String(event.payload.snap);
    if (event.payload.message) document.getElementById("grip").title = event.payload.message;
  });
  await listen("taskbar:popup-state", (event) => {
    barPopupKind = event.payload?.open ? event.payload.kind || null : null;
    choose.setAttribute("aria-expanded", String(barPopupKind === "sources"));
  });
  document.getElementById("source").addEventListener("click", () => void action("next"));
  choose.addEventListener("click", () => void togglePopup("sources").catch(showError));
  document.getElementById("refresh").addEventListener("click", () => void action("refresh"));
  document.getElementById("grip").addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const x = event.clientX;
    const y = event.clientY - document.getElementById("taskbar").getBoundingClientRect().top;
    void closePopup()
      .then(() => invoke("taskbar_drag", { x, y }))
      .catch(showError);
  });
  document.getElementById("grip").addEventListener("dblclick", () => void invoke("taskbar_redock").catch(showError));
  document.getElementById("grip").addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void invoke("taskbar_redock").catch(showError);
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (barPopupKind && !event.target.closest("#choose, .metric, #grip")) {
      void closePopup().catch(showError);
    }
  });
  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    void togglePopup("details").catch(showError);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") void closePopup().catch(showError);
  });
  await emitTo("main", "taskbar:ready");
}

start().catch(showError);
