import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { buildTaskbarView } from "./app/taskbar-model.js";
import "./styles.css";

const state = {
  settings: null,
  quota: null,
  errors: {},
  sourceQuotas: {},
  loading: false,
};
let refreshTimer;
const id = () => crypto.randomUUID();
const showMessage = (text) => {
  document.querySelector("#message").textContent = text;
};

function targetKey(target) {
  return target?.type === "siteKey"
    ? `${target.siteId}:${target.keyId}`
    : "official";
}

function sameTarget(a, b) {
  return (
    a?.type === b?.type &&
    (a?.type === "official" ||
      (a?.siteId === b?.siteId && a?.keyId === b?.keyId))
  );
}

function sourceItems() {
  const items = [{ label: "官方 Codex CLI", target: { type: "official" } }];
  for (const site of state.settings?.sites || [])
    for (const key of site.keys || [])
      items.push({
        group: site.name,
        label: key.name || "Key",
        target: { type: "siteKey", siteId: site.id, keyId: key.id },
      });
  return items.map((item) => ({
    ...item,
    active: sameTarget(item.target, state.settings.activeTarget),
  }));
}

function escapeAttr(value) {
  return String(value || "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}

function renderSites(expandSiteId) {
  const root = document.querySelector("#sites");
  const openSites = new Set(
    [...root.querySelectorAll(".site[open]")].map((row) => row.dataset.siteId),
  );
  document.querySelector("#siteCount").textContent = state.settings.sites.length;
  root.replaceChildren();
  if (!state.settings.sites.length) {
    const empty = document.createElement("p");
    empty.className = "empty-sites";
    empty.textContent = "尚未添加中转站，可直接使用官方 Codex CLI。";
    root.append(empty);
  }
  for (const site of state.settings.sites) {
    const row = document.createElement("details");
    row.className = "site";
    row.dataset.siteId = site.id;
    row.open = openSites.has(site.id) || site.id === expandSiteId;
    row.innerHTML = `<summary><span class="summary-copy"><span class="summary-title" data-site-title>${escapeAttr(site.name) || "未命名站点"}</span><span class="summary-meta">${site.keys.length} 个 Key</span></span></summary><div class="site-content"><label class="ogui-field"><span>站点名称</span><input data-name value="${escapeAttr(site.name)}"></label><label class="ogui-field"><span>Base URL</span><input data-url value="${escapeAttr(site.baseUrl)}" placeholder="https://relay.example/v1"></label><div class="keys"></div><div class="actions"><button data-add-key class="ogui-button ogui-control--small" type="button">添加 Key</button><button data-remove-site class="ogui-button ogui-control--small ogui-button--danger" type="button">删除站点</button></div></div>`;
    const keys = row.querySelector(".keys");
    for (const key of site.keys) {
      const item = document.createElement("div");
      item.className = "key-row";
      item.innerHTML = `<input data-key-name aria-label="Key 名称" placeholder="名称" value="${escapeAttr(key.name)}"><input data-key-value aria-label="API Key" placeholder="API Key" type="password" value="${escapeAttr(key.key)}"><button data-remove-key class="ogui-button ogui-control--small ogui-button--danger" type="button" aria-label="删除 Key">删除</button>`;
      item.querySelector("[data-remove-key]").addEventListener("click", () => {
        site.keys = site.keys.filter((entry) => entry.id !== key.id);
        renderSites();
        renderTargets();
      });
      keys.append(item);
    }
    row.querySelector("[data-add-key]").addEventListener("click", () => {
      site.keys.push({ id: id(), name: "", key: "" });
      renderSites();
      renderTargets();
    });
    row.querySelector("[data-remove-site]").addEventListener("click", () => {
      state.settings.sites = state.settings.sites.filter(
        (entry) => entry.id !== site.id,
      );
      renderSites();
      renderTargets();
    });
    root.append(row);
  }
  root.querySelectorAll(".site").forEach((row, index) => {
    row.querySelector("[data-name]").addEventListener("input", (event) => {
      state.settings.sites[index].name = event.target.value;
      row.querySelector("[data-site-title]").textContent =
        event.target.value.trim() || "未命名站点";
      renderTargets();
    });
    row.querySelector("[data-url]").addEventListener("input", (event) => {
      state.settings.sites[index].baseUrl = event.target.value;
    });
    row.querySelectorAll(".key-row").forEach((keyRow, keyIndex) => {
      keyRow
        .querySelector("[data-key-name]")
        .addEventListener("input", (event) => {
          state.settings.sites[index].keys[keyIndex].name = event.target.value;
          renderTargets();
        });
      keyRow
        .querySelector("[data-key-value]")
        .addEventListener("input", (event) => {
          state.settings.sites[index].keys[keyIndex].key = event.target.value;
        });
    });
  });
}

function renderTargets() {
  const select = document.querySelector("#activeTarget");
  const selected = select.value;
  const items = sourceItems();
  const keepSelection = items.some(
    (item) => JSON.stringify(item.target) === selected,
  );
  select.replaceChildren();
  for (const item of items) {
    const option = document.createElement("option");
    option.value = JSON.stringify(item.target);
    option.textContent = item.group
      ? `${item.group} · ${item.label}`
      : item.label;
    option.selected = keepSelection ? option.value === selected : item.active;
    select.append(option);
  }
}

function renderSettings() {
  document.querySelector("#enabled").checked = state.settings.taskbarEnabled;
  document.querySelector("#codexPath").value =
    state.settings.codexCliPath || "";
  document.querySelector("#proxy").value = state.settings.updateProxy || "";
  renderSites();
  renderTargets();
}

async function saveSettings() {
  state.settings.taskbarEnabled = document.querySelector("#enabled").checked;
  state.settings.codexCliPath =
    document.querySelector("#codexPath").value.trim() || null;
  state.settings.updateProxy =
    document.querySelector("#proxy").value.trim() || null;
  state.settings.activeTarget = JSON.parse(
    document.querySelector("#activeTarget").value,
  );
  state.settings = await invoke("save_settings", { settings: state.settings });
  await invoke("set_taskbar_enabled", {
    enabled: state.settings.taskbarEnabled,
  });
  if (state.settings.taskbarEnabled) {
    await getCurrentWindow().hide();
    void getCurrentQuota();
  }
  showMessage("已保存");
}

async function testConnection() {
  const target = JSON.parse(document.querySelector("#activeTarget").value);
  if (target.type === "official") {
    await invoke("get_quota");
    showMessage("官方 Codex CLI 连接成功");
    return;
  }
  const site = state.settings.sites.find((item) => item.id === target.siteId);
  const key = site?.keys.find((item) => item.id === target.keyId);
  if (!site || !key) throw new Error("请选择有效站点和 Key");
  const proxy = document.querySelector("#proxy").value.trim() || null;
  const result = await invoke("test_sub2api_connection", {
    baseUrl: site.baseUrl,
    apiKey: key.key,
    proxy,
  });
  showMessage(result.message || "连接成功");
}

function getQuota(target) {
  return target
    ? invoke("get_quota_for_target", { target })
    : invoke("get_quota");
}

async function refresh(target = state.settings.activeTarget) {
  const cacheKey = targetKey(target);
  if (sameTarget(target, state.settings.activeTarget)) state.loading = true;
  try {
    const quota = await getQuota(target);
    state.sourceQuotas[cacheKey] = {
      quota,
      error: "",
      loading: false,
      updatedAt: Date.now(),
    };
    if (sameTarget(target, state.settings.activeTarget)) {
      state.quota = quota;
      state.errors.quota = "";
    }
  } catch (error) {
    const message = String(error?.message || error);
    state.sourceQuotas[cacheKey] = {
      ...state.sourceQuotas[cacheKey],
      error: message,
      loading: false,
    };
    if (sameTarget(target, state.settings.activeTarget))
      state.errors.quota = message;
  } finally {
    state.loading = false;
    await publishTaskbar();
  }
}

async function getCurrentQuota() {
  await refresh();
  for (const item of sourceItems()) if (!item.active) void refresh(item.target);
}

async function publishTaskbar() {
  const view = buildTaskbarView(state, sourceItems());
  for (const label of ["taskbar", "taskbar-popup"])
    await emitTo(label, "taskbar:update", view).catch(() => {});
}

async function handleTaskbarAction(event) {
  const { action, target } = event.payload || {};
  if (action === "settings") {
    await invoke("show_main_window");
    return;
  }
  if (action === "disable") {
    state.settings.taskbarEnabled = false;
    document.querySelector("#enabled").checked = false;
    state.settings = await invoke("save_settings", {
      settings: state.settings,
    });
    await invoke("set_taskbar_enabled", { enabled: false });
    await invoke("show_main_window");
    return;
  }
  if (action === "next") {
    const items = sourceItems();
    const current = items.findIndex((item) => item.active);
    state.settings.activeTarget = items[(current + 1) % items.length].target;
    state.settings = await invoke("save_settings", {
      settings: state.settings,
    });
    await refresh();
  }
  if (action === "source" && target) {
    state.settings.activeTarget = target;
    state.settings = await invoke("save_settings", {
      settings: state.settings,
    });
    await refresh();
  }
  if (action === "refresh") await getCurrentQuota();
  if (action === "preloadSources")
    for (const item of sourceItems())
      if (!item.active) void refresh(item.target);
}

async function start() {
  state.settings = await invoke("get_settings");
  renderSettings();
  document
    .querySelector("#closeWindow")
    ?.addEventListener("click", () => void getCurrentWindow().hide());
  document.querySelector("#addSite").addEventListener("click", () => {
    const site = { id: id(), name: "", baseUrl: "", keys: [] };
    state.settings.sites.push(site);
    renderSites(site.id);
    renderTargets();
    const row = [...document.querySelectorAll(".site")].find(
      (entry) => entry.dataset.siteId === site.id,
    );
    row?.querySelector("[data-name]").focus();
  });
  document
    .querySelector("#save")
    .addEventListener(
      "click",
      () => void saveSettings().catch((error) => showMessage(String(error))),
    );
  document
    .querySelector("#testConnection")
    .addEventListener(
      "click",
      () =>
        void testConnection().catch((error) =>
          showMessage(String(error?.message || error)),
        ),
    );
  document
    .querySelector("#enabled")
    .addEventListener(
      "change",
      () => void saveSettings().catch((error) => showMessage(String(error))),
    );
  await listen("taskbar:ready", () => void publishTaskbar());
  await listen("taskbar:action", (event) => void handleTaskbarAction(event));
  await getCurrentQuota();
  refreshTimer = setInterval(() => void getCurrentQuota(), 5 * 60 * 1000);
  window.addEventListener("beforeunload", () => clearInterval(refreshTimer), {
    once: true,
  });
}

start().catch((error) => showMessage(String(error?.message || error)));
