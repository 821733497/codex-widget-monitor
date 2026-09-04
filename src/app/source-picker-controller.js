export function createSourcePickerController({
  els,
  state,
  service,
  render,
  refreshQuota,
  openSettings,
  getLocale,
}) {
  let isMenuOpen = false;

  function bindEvents() {
    els.sourcePickerBtn?.addEventListener("click", cycleToNextSource);
    els.activeSourceIndicator?.addEventListener("click", togglePanelMenu);
    document.addEventListener("click", handleDocumentClick);
  }

  function handleDocumentClick(event) {
    if (!isMenuOpen) return;
    if (
      els.activeSourceIndicator?.contains(event.target) ||
      els.sourcePickerMenu?.contains(event.target)
    ) {
      return;
    }
    closePanelMenu();
  }

  let switchToastTimer = null;
  function showSwitchToast(text) {
    if (!els.widget) return;
    const existing = els.widget.querySelector(".ball-switch-toast");
    if (existing) existing.remove();
    if (switchToastTimer) clearTimeout(switchToastTimer);

    const toast = document.createElement("div");
    toast.className = "ball-switch-toast";
    toast.textContent = text;
    els.widget.append(toast);

    switchToastTimer = setTimeout(() => {
      toast.remove();
      switchToastTimer = null;
    }, 1200);
  }

  function resolveSourceLabel(target) {
    const locale = getLocale ? getLocale() : "zh";
    if (!target || target.type === "official") {
      return locale === "en" ? "Official Codex CLI" : "官方 Codex CLI";
    }
    if (target.type === "siteKey") {
      const sites = state.settings.sites || [];
      const site = sites.find((s) => s.id === target.siteId);
      const key = site?.keys?.find((k) => k.id === target.keyId);
      if (key) {
        return site?.name
          ? `${site.name} · ${key.name || "Key"}`
          : key.name || "Key";
      }
    }
    return locale === "en" ? "Custom Source" : "自定义数据源";
  }

  async function cycleToNextSource(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (isMenuOpen) {
      closePanelMenu();
    }

    const items = buildSourceItems();
    if (!items || items.length <= 1) {
      const locale = getLocale ? getLocale() : "zh";
      showSwitchToast(
        locale === "en" ? "Only 1 source configured" : "暂无更多数据源",
      );
      return;
    }

    let currentIndex = items.findIndex((item) => item.active);
    if (currentIndex < 0) currentIndex = 0;
    const nextIndex = (currentIndex + 1) % items.length;
    const nextItem = items[nextIndex];

    await switchSource(nextItem.target, { showToast: true });
  }

  function togglePanelMenu(event) {
    event?.stopPropagation();
    if (isMenuOpen) {
      closePanelMenu();
    } else {
      openPanelMenu();
    }
  }

  function openPanelMenu() {
    isMenuOpen = true;
    renderPanelMenu();
    if (els.sourcePickerMenu) {
      els.sourcePickerMenu.hidden = false;
      els.sourcePickerMenu.style.display = "block";
    }
    if (els.sourcePickerShell) {
      els.sourcePickerShell.classList.add("open");
    }
  }

  function closePanelMenu() {
    isMenuOpen = false;
    if (els.sourcePickerMenu) {
      els.sourcePickerMenu.hidden = true;
      els.sourcePickerMenu.style.display = "none";
    }
    if (els.sourcePickerShell) {
      els.sourcePickerShell.classList.remove("open");
    }
  }

  async function switchSource(target, { showToast = true } = {}) {
    closePanelMenu();

    state.settings.activeTarget = target;
    state.settingsDraft.activeTarget = target;
    render();

    if (showToast) {
      const label = resolveSourceLabel(target);
      showSwitchToast(label);
    }

    if (service.isAvailable()) {
      try {
        await service.commands.switchActiveTarget(target);
      } catch (err) {
        state.errors.quota = String(err?.message || err);
      }
    }
    // 异步拉取最新额度，不阻塞切换指示与界面反馈
    void refreshQuota();
  }

  function buildSourceItems() {
    const locale = getLocale ? getLocale() : "zh";
    const officialLabel =
      locale === "en" ? "Official Codex CLI" : "官方 Codex CLI";
    const active = state.settings.activeTarget || { type: "official" };

    const items = [
      {
        label: officialLabel,
        active: !active || active.type === "official",
        target: { type: "official" },
      },
    ];

    const sites = state.settings.sites || [];
    sites.forEach((site) => {
      const keys = site.keys || [];
      if (keys.length > 0) {
        keys.forEach((key) => {
          const isAct =
            active.type === "siteKey" &&
            active.siteId === site.id &&
            active.keyId === key.id;
          items.push({
            group: site.name || "中转站",
            label: key.name || "Key",
            active: isAct,
            target: {
              type: "siteKey",
              siteId: site.id,
              keyId: key.id,
            },
          });
        });
      }
    });

    return items;
  }

  function renderPanelMenu() {
    if (!els.sourcePickerMenu) return;
    els.sourcePickerMenu.replaceChildren();

    const scrollList = document.createElement("div");
    scrollList.className = "source-picker-list";

    const items = buildSourceItems();
    let currentGroup = null;

    items.forEach((item) => {
      if (item.group && item.group !== currentGroup) {
        currentGroup = item.group;
        const groupEl = document.createElement("div");
        groupEl.className = "menu-group-title";
        groupEl.textContent = currentGroup;
        groupEl.title = currentGroup;
        scrollList.append(groupEl);
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-no-drag", "");
      btn.className = `menu-item ${item.active ? "active" : ""}`;
      btn.title = item.group ? `${item.group} · ${item.label}` : item.label;
      btn.innerHTML = `
        <span class="menu-item-text">${escapeHtml(item.label)}</span>
        ${item.active ? `<span class="menu-item-check">✓</span>` : ""}
      `;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        switchSource(item.target);
      });
      scrollList.append(btn);
    });

    const footer = document.createElement("div");
    footer.className = "source-picker-footer";

    const locale = getLocale ? getLocale() : "zh";
    const divider = document.createElement("div");
    divider.className = "menu-divider";
    const manageBtn = document.createElement("button");
    manageBtn.type = "button";
    manageBtn.setAttribute("data-no-drag", "");
    manageBtn.className = "menu-item menu-item-manage";
    manageBtn.textContent =
      locale === "en" ? "⚙ Manage Relay Sites..." : "⚙ 管理中转站...";
    manageBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closePanelMenu();
      if (openSettings) openSettings("sources");
    });
    footer.append(divider, manageBtn);

    els.sourcePickerMenu.append(scrollList, footer);
  }

  function updatePickerLabel() {
    const locale = getLocale ? getLocale() : "zh";
    const active = state.settings.activeTarget || { type: "official" };
    let displayName = locale === "en" ? "Official Codex CLI" : "官方 Codex CLI";

    if (active.type === "siteKey") {
      const sites = state.settings.sites || [];
      const site = sites.find((s) => s.id === active.siteId);
      const key = site?.keys?.find((k) => k.id === active.keyId);
      if (key) {
        displayName = `${site?.name || "中转站"} · ${key.name || "Key"}`;
      }
    }

    if (els.sourcePickerBtn) {
      const tip = `${locale === "en" ? "Next Source" : "切换下一个数据源"} (${displayName})`;
      els.sourcePickerBtn.dataset.tooltip = tip;
      els.sourcePickerBtn.setAttribute("aria-label", tip);
    }

    if (els.activeSourceIndicator) {
      const prefix = locale === "en" ? "Source: " : "当前源：";
      els.activeSourceIndicator.textContent = `${prefix}${displayName}`;
    }
  }

  function escapeHtml(str) {
    return String(str).replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[m],
    );
  }

  return {
    bindEvents,
    closePanelMenu,
    updatePickerLabel,
    buildSourceItems,
    switchSource,
    cycleToNextSource,
  };
}
