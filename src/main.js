import { invoke } from "@tauri-apps/api/core";
import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check } from "@tauri-apps/plugin-updater";
import { buildTaskbarView, formatMenubarTitle } from "./app/taskbar-model.js";
import { createUpdateController } from "./app/update-controller.js";
import { formatUpdateStatus } from "./app/update-status.js";
import "./styles.css";

const isMacOS =
  typeof navigator !== "undefined" &&
  /mac/i.test(navigator.platform || navigator.userAgent || "");

const state = {
  settings: null,
  quota: null,
  quotaTarget: null,
  errors: {},
  sourceQuotas: {},
  loading: false,
  updateTimer: null,
  transientStatusTimer: null,
  updateStatus: null,
  updateChecking: false,
};
const QUOTA_CACHE_STORAGE_KEY = "codex-widget.quota-cache.v1";
let refreshTimer;
let settingsWrite = Promise.resolve();
const updateService = {
  isAvailable: () => Boolean(window.__TAURI_INTERNALS__),
  updater: { check },
};
const updateController = createUpdateController({
  state,
  service: updateService,
  render: () => renderUpdateStatus(),
  logger: {
    info: (...args) => console.info(...args),
    error: (...args) => console.error(...args),
  },
});
const id = () => crypto.randomUUID();
const showMessage = (text) => {
  const msg = document.querySelector("#message");
  if (msg) msg.textContent = text;
  const footer = document.querySelector("#footer");
  if (footer) footer.style.display = text ? "flex" : "none";
};

function loadQuotaCache() {
  try {
    const stored = JSON.parse(localStorage.getItem(QUOTA_CACHE_STORAGE_KEY) || "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(
      Object.entries(stored)
        .filter(([, entry]) => entry?.quota && typeof entry.quota === "object")
        .map(([key, entry]) => [
          key,
          {
            quota: entry.quota,
            updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : 0,
            loading: false,
            error: "",
          },
        ]),
    );
  } catch {
    return {};
  }
}

function persistQuotaCache() {
  try {
    const stored = Object.fromEntries(
      Object.entries(state.sourceQuotas)
        .filter(([, entry]) => entry?.quota && typeof entry.quota === "object")
        .map(([key, entry]) => [key, { quota: entry.quota, updatedAt: entry.updatedAt || 0 }]),
    );
    localStorage.setItem(QUOTA_CACHE_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // 缓存失败不影响当前额度查询和任务栏显示。
  }
}

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
        void saveSettings().catch((error) => showMessage(String(error)));
      });
      keys.append(item);
    }
    row.querySelector("[data-add-key]").addEventListener("click", () => {
      site.keys.push({ id: id(), name: "", key: "" });
      renderSites();
      renderTargets();
      void saveSettings().catch((error) => showMessage(String(error)));
    });
    row.querySelector("[data-remove-site]").addEventListener("click", () => {
      state.settings.sites = state.settings.sites.filter(
        (entry) => entry.id !== site.id,
      );
      renderSites();
      renderTargets();
      void saveSettings().catch((error) => showMessage(String(error)));
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
    row.querySelector("[data-name]").addEventListener("change", () => {
      void saveSettings().catch((error) => showMessage(String(error)));
    });
    row.querySelector("[data-url]").addEventListener("input", (event) => {
      state.settings.sites[index].baseUrl = event.target.value;
    });
    row.querySelector("[data-url]").addEventListener("change", () => {
      void saveSettings().catch((error) => showMessage(String(error)));
    });
    row.querySelectorAll(".key-row").forEach((keyRow, keyIndex) => {
      keyRow
        .querySelector("[data-key-name]")
        .addEventListener("input", (event) => {
          state.settings.sites[index].keys[keyIndex].name = event.target.value;
          renderTargets();
        });
      keyRow
        .querySelector("[data-key-name]")
        .addEventListener("change", () => {
          void saveSettings().catch((error) => showMessage(String(error)));
        });
      keyRow
        .querySelector("[data-key-value]")
        .addEventListener("input", (event) => {
          state.settings.sites[index].keys[keyIndex].key = event.target.value;
        });
      keyRow
        .querySelector("[data-key-value]")
        .addEventListener("change", () => {
          void saveSettings().catch((error) => showMessage(String(error)));
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

function applyGlassOpacity(opacity) {
  const val = Math.max(10, Math.min(100, Number(opacity) || 50));
  const alpha2 = (val / 100).toFixed(2);
  const alpha1 = ((val * 0.88) / 100).toFixed(2);
  document.documentElement.style.setProperty("--glass-tint-alpha-1", alpha1);
  document.documentElement.style.setProperty("--glass-tint-alpha-2", alpha2);
}

function renderSettings() {
  document.querySelector("#enabled").checked = state.settings.taskbarEnabled;
  document.querySelector("#autoUpdate").checked = state.settings.autoUpdateEnabled;
  const opacity =
    typeof state.settings.glassOpacity === "number"
      ? state.settings.glassOpacity
      : 50;
  const opacitySlider = document.querySelector("#glassOpacity");
  const opacityValue = document.querySelector("#opacityValue");
  if (opacitySlider) {
    opacitySlider.value = opacity;
  }
  if (opacityValue) {
    opacityValue.textContent = `${opacity}%`;
  }
  applyGlassOpacity(opacity);
  document.querySelector("#codexPath").value =
    state.settings.codexCliPath || "";
  document.querySelector("#proxy").value = state.settings.updateProxy || "";
  renderSites();
  renderTargets();
  renderUpdateStatus();
}

function renderUpdateStatus() {
  const status = document.querySelector("#updateStatus");
  if (!status) return;
  status.textContent = formatUpdateStatus(
    {
      checkingUpdate: "正在检查更新...",
      updateAvailable: "发现新版本",
      updateDownloading: "正在下载更新",
      updateInstalling: "正在安装更新",
      updateReady: "更新已安装，重启后生效",
      updateCheckFailed: "获取版本失败",
      updateInstallFailed: "更新失败",
      updateFailed: "更新检查失败",
      updateLatest: "已是最新版本",
      updateDevMode: "开发模式：已跳过安装",
      settingsSaved: "设置已保存",
    },
    state.updateStatus,
  );
}

function persistSettings() {
  // 表单事件持有当前对象，保存时发送快照并按顺序写入。
  const settings = structuredClone(state.settings);
  const write = settingsWrite.then(() => invoke("save_settings", { settings }));
  settingsWrite = write.catch(() => {});
  return write;
}

async function saveSettings() {
  const previousTarget = state.settings.activeTarget;
  const updateSettings = {
    enabled: state.settings.autoUpdateEnabled,
    proxy: state.settings.updateProxy,
  };
  state.settings.taskbarEnabled = document.querySelector("#enabled").checked;
  state.settings.autoUpdateEnabled = document.querySelector("#autoUpdate").checked;
  const opacitySlider = document.querySelector("#glassOpacity");
  if (opacitySlider) {
    state.settings.glassOpacity = Number(opacitySlider.value) || 50;
  }
  state.settings.codexCliPath =
    document.querySelector("#codexPath").value.trim() || null;
  state.settings.updateProxy =
    document.querySelector("#proxy").value.trim() || null;
  const targetSelect = document.querySelector("#activeTarget");
  if (targetSelect?.value) {
    const nextTarget = JSON.parse(targetSelect.value);
    state.settings.activeTarget = nextTarget;
    if (!sameTarget(previousTarget, nextTarget)) {
      const cached = state.sourceQuotas[targetKey(nextTarget)];
      state.quotaTarget = nextTarget;
      state.quota = cached?.quota || null;
      state.errors.quota = cached?.error || "";
    }
  }
  await persistSettings();
  await invoke("set_taskbar_enabled", {
    enabled: state.settings.taskbarEnabled,
  });
  await publishTaskbar();
  if (state.settings.taskbarEnabled) {
    void getCurrentQuota();
  }
  if (
    updateSettings.enabled !== state.settings.autoUpdateEnabled ||
    updateSettings.proxy !== state.settings.updateProxy
  ) {
    updateController.scheduleUpdateChecks();
  }
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
  const cached = state.sourceQuotas[cacheKey];
  if (sameTarget(target, state.settings.activeTarget)) {
    state.quotaTarget = target;
    state.quota = cached?.quota || null;
    state.errors.quota = cached?.error || "";
    state.loading = true;
  }
  state.sourceQuotas[cacheKey] = {
    ...cached,
    loading: true,
  };
  await publishTaskbar();
  try {
    const quota = await getQuota(target);
    state.sourceQuotas[cacheKey] = {
      quota,
      error: "",
      loading: false,
      updatedAt: Date.now(),
    };
    persistQuotaCache();
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
  if (isMacOS) {
    const title = state.settings?.taskbarEnabled ? formatMenubarTitle(view) : "";
    await invoke("set_menubar_title", { title }).catch(() => {});
  }
}

async function handleTaskbarAction(event) {
  const { action, target } = event.payload || {};
  if (action === "quit") {
    await invoke("quit_app");
    return;
  }
  if (action === "settings") {
    await invoke("show_main_window");
    return;
  }
  if (action === "disable") {
    state.settings.taskbarEnabled = false;
    document.querySelector("#enabled").checked = false;
    await persistSettings();
    await invoke("set_taskbar_enabled", { enabled: false });
    await invoke("show_main_window");
    return;
  }
  if (action === "next") {
    const items = sourceItems();
    const current = items.findIndex((item) => item.active);
    state.settings.activeTarget = items[(current + 1) % items.length].target;
    renderTargets();
    await persistSettings();
    await refresh();
  }
  if (action === "source" && target) {
    state.settings.activeTarget = target;
    renderTargets();
    await persistSettings();
    await refresh();
  }
  if (action === "refresh") await getCurrentQuota();
  if (action === "preloadSources") {
    const activeEntry =
      state.sourceQuotas[targetKey(state.settings.activeTarget)];
    if (
      !activeEntry?.loading &&
      (!activeEntry?.quota || activeEntry?.error)
    ) {
      void refresh();
    }
    for (const item of sourceItems())
      if (!item.active) void refresh(item.target);
  }
}

async function start() {
  if (isMacOS) {
    document.documentElement.dataset.platform = "macos";
    const heading = document.querySelector("header h1");
    if (heading) heading.textContent = "Codex 额度设置";
    const codexPath = document.querySelector("#codexPath");
    if (codexPath) codexPath.placeholder = "留空时自动查找 codex";
    const toggleRow = document.querySelector(".taskbar-toggle-row");
    if (toggleRow) {
      toggleRow.title = "在顶部菜单栏图标旁显示当前选中数据源的实时额度";
      const toggleLabel = toggleRow.querySelector(".ogui-switch__label");
      if (toggleLabel) toggleLabel.textContent = "菜单栏显示实时额度";
    }
  }
  state.settings = await invoke("get_settings");
  state.sourceQuotas = loadQuotaCache();
  renderSettings();
  showMessage("");
  document
    .querySelector("#closeWindow")
    ?.addEventListener("click", () => void getCurrentWindow().hide());
  document.querySelector("#addSite").addEventListener("click", () => {
    const site = { id: id(), name: "", baseUrl: "", keys: [] };
    state.settings.sites.push(site);
    renderSites(site.id);
    renderTargets();
    void saveSettings().catch((error) => showMessage(String(error)));
    const row = [...document.querySelectorAll(".site")].find(
      (entry) => entry.dataset.siteId === site.id,
    );
    row?.querySelector("[data-name]").focus();
  });
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
  document.querySelector("#autoUpdate")?.addEventListener("change", () => {
    void saveSettings().catch((error) => showMessage(String(error)));
  });
  document.querySelector("#checkUpdate")?.addEventListener("click", () => {
    void updateController
      .checkForUpdates({ manual: true })
      .catch((error) => showMessage(String(error?.message || error)));
  });
  document
    .querySelector("#activeTarget")
    ?.addEventListener("change", () => {
      void saveSettings()
        .then(() => refresh())
        .catch((error) => showMessage(String(error)));
    });
  for (const selector of ["#codexPath", "#proxy"]) {
    document.querySelector(selector)?.addEventListener("change", () => {
      void saveSettings().catch((error) => showMessage(String(error)));
    });
  }
  const opacitySlider = document.querySelector("#glassOpacity");
  const opacityValue = document.querySelector("#opacityValue");
  if (opacitySlider) {
    opacitySlider.addEventListener("input", (event) => {
      const val = Number(event.target.value) || 50;
      if (opacityValue) {
        opacityValue.textContent = `${val}%`;
      }
      applyGlassOpacity(val);
      void emit("taskbar:opacity", { opacity: val }).catch(() => {});
      void emitTo("taskbar-popup", "taskbar:opacity", { opacity: val }).catch(
        () => {},
      );
      void emitTo("taskbar", "taskbar:opacity", { opacity: val }).catch(
        () => {},
      );
    });
    opacitySlider.addEventListener(
      "change",
      () => void saveSettings().catch((error) => showMessage(String(error))),
    );
  }
  await listen("taskbar:ready", () => void publishTaskbar());
  await listen("taskbar:action", (event) => void handleTaskbarAction(event));
  updateController.scheduleUpdateChecks();
  await getCurrentQuota();
  refreshTimer = setInterval(() => void getCurrentQuota(), 5 * 60 * 1000);
  window.addEventListener("beforeunload", () => {
    clearInterval(refreshTimer);
    updateController.dispose();
  }, {
    once: true,
  });
}

start().catch((error) => showMessage(String(error?.message || error)));
