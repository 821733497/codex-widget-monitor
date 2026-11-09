import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

const preview = new URLSearchParams(location.search).has("preview");
const popup = document.getElementById("popup");
const choose = document.getElementById("choose");
let view = null;
let popupKind = null;
let resizeQueue = Promise.resolve();
let localError = "";
let blurTimer = null;

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

function resizePopup(open) {
  resizeQueue = resizeQueue.catch(() => {}).then(() => invoke("taskbar_popup", { open }));
  return resizeQueue;
}

async function closePopup() {
  if (!popupKind && popup.hidden) return resizeQueue;
  popupKind = null;
  popup.hidden = true;
  popup.removeAttribute("data-kind");
  choose.setAttribute("aria-expanded", "false");
  await resizePopup(false);
}

function button(label, onClick) {
  const result = document.createElement("button");
  result.type = "button";
  result.textContent = label;
  result.addEventListener("click", () => void onClick());
  return result;
}

function renderPopup() {
  popup.replaceChildren();
  popup.dataset.kind = popupKind || "";
  const en = view?.locale === "en";

  const body = document.createElement("div");
  body.className = "popup-body";

  if (popupKind === "sources") {
    let group = null;
    view?.sources?.forEach((source) => {
      if (source.group && source.group !== group) {
        group = source.group;
        const title = document.createElement("div");
        title.className = "group-title";
        title.textContent = group;
        body.append(title);
      }
      const item = document.createElement("button");
      item.type = "button";
      item.className = "popup-item";
      item.setAttribute("role", "menuitemradio");
      item.setAttribute("aria-checked", String(source.active));

      const label = document.createElement("span");
      label.className = "item-label";
      label.textContent = source.label;

      const check = document.createElement("span");
      check.className = "item-check";
      check.textContent = source.active ? "✓" : "";

      item.append(label, check);
      item.addEventListener("click", () => {
        void closePopup().then(() => action("source", source.target));
      });
      body.append(item);
    });
  } else {
    view?.metrics?.forEach((metric) => {
      const item = document.createElement("div");
      item.className = "detail-row";

      const label = document.createElement("span");
      label.className = "detail-label";
      label.textContent = metric.label;

      const value = document.createElement("span");
      value.className = "detail-value";
      value.textContent = metric.value;

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
    [en ? "Open panel" : "打开完整面板", "panel"],
    [en ? "Settings" : "设置", "settings"],
    [en ? "Exit taskbar mode" : "退出任务栏模式", "disable"],
  ];
  actionItems.forEach(([label, name]) => {
    const btn = button(label, async () => {
      await closePopup();
      await action(name);
    });
    btn.className = "action-btn";
    actions.append(btn);
  });
  popup.append(actions);
}

async function togglePopup(kind) {
  if (popupKind === kind) return closePopup();
  popupKind = kind;
  renderPopup();
  await resizePopup(true);
  popup.hidden = false;
  choose.setAttribute("aria-expanded", String(kind === "sources"));
  popup.querySelector("button")?.focus();
}

function render(data) {
  view = data;
  document.documentElement.lang = data.locale === "en" ? "en" : "zh-CN";
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
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = metric.label;
      const value = document.createElement("span");
      value.className = "value";
      value.textContent = metric.value;
      item.append(label, value);
      item.title = `${metric.label}：${metric.value}${metric.detail ? ` · ${metric.detail}` : ""}`;
      return item;
    }),
  );
  if (popupKind) renderPopup();
}

async function start() {
  if (preview) {
    document.body.classList.add("preview");
    return;
  }
  document.body.dataset.docked = "true";
  await listen("taskbar:update", (event) => render(event.payload));
  await listen("taskbar:placement", (event) => {
    document.body.dataset.docked = String(event.payload.docked);
    document.body.dataset.snap = String(event.payload.snap);
    if (event.payload.message) document.getElementById("grip").title = event.payload.message;
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
  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    void togglePopup("details").catch(showError);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") void closePopup().catch(showError);
  });
  await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }
    // 原生激活与 owner 切换可能短暂失焦，不能在鼠标点击菜单项前把弹层收起。
    if (!focused && popupKind) blurTimer = setTimeout(() => void closePopup().catch(showError), 200);
  });
  await emitTo("main", "taskbar:ready");
}

start().catch(showError);
