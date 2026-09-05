import { APP_VERSION_LABEL, i18n, WIDGET_MODES } from "./constants.js";
import {
  formatResetCreditExpiries,
  formatResetCredits,
  formatQuotaEstimateTooltip,
  formatQuotaEstimateUsd,
  formatDateTimeOrPlaceholder,
  formatWindowLabel,
  getVisualState,
  selectedMeterWindow,
  stateLabel,
  statusLabel,
} from "./formatters.js";
import {
  removeAttribute,
  setAttribute,
  setDatasetValue,
  setText,
} from "./dom-utils.js";
import { clamp } from "./geometry.js";
import { createActionIcon, updateActionButton } from "./icons.js";
import { resolveDataBars } from "./settings-model.js";
import { formatUpdateStatus } from "./update-status.js";
import { activeError } from "./state.js";
import { createMeterController } from "../components/meters/meter-controller.js";

export function createRenderer({
  els,
  state,
  getLocale,
  getTheme,
  onVersionClick,
  settingsView,
  sourcePickerView,
}) {
  const brandView = createBrandView();
  const meterController = createMeterController(els.meterHost);
  const dataBarViews = els.dataBarCards.map((card) =>
    createDataBarView(card, state),
  );

  function render() {
    const context = createRenderContext();

    renderDocumentState(context);
    renderHeader(context);
    sourcePickerView?.updatePickerLabel();
    renderActions(context);
    renderStatus(context);
    renderMeter(context);
    renderDockBar(context);
    renderQuotaCards(context);
    settingsView.renderSettingsPanel(context.text);
  }

  function createRenderContext() {
    const activeLocale = getLocale();
    const activeTheme = getTheme();
    const text = i18n[activeLocale];
    const quota = state.quota;
    const hasQuota = Boolean(quota);
    // 设置面板内即时预览；关闭或取消后重新使用已提交配置。
    const activeSettings = state.settingsOpen
      ? state.settingsDraft
      : state.settings;
    const meterWindowData = selectedMeterWindow(
      quota,
      activeSettings.meterWindow,
    );
    const dataBars = resolveDataBars(activeSettings.dataBars, quota?.planType);
    const remaining =
      typeof meterWindowData?.remainingPercent === "number"
        ? meterWindowData.remainingPercent
        : null;
    const remainingValue = remaining === null ? 0 : clamp(remaining, 0, 100);
    const visualState = getVisualState(remaining);
    const error = activeError(state);
    const isInitialQuotaLoading = state.loading && !hasQuota;
    const mainState =
      error && !hasQuota ? "error" : state.loading ? "loading" : visualState;
    const updateStatusText = formatUpdateStatus(text, state.updateStatus);

    return {
      activeLocale,
      activeTheme,
      activeSettings,
      text,
      quota,
      dataBars,
      hasQuota,
      remaining,
      remainingValue,
      visualState,
      error,
      isInitialQuotaLoading,
      mainState,
      updateStatusText,
    };
  }

  function renderDocumentState({
    activeLocale,
    activeTheme,
    activeSettings,
    mainState,
  }) {
    document.documentElement.lang = activeLocale === "zh" ? "zh-CN" : "en";
    setDatasetValue(els.body, "state", mainState);
    setDatasetValue(els.body, "widgetMode", state.widgetMode);
    setDatasetValue(els.body, "ballDock", state.ballDock || "none");
    setDatasetValue(els.body, "ballSize", state.settings.ballSize || "small");
    setDatasetValue(
      els.body,
      "ballSnapStyle",
      activeSettings.ballSnapStyle || "ball",
    );
    setDatasetValue(els.body, "theme", activeTheme);
    setDatasetValue(
      els.body,
      "settingsOpen",
      state.settingsOpen ? "true" : "false",
    );
  }

  function renderHeader({ text }) {
    renderWidgetHint(text);
    renderBrandName(text);
  }

  function renderActions({ text }) {
    updateActionButton(
      els.modeBtn,
      "circle-dot",
      text.ballMode,
      state.widgetMode === WIDGET_MODES.BALL,
    );
    updateActionButton(els.settingsBtn, "settings", text.settings);
    updateActionButton(
      els.pinBtn,
      state.alwaysOnTop ? "pin" : "pin-off",
      state.alwaysOnTop ? text.unpin : text.pin,
      state.alwaysOnTop,
    );
    updateActionButton(els.refreshBtn, "refresh-cw", text.refresh);
    if (els.themeSwitchBtn) {
      updateActionButton(
        els.themeSwitchBtn,
        "palette",
        text.themeSwitch || "切换主题",
      );
    }
    if (els.minimizeBtn) {
      updateActionButton(els.minimizeBtn, "minus", text.hide);
    }
    updateActionButton(els.closeBtn, "x", text.hideToTray || text.hide);
    updateActionButton(els.settingsCloseBtn, "x", text.close);
    updateActionButton(els.chooseCodexBtn, "folder-open", text.chooseCodex);
  }

  function renderStatus({
    activeLocale,
    error,
    hasQuota,
    mainState,
    quota,
    text,
    updateStatusText,
    visualState,
  }) {
    setClassName(els.trafficLight, `traffic-light ${mainState}`);
    setClassName(els.statusDot, `status-dot ${error ? "error" : mainState}`);

    if (error) {
      setText(
        els.stateText,
        hasQuota ? stateLabel(visualState, text) : text.error,
      );
      setText(els.statusText, error);
    } else if (state.loading) {
      setText(els.stateText, text.loading);
      setText(els.statusText, text.reading);
    } else if (updateStatusText) {
      setText(els.stateText, stateLabel(visualState, text));
      setText(els.statusText, updateStatusText);
    } else {
      setText(els.stateText, stateLabel(visualState, text));
      setText(els.statusText, statusLabel(quota, text, activeLocale));
    }
    setTooltip(els.statusText, els.statusText.textContent);
  }

  function renderMeter({
    activeTheme,
    remaining,
    remainingValue,
    text,
    visualState,
  }) {
    meterController.update({
      theme: activeTheme,
      percent: remaining,
      angle: remainingValue * 3.6,
      level: visualState,
      label: text.remaining,
      mode: state.widgetMode,
      dock: state.ballDock || "none",
      ballSize: state.settings.ballSize || "small",
    });
  }

  function renderDockBar({ remainingValue, remaining, text, visualState }) {
    if (!els.dockBarHost || !els.dockBarFill) return;

    const percent = Math.round(remainingValue);
    els.dockBarFill.style.height = `${percent}%`;
    const label =
      remaining !== null ? `${percent}% ${text.remaining}` : text.loading;
    els.dockBarHost.setAttribute("data-tooltip", label);
    els.dockBarHost.setAttribute("aria-label", label);
    setDatasetValue(els.dockBarHost, "level", visualState);
  }

  let isSub2apiMode = false;
  let sub2apiElements = null;

  function renderQuotaCards(context) {
    if (context.quota?.credits?.type === "sub2api") {
      isSub2apiMode = true;
      renderSub2apiCards(context);
      return;
    }

    if (isSub2apiMode) {
      isSub2apiMode = false;
      sub2apiElements = null;
      dataBarViews.forEach((view) => view.reset());
    }

    dataBarViews.forEach((view, index) =>
      view.render(context.dataBars[index], context),
    );
  }

  function renderSub2apiCards({ activeLocale, quota, text }) {
    const cred = quota?.credits || {};

    if (!sub2apiElements) {
      sub2apiElements = [
        buildStandardCard(els.dataBarCards[0], "todayCost", "clock-3"),
        buildStandardCard(els.dataBarCards[1], "cycleQuota", "wallet-cards"),
        buildStandardCard(els.dataBarCards[2], "cycleWindow", "calendar-days"),
      ];
      els.dataBarCards.forEach((card) => {
        card.classList.remove("estimate-card");
        removeTooltip(card);
      });
    }

    // 第 1 栏：今日消耗
    const el0 = sub2apiElements[0];
    setText(el0.label, activeLocale === "zh" ? "今日消耗" : "Today Usage");
    setText(el0.subLabel, activeLocale === "zh" ? "状态: " : "Status: ");
    setText(el0.subValue, cred.status || "active");
    setText(
      el0.value,
      typeof cred.todayCost === "number"
        ? `$${cred.todayCost.toFixed(2)}`
        : "--",
    );
    const tip0 = `${activeLocale === "zh" ? "今日消耗" : "Today"}: $${Number(cred.todayCost || 0).toFixed(2)}`;
    setTooltip(els.dataBarCards[0], tip0);

    // 第 2 栏：周期额度
    const el1 = sub2apiElements[1];
    const limitNum = typeof cred.limit === "number" ? cred.limit : null;
    let limitStr = "";
    if (limitNum !== null) {
      limitStr =
        limitNum % 1 === 0
          ? `$${limitNum.toFixed(0)}`
          : `$${limitNum.toFixed(2)}`;
    }
    const title =
      activeLocale === "zh"
        ? limitStr
          ? `周期额度 (${limitStr})`
          : "周期额度"
        : limitStr
          ? `Cycle Quota (${limitStr})`
          : "Cycle Quota";
    setText(el1.label, title);
    setText(el1.subLabel, activeLocale === "zh" ? "已用: " : "Used: ");
    setText(
      el1.subValue,
      typeof cred.used === "number" ? `$${Number(cred.used).toFixed(2)}` : "--",
    );
    setText(
      el1.value,
      typeof cred.remaining === "number"
        ? `$${Number(cred.remaining).toFixed(2)}`
        : "--",
    );
    const tip1 = `总限额: $${cred.limit ?? 0}；已用: $${Number(cred.used || 0).toFixed(2)}；剩余: $${Number(cred.remaining || 0).toFixed(2)}`;
    setTooltip(els.dataBarCards[1], tip1);

    // 第 3 栏：周窗口
    const el2 = sub2apiElements[2];
    setText(
      el2.label,
      formatWindowLabel(
        quota.secondary?.windowDurationMins || 10080,
        activeLocale === "zh" ? "周窗口" : "7d window",
        text,
        activeLocale,
      ),
    );
    setText(
      el2.subLabel,
      text.secondaryResetLabel ||
        (activeLocale === "zh" ? "重置时间: " : "Resets: "),
    );
    setText(
      el2.subValue,
      formatDateTimeOrPlaceholder(quota.secondary?.resetsAt, activeLocale),
    );
    const percent = quota.secondary?.remainingPercent;
    setText(el2.value, typeof percent === "number" ? `${percent}%` : "--");
    const tip2 = `${activeLocale === "zh" ? "重置时间" : "Resets"}: ${formatDateTimeOrPlaceholder(quota.secondary?.resetsAt, activeLocale)}`;
    setTooltip(els.dataBarCards[2], tip2);
  }

  function renderBrandName(text) {
    setText(brandView.title, text.brandName);
    setAttribute(
      els.brandName,
      "aria-label",
      APP_VERSION_LABEL
        ? `${text.brandName} ${APP_VERSION_LABEL}`
        : text.brandName,
    );
    if (!brandView.versionButton) return;

    setTooltip(brandView.versionButton, text.checkUpdate);
    removeAttribute(brandView.versionButton, "title");
    setAttribute(
      brandView.versionButton,
      "aria-label",
      `${text.checkUpdate} ${APP_VERSION_LABEL}`,
    );
  }

  function renderWidgetHint(text) {
    if (state.widgetMode === WIDGET_MODES.BALL) {
      removeTooltip(els.widget);
      removeAttribute(els.widget, "title");
      setAttribute(els.widget, "aria-label", text?.ballMode || "悬浮球");
      setAttribute(els.widget, "role", "button");
      setAttribute(els.widget, "tabindex", "0");
      return;
    }

    removeTooltip(els.widget);
    removeAttribute(els.widget, "title");
    removeAttribute(els.widget, "aria-label");
    removeAttribute(els.widget, "role");
    removeAttribute(els.widget, "tabindex");
  }

  function createBrandView() {
    const title = document.createElement("span");
    title.className = "brand-title";

    if (!APP_VERSION_LABEL) {
      els.brandName.replaceChildren(title);
      return { title, versionButton: null };
    }

    const versionButton = document.createElement("button");
    versionButton.id = "versionBtn";
    versionButton.type = "button";
    versionButton.className = "version-badge";
    versionButton.textContent = APP_VERSION_LABEL;
    versionButton.setAttribute("data-no-drag", "");
    versionButton.addEventListener("click", onVersionClick);
    els.brandName.replaceChildren(title, versionButton);
    return { title, versionButton };
  }

  return { render };
}

function createDataBarView(card, state) {
  let activeContent = null;
  let elements = null;

  function render(
    content,
    { activeLocale, isInitialQuotaLoading, quota, text },
  ) {
    if (activeContent !== content) {
      activeContent = content;
      elements = buildDataBar(card, content);
    }

    if (content === "fiveHour") {
      renderWindowData(
        elements,
        quota?.primary,
        text.primaryFallback,
        text.primaryResetInlineLabel,
        text,
        activeLocale,
      );
      return;
    }
    if (content === "weekly") {
      renderWindowData(
        elements,
        quota?.secondary,
        text.secondaryFallback,
        text.secondaryResetLabel,
        text,
        activeLocale,
      );
      return;
    }
    if (content === "resetCredits") {
      setText(elements.label, text.plan);
      setText(elements.subLabel, text.resetCreditExpiryPrefix);
      setText(
        elements.subValue,
        formatResetCreditExpiries(
          state.resetCreditExpiries,
          state.resetCreditExpiriesStatus,
        ),
      );
      setText(
        elements.value,
        formatResetCredits(quota?.resetCredits?.availableCount),
      );
      return;
    }

    renderEstimateData(
      card,
      elements,
      quota?.quotaEstimate,
      text,
      activeLocale,
      isInitialQuotaLoading,
      quota,
    );
  }

  function reset() {
    activeContent = null;
    elements = null;
  }

  return { render, reset };
}

function buildDataBar(card, content) {
  const isEstimate = content === "quotaEstimate";
  card.classList.toggle("estimate-card", isEstimate);
  card.dataset.content = content;

  if (isEstimate) {
    setAttribute(card, "role", "group");
    setAttribute(card, "tabindex", "0");
    return buildEstimateCard(card);
  }

  removeTooltip(card);
  removeAttribute(card, "title");
  removeAttribute(card, "aria-label");
  removeAttribute(card, "role");
  removeAttribute(card, "tabindex");
  return content === "resetCredits"
    ? buildStandardCard(card, content, "reset-credit")
    : buildStandardCard(
        card,
        content,
        content === "fiveHour" ? "clock-3" : "calendar-days",
      );
}

function buildStandardCard(card, content, iconName) {
  const icon = createQuotaIcon(content, iconName);
  const copy = document.createElement("span");
  const label = document.createElement("span");
  const subtext = document.createElement("small");
  const subLabel = document.createElement("span");
  const subValue = document.createElement("span");
  const value = document.createElement("strong");

  copy.className = "quota-copy";
  subtext.className = "quota-subtext";
  subLabel.className = "quota-sub-label";
  subValue.className = "quota-sub-value";
  subtext.append(subLabel, subValue);
  copy.append(label, subtext);
  card.replaceChildren(icon, copy, value);
  return { label, subLabel, subValue, value };
}

function buildEstimateCard(card) {
  const icon = createQuotaIcon("quotaEstimate", "wallet-cards");
  const label = document.createElement("span");
  const previous = createEstimatePeriod();
  const current = createEstimatePeriod();

  label.className = "estimate-title";
  card.replaceChildren(
    icon,
    label,
    createEstimateDivider(),
    previous.root,
    createEstimateDivider(),
    current.root,
  );
  return {
    label,
    previousLabel: previous.label,
    previousValue: previous.value,
    currentLabel: current.label,
    currentValue: current.value,
  };
}

function createQuotaIcon(content, iconName) {
  const icon = document.createElement("span");
  icon.className = "quota-icon";
  icon.dataset.quotaIcon = content;
  icon.setAttribute("aria-hidden", "true");
  icon.appendChild(createActionIcon(iconName));
  return icon;
}

function createEstimatePeriod() {
  const root = document.createElement("span");
  const label = document.createElement("small");
  const value = document.createElement("strong");
  root.className = "estimate-period";
  value.className = "estimate-value";
  root.append(label, value);
  return { root, label, value };
}

function createEstimateDivider() {
  const divider = document.createElement("span");
  divider.className = "estimate-divider";
  divider.setAttribute("aria-hidden", "true");
  return divider;
}

function renderWindowData(
  elements,
  windowData,
  fallbackLabel,
  resetLabel,
  text,
  locale,
) {
  renderWindow(
    windowData,
    elements.label,
    elements.value,
    fallbackLabel,
    text,
    locale,
  );
  setText(elements.subLabel, resetLabel);
  setText(
    elements.subValue,
    formatDateTimeOrPlaceholder(windowData?.resetsAt, locale),
  );
}

function renderEstimateData(
  card,
  elements,
  estimate,
  text,
  locale,
  isInitialQuotaLoading,
  quota,
) {
  if (quota?.credits?.type === "sub2api") {
    const cred = quota.credits;
    setText(elements.label, locale === "zh" ? "额度 / 消耗" : "Quota / Usage");
    setText(elements.previousLabel, locale === "zh" ? "今日" : "Today");
    setText(elements.currentLabel, locale === "zh" ? "剩余" : "Remaining");
    setText(
      elements.previousValue,
      typeof cred.todayCost === "number"
        ? `$${cred.todayCost.toFixed(2)}`
        : "--",
    );
    setText(
      elements.currentValue,
      typeof cred.remaining === "number"
        ? `$${cred.remaining.toFixed(2)}`
        : "--",
    );
    const tooltip = `限额: $${cred.limit || 0}；已用: $${cred.used || 0}；剩余: $${cred.remaining || 0}`;
    setTooltip(card, tooltip);
    setAttribute(card, "aria-label", tooltip);
    return;
  }

  setText(elements.label, text.estimateTitle);
  setText(elements.previousLabel, text.estimatePrevious);
  setText(elements.currentLabel, text.estimateCurrent);
  setText(
    elements.previousValue,
    formatQuotaEstimateUsd(estimate?.previous, locale),
  );
  setText(
    elements.currentValue,
    formatQuotaEstimateUsd(estimate?.current, locale),
  );
  const tooltip = formatQuotaEstimateTooltip(estimate, text, locale, {
    loading: isInitialQuotaLoading,
  });
  setTooltip(card, tooltip);
  setAttribute(card, "aria-label", tooltip);
}

function renderWindow(
  windowData,
  labelEl,
  valueEl,
  fallbackLabel,
  text,
  locale,
) {
  setText(
    labelEl,
    formatWindowLabel(
      windowData?.windowDurationMins,
      fallbackLabel,
      text,
      locale,
    ),
  );
  if (!windowData || typeof windowData.remainingPercent !== "number") {
    setText(valueEl, "--");
    return;
  }
  setText(valueEl, `${windowData.remainingPercent}%`);
}

function setClassName(element, value) {
  if (element.className !== value) {
    element.className = value;
  }
}

function setTooltip(element, value) {
  const nextValue = value?.trim() || "";
  if (!nextValue) {
    removeTooltip(element);
    return;
  }
  if (element.dataset.tooltip !== nextValue) {
    element.dataset.tooltip = nextValue;
  }
}

function removeTooltip(element) {
  if (element.dataset.tooltip !== undefined) {
    delete element.dataset.tooltip;
  }
}
