import {
  DATA_BAR_CONTENTS,
  DEFAULT_SETTINGS,
  LOG_LEVELS,
  METER_WINDOWS,
  THEMES,
} from "./constants.js";
import { createCustomSelectController } from "./custom-select.js";
import { createDialogFocusManager } from "./dialog-focus.js";
import { detectMacOS } from "./platform.js";
import { syncSettingsDraftFromSettings } from "./state.js";
import {
  normalizeDataBarContent,
  normalizeDataBars,
  normalizeInputValue,
  normalizeLogLevel,
  normalizeMeterWindow,
  normalizeTheme,
  resolveDataBars,
} from "./settings-model.js";

export function createSettingsController({
  els,
  state,
  service,
  render,
  renderLocale,
  persistSettings,
  normalizeError,
  readCurrentWindowPosition,
  mergeWindowPosition,
  setUpdateStatus,
  scheduleAutoRefresh,
  refreshQuota,
  scheduleUpdateChecks,
  logger,
  clearPanelClick,
  isMacOS = detectMacOS(),
}) {
  const customSelects = createCustomSelectController({
    shells: els.customSelectShells,
    onChange: handleCustomSelectChange,
  });
  const focusManager = createDialogFocusManager({
    dialog: els.settingsPanel,
    initialFocus: els.settingsCloseBtn,
    onEscape: closeSettingsPanel,
  });
  const selectOptionSignatures = new WeakMap();
  const customSelectHandlers = {
    themeSelect: selectSettingsTheme,
    localeSelect: selectSettingsLocale,
    meterWindowSelect: selectMeterWindow,
    dataBar1Select: (value) => selectDataBar(0, value),
    dataBar2Select: (value) => selectDataBar(1, value),
    dataBar3Select: (value) => selectDataBar(2, value),
    logLevelSelect: selectLogLevel,
  };
  const selectOptionConfigs = [
    {
      select: els.themeSelect,
      registry: THEMES,
      currentValue: () => normalizeTheme(state.settingsDraft.theme),
    },
    {
      select: els.meterWindowSelect,
      registry: METER_WINDOWS,
      currentValue: () => normalizeMeterWindow(state.settingsDraft.meterWindow),
    },
    ...els.dataBarSelects.map((select, index) => ({
      select,
      registry: DATA_BAR_CONTENTS,
      currentValue: () =>
        resolveDataBars(state.settingsDraft.dataBars, state.quota?.planType)[
          index
        ],
    })),
    {
      select: els.logLevelSelect,
      registry: LOG_LEVELS,
      currentValue: () => normalizeLogLevel(state.settingsDraft.logLevel),
    },
  ];

  function bindEvents() {
    focusManager.bindEvents();
    els.settingsBtn.addEventListener("click", openSettingsPanel);
    els.settingsCloseBtn.addEventListener("click", closeSettingsPanel);
    els.cancelSettingsBtn.addEventListener("click", closeSettingsPanel);
    els.saveSettingsBtn.addEventListener("click", saveSettings);
    els.chooseCodexBtn.addEventListener("click", chooseCodexPath);
    els.autoUpdateSwitch.addEventListener("change", syncAutoUpdateDraft);
    els.autoStartSwitch.addEventListener("change", syncAutoStartDraft);
    els.hideDockIconSwitch.addEventListener("change", syncHideDockIconDraft);
    els.tabBasicBtn?.addEventListener("click", () => switchTab("basic"));
    els.tabSourcesBtn?.addEventListener("click", () => switchTab("sources"));
    customSelects.bindEvents();
  }

  let activeTab = "basic";
  let editingSite = null;
  let editingKey = null;
  const testResults = new Map();

  function switchTab(tab) {
    activeTab = tab;
    editingSite = null;
    editingKey = null;
    if (els.tabBasicBtn) {
      els.tabBasicBtn.classList.toggle("active", activeTab === "basic");
      els.tabBasicBtn.setAttribute(
        "aria-selected",
        String(activeTab === "basic"),
      );
    }
    if (els.tabSourcesBtn) {
      els.tabSourcesBtn.classList.toggle("active", activeTab === "sources");
      els.tabSourcesBtn.setAttribute(
        "aria-selected",
        String(activeTab === "sources"),
      );
    }
    if (els.basicSettingsScroll) {
      els.basicSettingsScroll.hidden = activeTab !== "basic";
      els.basicSettingsScroll.style.display =
        activeTab === "basic" ? "grid" : "none";
    }
    if (els.sourcesSettingsScroll) {
      els.sourcesSettingsScroll.hidden = activeTab !== "sources";
      els.sourcesSettingsScroll.style.display =
        activeTab === "sources" ? "grid" : "none";
    }
    render();
  }

  function openSettingsPanel(tab = "basic") {
    clearPanelClick();
    syncSettingsDraftFromSettings(state);
    state.settingsOpen = true;
    switchTab(tab === "sources" ? "sources" : "basic");
    fillSettingsForm();
    render();
    focusManager.activate();
  }

  function closeSettingsPanel() {
    state.settingsOpen = false;
    editingSite = null;
    editingKey = null;
    syncSettingsDraftFromSettings(state);
    customSelects.close();
    render();
    focusManager.deactivate();
  }

  function fillSettingsForm() {
    els.codexPathInput.value = state.settingsDraft.codexCliPath || "";
    els.updateProxyInput.value = state.settingsDraft.updateProxy || "";
    els.refreshIntervalInput.value = String(
      state.settingsDraft.refreshIntervalMinutes ||
        DEFAULT_SETTINGS.refreshIntervalMinutes,
    );
    syncSettingsControls(renderLocale());
  }

  function renderSettingsPanel(text) {
    els.settingsPanel.hidden = !state.settingsOpen;
    if (!state.settingsOpen) return;

    renderSettingsLabels(text);
    renderSettingsSaveState(text);
    syncSettingsControls(renderLocale());
    renderSourcesTab(text);
  }

  function renderSettingsLabels(text) {
    els.settingsTitle.textContent = text.settings;
    if (els.tabBasicBtn)
      els.tabBasicBtn.textContent = text.tabBasic || "基础设置";
    if (els.tabSourcesBtn)
      els.tabSourcesBtn.textContent = text.tabSources || "中转站";
    els.codexPathLabel.textContent = text.codexPath;
    els.autoUpdateLabel.textContent = text.autoUpdate;
    els.autoUpdateHint.textContent = text.autoUpdateHint;
    els.autoStartLabel.textContent = text.autoStart;
    els.autoStartHint.textContent = text.autoStartHint;
    els.hideDockIconLabel.textContent = text.hideDockIcon;
    els.hideDockIconHint.textContent = text.hideDockIconHint;
    els.updateProxyLabel.textContent = text.updateProxy;
    els.updateProxyHint.textContent = text.updateProxyHint;
    els.refreshIntervalLabel.textContent = text.refreshInterval;
    els.themeLabel.textContent = text.theme;
    els.languageLabel.textContent = text.language;
    els.meterWindowLabel.textContent = text.meterWindow;
    els.dataBarLabels.forEach((label, index) => {
      label.textContent = text[`dataBar${index + 1}`];
    });
    els.logLevelLabel.textContent = text.logLevel;
    els.codexPathInput.placeholder = text.codexPathPlaceholder;
    els.updateProxyInput.placeholder = text.updateProxyPlaceholder;
    els.cancelSettingsBtn.textContent = text.cancel;
  }

  function renderSettingsSaveState(text) {
    els.saveSettingsText.textContent = state.savingSettings
      ? text.loading
      : text.save;
    els.saveSettingsBtn.disabled = state.savingSettings;
    els.settingsError.textContent = state.errors.settings;
    els.settingsError.hidden = !state.errors.settings;
  }

  function syncSettingsControls(locale) {
    els.autoUpdateSwitch.checked = Boolean(
      state.settingsDraft.autoUpdateEnabled,
    );
    els.autoStartSwitch.checked = Boolean(state.settingsDraft.autoStartEnabled);
    els.hideDockIconSwitch.checked = Boolean(state.settingsDraft.hideDockIcon);
    els.hideDockIconRow.hidden = !isMacOS;
    els.hideDockIconSwitch.disabled = !isMacOS;
    renderSelectOptionGroups(locale);
    els.localeSelect.value = state.settingsDraft.locale === "en" ? "en" : "zh";
    customSelects.sync();
  }

  function handleCustomSelectChange(selectId, value) {
    customSelectHandlers[selectId]?.(value);
  }

  function syncAutoUpdateDraft() {
    state.settingsDraft.autoUpdateEnabled = els.autoUpdateSwitch.checked;
    render();
  }

  function syncAutoStartDraft() {
    state.settingsDraft.autoStartEnabled = els.autoStartSwitch.checked;
    render();
  }

  function syncHideDockIconDraft() {
    state.settingsDraft.hideDockIcon = els.hideDockIconSwitch.checked;
    render();
  }

  function selectSettingsLocale(locale) {
    state.settingsDraft.locale = locale === "en" ? "en" : "zh";
    render();
  }

  function selectSettingsTheme(theme) {
    state.settingsDraft.theme = normalizeTheme(theme);
    render();
  }

  function selectLogLevel(logLevel) {
    state.settingsDraft.logLevel = normalizeLogLevel(logLevel);
    render();
  }

  function selectMeterWindow(meterWindow) {
    state.settingsDraft.meterWindow = normalizeMeterWindow(meterWindow);
    render();
  }

  function selectDataBar(index, content) {
    const normalized = normalizeDataBarContent(content);
    if (!normalized) return;
    // 首次修改时固化当前套餐布局，之后只按用户明确选择保存。
    const dataBars = resolveDataBars(
      state.settingsDraft.dataBars,
      state.quota?.planType,
    );
    dataBars[index] = normalized;
    state.settingsDraft.dataBars = dataBars;
    render();
  }

  async function chooseCodexPath() {
    if (!service.isAvailable()) return;

    try {
      const selected = await service.dialog.chooseCodexPath();
      if (typeof selected === "string") {
        els.codexPathInput.value = selected;
        state.settingsDraft.codexCliPath = selected;
      }
    } catch (error) {
      logger.error("选择 Codex CLI 路径失败", error, "frontend.settings");
      state.errors.settings = normalizeError(error);
      render();
    }
  }

  async function saveSettings() {
    if (state.savingSettings) return;

    state.savingSettings = true;
    render();

    try {
      const draftSettings = collectSettingsDraft();
      const currentPosition = await readCurrentWindowPosition();
      await persistSettings(
        (currentSettings) =>
          mergeWindowPosition(
            {
              ...currentSettings,
              ...draftSettings,
              // 位置字段只由本次读取结果覆盖，保留队列中刚写入的另一种窗口位置。
              panelPosition: currentSettings.panelPosition,
              ballPosition: currentSettings.ballPosition,
              ballDock: currentSettings.ballDock,
            },
            currentPosition,
          ),
        { syncDraft: false },
      );
      state.settingsOpen = false;
      state.errors.settings = "";
      setUpdateStatus({ type: "saved" });
      scheduleAutoRefresh();
      refreshQuota();
      scheduleUpdateChecks();
      focusManager.deactivate();
    } catch (error) {
      logger.error("保存设置失败", error, "frontend.settings");
      state.errors.settings = normalizeError(error);
    } finally {
      state.savingSettings = false;
      render();
    }
  }

  function collectSettingsDraft() {
    const refreshIntervalMinutes = Number.parseInt(
      els.refreshIntervalInput.value,
      10,
    );
    return {
      codexCliPath: normalizeInputValue(els.codexPathInput.value),
      updateProxy: normalizeInputValue(els.updateProxyInput.value),
      refreshIntervalMinutes: Number.isFinite(refreshIntervalMinutes)
        ? refreshIntervalMinutes
        : DEFAULT_SETTINGS.refreshIntervalMinutes,
      locale: els.localeSelect.value === "en" ? "en" : "zh",
      theme: normalizeTheme(els.themeSelect.value),
      meterWindow: normalizeMeterWindow(els.meterWindowSelect.value),
      dataBars: normalizeDataBars(state.settingsDraft.dataBars),
      logLevel: normalizeLogLevel(els.logLevelSelect.value),
      autoUpdateEnabled: els.autoUpdateSwitch.checked,
      autoStartEnabled: els.autoStartSwitch.checked,
      hideDockIcon: els.hideDockIconSwitch.checked,
      onboardingSeen: state.settings.onboardingSeen,
      widgetMode: state.widgetMode,
      panelPosition: state.settings.panelPosition,
      ballPosition: state.settings.ballPosition,
      ballDock: state.settings.ballDock,
      sites: state.settingsDraft.sites || [],
      activeTarget: state.settingsDraft.activeTarget || { type: "official" },
    };
  }

  function maskKey(key) {
    if (!key || key.length <= 8) return "******";
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  function renderSourcesTab(text) {
    if (!els.sourcesContainer) return;
    els.sourcesContainer.replaceChildren();

    if (activeTab !== "sources") return;

    if (editingSite) {
      renderSiteForm(text);
      return;
    }

    if (editingKey) {
      renderKeyForm(text);
      return;
    }

    const sites = state.settingsDraft.sites || [];

    const officialItem = document.createElement("div");
    officialItem.className = "key-item";
    const isOfficialActive =
      !state.settingsDraft.activeTarget ||
      state.settingsDraft.activeTarget.type === "official";
    const officialInfo = document.createElement("div");
    officialInfo.className = "key-item-info";
    const officialName = document.createElement("span");
    officialName.className = "key-item-name";
    officialName.textContent = text.officialSource || "官方 Codex CLI";
    officialInfo.append(officialName);

    if (isOfficialActive) {
      const activeTag = document.createElement("span");
      activeTag.style.color = "#34d399";
      activeTag.style.fontWeight = "600";
      activeTag.textContent = "(当前激活)";
      officialInfo.append(activeTag);
    }
    officialItem.append(officialInfo);

    const officialActions = document.createElement("div");
    officialActions.className = "key-item-actions";

    if (!isOfficialActive) {
      const useOfficialBtn = document.createElement("button");
      useOfficialBtn.type = "button";
      useOfficialBtn.className = "mini-btn";
      useOfficialBtn.style.color = "#34d399";
      useOfficialBtn.style.borderColor = "rgba(52, 211, 153, 0.4)";
      useOfficialBtn.textContent = text.activate || "使用";
      useOfficialBtn.addEventListener("click", () => {
        state.settingsDraft.activeTarget = { type: "official" };
        render();
      });
      officialActions.append(useOfficialBtn);
    }
    officialItem.append(officialActions);
    els.sourcesContainer.append(officialItem);

    if (sites.length === 0) {
      const emptyHint = document.createElement("div");
      emptyHint.className = "site-card-url";
      emptyHint.style.textAlign = "center";
      emptyHint.style.padding = "10px 0";
      emptyHint.textContent =
        text.noSitesHint || "尚未添加中转站点，点击下方按钮添加";
      els.sourcesContainer.append(emptyHint);
    } else {
      sites.forEach((site) => {
        els.sourcesContainer.append(renderSiteCard(site, text));
      });
    }

    const addSiteBtn = document.createElement("button");
    addSiteBtn.type = "button";
    addSiteBtn.className = "add-block-btn";
    addSiteBtn.textContent = `+ ${text.addSite || "添加中转站点"}`;
    addSiteBtn.addEventListener("click", () => {
      editingSite = { id: `site_${Date.now()}`, name: "", baseUrl: "https://" };
      render();
    });
    els.sourcesContainer.append(addSiteBtn);
  }

  function renderSiteCard(site, text) {
    const card = document.createElement("div");
    card.className = "site-card";

    const header = document.createElement("div");
    header.className = "site-card-header";

    const titleBox = document.createElement("div");
    titleBox.className = "site-card-title";
    const nameEl = document.createElement("span");
    nameEl.className = "site-card-name";
    nameEl.textContent = site.name || "未命名站点";
    const urlEl = document.createElement("span");
    urlEl.className = "site-card-url";
    urlEl.textContent = site.baseUrl;
    titleBox.append(nameEl, urlEl);

    const actions = document.createElement("div");
    actions.className = "site-card-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "mini-btn";
    editBtn.textContent = text.editSite || "编辑";
    editBtn.addEventListener("click", () => {
      editingSite = { ...site };
      render();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "mini-btn danger";
    deleteBtn.textContent = text.deleteSite || "删除";
    deleteBtn.addEventListener("click", () => {
      if (window.confirm(text.confirmDeleteSite || "确定删除该站点吗？")) {
        state.settingsDraft.sites = state.settingsDraft.sites.filter(
          (s) => s.id !== site.id,
        );
        render();
      }
    });

    actions.append(editBtn, deleteBtn);
    header.append(titleBox, actions);
    card.append(header);

    const keysList = document.createElement("div");
    keysList.className = "site-keys-list";

    (site.keys || []).forEach((key) => {
      const keyItem = document.createElement("div");
      keyItem.className = "key-item";

      const isKeyActive =
        state.settingsDraft.activeTarget?.type === "siteKey" &&
        state.settingsDraft.activeTarget.siteId === site.id &&
        state.settingsDraft.activeTarget.keyId === key.id;

      const info = document.createElement("div");
      info.className = "key-item-info";
      const kName = document.createElement("span");
      kName.className = "key-item-name";
      kName.textContent = key.name || "默认Key";
      const kMask = document.createElement("span");
      kMask.className = "key-item-mask";
      kMask.textContent = maskKey(key.key);
      info.append(kName, kMask);

      if (isKeyActive) {
        const activeTag = document.createElement("span");
        activeTag.style.color = "#34d399";
        activeTag.style.fontWeight = "600";
        activeTag.textContent = "(当前)";
        info.append(activeTag);
      }

      const keyActions = document.createElement("div");
      keyActions.className = "key-item-actions";

      let useBtn = null;
      if (!isKeyActive) {
        useBtn = document.createElement("button");
        useBtn.type = "button";
        useBtn.className = "mini-btn";
        useBtn.style.color = "#34d399";
        useBtn.style.borderColor = "rgba(52, 211, 153, 0.4)";
        useBtn.textContent = text.activate || "使用";
        useBtn.addEventListener("click", () => {
          state.settingsDraft.activeTarget = {
            type: "siteKey",
            siteId: site.id,
            keyId: key.id,
          };
          render();
        });
      }

      const testBtn = document.createElement("button");
      testBtn.type = "button";
      testBtn.className = "mini-btn";
      const testState = testResults.get(key.id);
      testBtn.textContent = testState?.loading
        ? text.testingConnection || "测试中..."
        : text.testConnection || "测试连接";
      testBtn.disabled = Boolean(testState?.loading);
      testBtn.addEventListener("click", async () => {
        testResults.set(key.id, { loading: true });
        render();
        try {
          const res = await service.commands.testSub2apiConnection(
            site.baseUrl,
            key.key,
          );
          testResults.set(key.id, {
            loading: false,
            success: true,
            message: res.message,
          });
        } catch (err) {
          testResults.set(key.id, {
            loading: false,
            success: false,
            message: normalizeError(err),
          });
        }
        render();
      });

      const editKeyBtn = document.createElement("button");
      editKeyBtn.type = "button";
      editKeyBtn.className = "mini-btn";
      editKeyBtn.textContent = text.editKey || "编辑";
      editKeyBtn.addEventListener("click", () => {
        editingKey = { siteId: site.id, ...key };
        render();
      });

      const delKeyBtn = document.createElement("button");
      delKeyBtn.type = "button";
      delKeyBtn.className = "mini-btn danger";
      delKeyBtn.textContent = text.deleteKey || "删除";
      delKeyBtn.addEventListener("click", () => {
        if (window.confirm(text.confirmDeleteKey || "确定删除该 Key 吗？")) {
          site.keys = (site.keys || []).filter((k) => k.id !== key.id);
          render();
        }
      });

      keyActions.append(testBtn, editKeyBtn, delKeyBtn);
      if (useBtn) {
        keyActions.append(useBtn);
      }
      keyItem.append(info, keyActions);
      keysList.append(keyItem);

      if (testState && !testState.loading && testState.message) {
        const feedback = document.createElement("div");
        feedback.className = `test-feedback ${testState.success ? "success" : "error"}`;
        feedback.textContent = testState.message;
        keysList.append(feedback);
      }
    });

    const addKeyBtn = document.createElement("button");
    addKeyBtn.type = "button";
    addKeyBtn.className = "mini-btn";
    addKeyBtn.style.marginTop = "4px";
    addKeyBtn.style.alignSelf = "flex-start";
    addKeyBtn.textContent = `+ ${text.addKey || "添加 Key"}`;
    addKeyBtn.addEventListener("click", () => {
      editingKey = {
        siteId: site.id,
        id: `key_${Date.now()}`,
        name: "",
        key: "",
      };
      render();
    });
    keysList.append(addKeyBtn);

    card.append(keysList);
    return card;
  }

  function renderSiteForm(text) {
    const form = document.createElement("div");
    form.className = "source-inline-form";

    const title = document.createElement("strong");
    title.style.fontSize = "12px";
    title.style.color = "#fff";
    title.textContent =
      editingSite.id &&
      state.settingsDraft.sites?.some((s) => s.id === editingSite.id)
        ? text.editSite || "编辑站点"
        : text.addSite || "添加中转站点";

    const nameInput = document.createElement("input");
    nameInput.className = "settings-input";
    nameInput.placeholder = text.siteName || "站点名称 (如: fcodex 中转站)";
    nameInput.value = editingSite.name || "";

    const urlInput = document.createElement("input");
    urlInput.className = "settings-input";
    urlInput.placeholder =
      text.siteBaseUrl || "Base URL (如: https://fcodex.top/v1)";
    urlInput.value = editingSite.baseUrl || "https://";

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.justifyContent = "flex-end";
    btnRow.style.gap = "6px";
    btnRow.style.marginTop = "4px";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "secondary-button";
    cancelBtn.style.padding = "4px 10px";
    cancelBtn.textContent = text.cancel || "取消";
    cancelBtn.addEventListener("click", () => {
      editingSite = null;
      render();
    });

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "primary-button";
    saveBtn.style.padding = "4px 12px";
    saveBtn.textContent = text.save || "保存";
    saveBtn.addEventListener("click", () => {
      const name = nameInput.value.trim();
      const baseUrl = urlInput.value.trim();
      if (!baseUrl || baseUrl === "https://") return;

      const sites = state.settingsDraft.sites
        ? [...state.settingsDraft.sites]
        : [];
      const existingIndex = sites.findIndex((s) => s.id === editingSite.id);
      if (existingIndex >= 0) {
        sites[existingIndex] = { ...sites[existingIndex], name, baseUrl };
      } else {
        sites.push({
          id: editingSite.id || `site_${Date.now()}`,
          name: name || "中转站",
          baseUrl,
          keys: [],
        });
      }
      state.settingsDraft.sites = sites;
      editingSite = null;
      render();
    });

    btnRow.append(cancelBtn, saveBtn);
    form.append(title, nameInput, urlInput, btnRow);
    els.sourcesContainer.append(form);
  }

  function renderKeyForm(text) {
    const form = document.createElement("div");
    form.className = "source-inline-form";

    const site = state.settingsDraft.sites?.find(
      (s) => s.id === editingKey.siteId,
    );

    const title = document.createElement("strong");
    title.style.fontSize = "12px";
    title.style.color = "#fff";
    title.textContent = `${text.addKey || "添加 Key"} (${site?.name || "未知站点"})`;

    const nameInput = document.createElement("input");
    nameInput.className = "settings-input";
    nameInput.placeholder = text.keyName || "备注名称 (如: 公司、个人自用)";
    nameInput.value = editingKey.name || "";

    const keyInput = document.createElement("input");
    keyInput.className = "settings-input";
    keyInput.placeholder = text.apiKey || "API Key (sk-...)";
    keyInput.value = editingKey.key || "";

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.justifyContent = "flex-end";
    btnRow.style.gap = "6px";
    btnRow.style.marginTop = "4px";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "secondary-button";
    cancelBtn.style.padding = "4px 10px";
    cancelBtn.textContent = text.cancel || "取消";
    cancelBtn.addEventListener("click", () => {
      editingKey = null;
      render();
    });

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "primary-button";
    saveBtn.style.padding = "4px 12px";
    saveBtn.textContent = text.save || "保存";
    saveBtn.addEventListener("click", () => {
      const name = nameInput.value.trim();
      const key = keyInput.value.trim();
      if (!key) return;

      if (site) {
        site.keys = site.keys || [];
        const existingIndex = site.keys.findIndex(
          (k) => k.id === editingKey.id,
        );
        if (existingIndex >= 0) {
          site.keys[existingIndex] = { ...site.keys[existingIndex], name, key };
        } else {
          site.keys.push({
            id: editingKey.id || `key_${Date.now()}`,
            name: name || "Key",
            key,
          });
        }
      }
      editingKey = null;
      render();
    });

    btnRow.append(cancelBtn, saveBtn);
    form.append(title, nameInput, keyInput, btnRow);
    els.sourcesContainer.append(form);
  }

  function renderSelectOptionGroups(locale) {
    selectOptionConfigs.forEach(({ select, registry, currentValue }) => {
      renderSelectOptions(select, registry, currentValue(), locale);
    });
  }

  function renderSelectOptions(select, registry, currentValue, locale) {
    const items = Object.entries(registry).map(([value, item]) => ({
      value,
      label: item.label[locale] || item.label.zh,
    }));
    const signature = items
      .map((item) => `${item.value}:${item.label}`)
      .join("|");

    if (selectOptionSignatures.get(select) !== signature) {
      const options = items.map((item) => {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        return option;
      });
      select.replaceChildren(...options);
      selectOptionSignatures.set(select, signature);
    }

    select.value = currentValue;
  }

  return {
    bindEvents,
    closeSettingsPanel,
    openSettingsPanel,
    renderSettingsPanel,
  };
}
