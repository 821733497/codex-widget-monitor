import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { formatResetCountdown } from "./format.js";

const params = new URLSearchParams(location.search);
const preview = params.has("preview");
const popupWindow = params.has("popup");
const isMacOS =
  params.get("platform") === "macos" ||
  (typeof navigator !== "undefined" &&
    /mac/i.test(navigator.platform || navigator.userAgent || ""));
const popup = document.getElementById("popup");
const popupContent = popup.querySelector(".popup-content");
const metrics = document.getElementById("metrics");
let view = null;
let popupKind = null;
let barPopupKind = null;
let popupQueue = Promise.resolve();
let localError = "";
let blurTimer = null;
let lastPopupSize = null;

function resolveMetricValue(metric) {
  return metric?.resetAt
    ? formatResetCountdown(metric.resetAt, view?.locale)
    : metric?.value;
}

function updateLiveCountdowns() {
  if (!view) return;
  document.querySelectorAll("[data-reset-at]").forEach((el) => {
    const resetAt = el.dataset.resetAt;
    if (!resetAt) return;
    const next = formatResetCountdown(resetAt, view.locale);
    if (el.textContent !== next) {
      el.textContent = next;
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

function measurePopupBounds() {
  const width = 400;
  popup.classList.add("measuring");
  const bodyEl = popup.querySelector(".popup-body");
  const actionsEl = popup.querySelector(".popup-actions");
  const cs = getComputedStyle(popup);
  const chromeY =
    (parseFloat(cs.paddingTop) || 0) +
    (parseFloat(cs.paddingBottom) || 0) +
    (parseFloat(cs.borderTopWidth) || 0) +
    (parseFloat(cs.borderBottomWidth) || 0);
  const partsSum =
    (bodyEl ? Math.max(bodyEl.scrollHeight, bodyEl.offsetHeight) : 0) +
    (actionsEl ? actionsEl.offsetHeight : 0) +
    chromeY;
  const contentHeight = Math.max(popup.offsetHeight, partsSum);
  popup.classList.remove("measuring");
  const height =
    contentHeight > 0
      ? Math.max(60, Math.min(1200, Math.ceil(contentHeight + 2)))
      : 380;
  return { width, height };
}

async function syncPopupSize() {
  if (!popupWindow || !popupKind || popup.hidden) return;
  const { width, height } = measurePopupBounds();
  const sizeKey = `${width}x${height}`;
  if (lastPopupSize === sizeKey) return;
  lastPopupSize = sizeKey;
  await invoke("taskbar_popup", { open: true, height, width });
}

async function closePopup() {
  if (!popupWindow) {
    if (!barPopupKind) return;
    barPopupKind = null;
    metrics.setAttribute("aria-expanded", "false");
    await emitTo("taskbar-popup", "taskbar:popup-close");
    return;
  }
  if (!popupKind && popup.hidden) return;
  resetClosedPopupState();
  await invoke("taskbar_popup", { open: false });
  await emitTo("taskbar", "taskbar:popup-state", {
    open: false,
    kind: null,
  }).catch(() => {});
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

function createSvgIcon(paths, viewBox = "0 0 16 16", strokeWidth = "1.5") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", strokeWidth);
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const spec of paths) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", spec.tag);
    for (const [k, v] of Object.entries(spec.attrs)) {
      el.setAttribute(k, v);
    }
    svg.append(el);
  }
  return svg;
}

function gearIcon() {
  return createSvgIcon(
    [
      {
        tag: "path",
        attrs: {
          d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
        },
      },
      { tag: "circle", attrs: { cx: "12", cy: "12", r: "3" } },
    ],
    "0 0 24 24",
    "1.9",
  );
}

function refreshIcon() {
  return createSvgIcon([
    {
      tag: "path",
      attrs: { d: "M13.5 8a5.5 5.5 0 1 1-1.5-3.8" },
    },
    { tag: "polyline", attrs: { points: "10.2 4.3 12.8 4.5 12.6 1.9" } },
  ]);
}

function quitIcon() {
  return createSvgIcon([
    { tag: "path", attrs: { d: "M8 2.2v5.3" } },
    {
      tag: "path",
      attrs: { d: "M4.4 4.2a5.3 5.3 0 1 0 7.2 0" },
    },
  ]);
}

function renderPopup() {
  popup.dataset.kind = popupKind || "";
  const en = view?.locale === "en";

  const body = document.createElement("div");
  body.className = "popup-body";

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

  if (localError) {
    const error = document.createElement("div");
    error.className = "popup-error";
    error.textContent = `${en ? "Operation failed" : "操作失败"}：${localError}`;
    body.append(error);
  }

  const actions = document.createElement("div");
  actions.className = "popup-actions";
  if (isMacOS) {
    const settingsBtn = document.createElement("button");
    settingsBtn.type = "button";
    settingsBtn.className = "mac-footer-settings";
    const settingsLabel = document.createElement("span");
    settingsLabel.textContent = en ? "Settings" : "设置";
    settingsBtn.append(gearIcon(), settingsLabel);
    settingsBtn.addEventListener("click", () => {
      void enqueuePopup(closePopup).then(() => action("settings"));
    });

    const tools = document.createElement("div");
    tools.className = "mac-footer-tools";

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "mac-footer-icon-btn mac-refresh-btn";
    refreshBtn.disabled = Boolean(view?.loading);
    refreshBtn.setAttribute("aria-label", en ? "Refresh" : "刷新");
    refreshBtn.title = en ? "Refresh" : "刷新";
    refreshBtn.append(refreshIcon());
    refreshBtn.addEventListener("click", () => {
      void action("refresh");
    });

    const quitBtn = document.createElement("button");
    quitBtn.type = "button";
    quitBtn.className = "mac-footer-icon-btn mac-quit-btn";
    quitBtn.setAttribute("aria-label", en ? "Quit" : "退出");
    quitBtn.title = en ? "Quit CodexWidget" : "退出 CodexWidget";
    quitBtn.append(quitIcon());
    quitBtn.addEventListener("click", () => {
      void enqueuePopup(closePopup).then(() => action("quit"));
    });

    tools.append(refreshBtn, quitBtn);
    actions.append(settingsBtn, tools);
  } else {
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
  }
  popupContent.replaceChildren(body, actions);
}

async function togglePopup() {
  const kind = "sources";
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
  const { width, height } = measurePopupBounds();
  lastPopupSize = `${width}x${height}`;
  void action("preloadSources");
  await invoke("taskbar_popup", { open: true, height, width });
  if (popupKind !== kind || popup.hidden) return;
  await emitTo("taskbar", "taskbar:popup-state", { open: true, kind }).catch(
    () => {},
  );
  await nextFrame();
  if (popupKind !== kind || popup.hidden) return;
  popup.style.visibility = "";
  popup.tabIndex = -1;
  popup.focus({ preventScroll: true });
}

function applyGlassOpacity(opacity) {
  const val = Math.max(10, Math.min(100, Number(opacity) || 50));
  const alpha2 = (val / 100).toFixed(2);
  const alpha1 = ((val * 0.88) / 100).toFixed(2);
  document.documentElement.style.setProperty("--glass-tint-alpha-1", alpha1);
  document.documentElement.style.setProperty("--glass-tint-alpha-2", alpha2);
}

function render(data) {
  view = data;
  if (typeof data?.glassOpacity === "number") {
    applyGlassOpacity(data.glassOpacity);
  }
  document.documentElement.lang = data.locale === "en" ? "en" : "zh-CN";
  if (popupWindow) {
    document.body.dataset.loading = String(Boolean(data.loading));
    if (popupKind && !popup.hidden) {
      renderPopup();
      void enqueuePopup(() => syncPopupSize()).catch(showError);
    }
    return;
  }
  document.getElementById("site").textContent = data.site;
  document.getElementById("account").textContent = data.status || data.account;
  document.getElementById("source").title =
    `${data.site} · ${data.account} — ${data.locale === "en" ? "Click to switch source" : "单击切换下一来源"}`;
  document.body.dataset.loading = String(Boolean(data.loading));
  document.body.dataset.error = String(Boolean(data.error));
  document.getElementById("refresh").disabled = Boolean(data.loading);
  metrics.setAttribute("aria-label", data.locale === "en" ? "View usage and switch source" : "查看用量和切换来源");
  metrics.title = metrics.getAttribute("aria-label");
  metrics.replaceChildren(
    ...data.metrics.map((metric) => {
      const item = document.createElement("span");
      item.className = "metric";
      item.dataset.warning = String(Boolean(metric.warning));
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = metric.label;
      const value = document.createElement("span");
      value.className = "value";
      const displayValue = resolveMetricValue(metric);
      value.textContent = displayValue;
      if (metric.resetAt) value.dataset.resetAt = metric.resetAt;
      item.append(label, value);
      return item;
    }),
  );
}

function startCountdownLoop() {
  setInterval(updateLiveCountdowns, 15000);
}

async function startPopupWindow() {
  document.body.dataset.popupWindow = "true";
  if (isMacOS) {
    document.body.dataset.platform = "macos";
  }
  startCountdownLoop();
  void invoke("get_settings")
    .then((settings) => {
      if (typeof settings?.glassOpacity === "number") {
        applyGlassOpacity(settings.glassOpacity);
      }
    })
    .catch(() => {});
  await listen("taskbar:update", (event) => render(event.payload));
  await listen("taskbar:opacity", (event) => {
    if (typeof event.payload?.opacity === "number") {
      applyGlassOpacity(event.payload.opacity);
    }
  });
  await listen("taskbar:popup-toggle", () => {
    void enqueuePopup(() => togglePopup()).catch(showError);
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
  void invoke("get_settings")
    .then((settings) => {
      if (typeof settings?.glassOpacity === "number") {
        applyGlassOpacity(settings.glassOpacity);
      }
    })
    .catch(() => {});
  await listen("taskbar:update", (event) => render(event.payload));
  await listen("taskbar:opacity", (event) => {
    if (typeof event.payload?.opacity === "number") {
      applyGlassOpacity(event.payload.opacity);
    }
  });
  await listen("taskbar:placement", (event) => {
    document.body.dataset.docked = String(event.payload.docked);
    document.body.dataset.snap = String(event.payload.snap);
    if (event.payload.message)
      document.getElementById("grip").title = event.payload.message;
  });
  await listen("taskbar:popup-state", (event) => {
    barPopupKind = event.payload?.open ? event.payload.kind || null : null;
    metrics.setAttribute("aria-expanded", String(barPopupKind === "sources"));
  });
  document
    .getElementById("source")
    .addEventListener("click", () => void action("next"));
  metrics.addEventListener(
    "click",
    () => void togglePopup().catch(showError),
  );
  document
    .getElementById("refresh")
    .addEventListener("click", () => void action("refresh"));
  document.getElementById("grip").addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const x = event.clientX;
    const y =
      event.clientY -
      document.getElementById("taskbar").getBoundingClientRect().top;
    void closePopup()
      .then(() => invoke("taskbar_drag", { x, y }))
      .catch(showError);
  });
  document
    .getElementById("grip")
    .addEventListener(
      "dblclick",
      () => void invoke("taskbar_redock").catch(showError),
    );
  document.getElementById("grip").addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void invoke("taskbar_redock").catch(showError);
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (barPopupKind && !event.target.closest("#metrics, #grip")) {
      void closePopup().catch(showError);
    }
  });
  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    void togglePopup().catch(showError);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") void closePopup().catch(showError);
  });
  await emitTo("main", "taskbar:ready");
}

start().catch(showError);
