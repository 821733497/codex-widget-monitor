export const DEFAULT_SETTINGS = {
  codexCliPath: "",
  updateProxy: "",
  refreshIntervalMinutes: 5,
  locale: "zh",
  theme: "default",
  meterWindow: "secondary",
  dataBars: null,
  logLevel: "off",
  autoUpdateEnabled: true,
  autoStartEnabled: false,
  hideDockIcon: false,
  onboardingSeen: false,
  widgetMode: "ball",
  panelPosition: null,
  ballPosition: null,
  ballDock: null,
  ballSize: "small",
  ballSnapStyle: "ball",
  sites: [],
  activeTarget: { type: "official" },
};

export const APP_VERSION_LABEL = "";
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const WIDGET_MODES = {
  PANEL: "panel",
  BALL: "ball",
};
export const IPC_EVENTS = {
  QUICK_MENU_ACTION: "quick-menu:action",
  QUICK_MENU_SYNC: "quick-menu:sync",
  TRAY_PREVIEW_UPDATE: "quota:tray-preview-update",
  TRAY_PREVIEW_READY: "tray-preview:ready",
  TRAY_PREVIEW_MODE_CHANGED: "tray-preview:mode-changed",
  TRAY_PREVIEW_KEEP_OPEN: "tray-preview:keep-open",
  ALWAYS_ON_TOP_CHANGED: "window:always-on-top-changed",
};
export const THEMES = {
  default: {
    label: {
      zh: "全息 3D 核心",
      en: "Holo 3D Core",
    },
  },
  pyro: {
    label: {
      zh: "烈焰熔核",
      en: "Pyro Core",
    },
  },
};

export const METER_WINDOWS = {
  primary: {
    label: {
      zh: "5小时窗口",
      en: "5h window",
    },
  },
  secondary: {
    label: {
      zh: "周窗口",
      en: "Weekly window",
    },
  },
};

export const BALL_SIZE_OPTIONS = {
  small: {
    label: {
      zh: "默认 (64px)",
      en: "Default (64px)",
    },
  },
  medium: {
    label: {
      zh: "大 (88px)",
      en: "Large (88px)",
    },
  },
};

export const BALL_SNAP_STYLE_OPTIONS = {
  ball: {
    label: {
      zh: "半球贴边",
      en: "Half-ball dock",
    },
  },
  bar: {
    label: {
      zh: "竖向进度条",
      en: "Vertical bar",
    },
  },
};

export const BAR_DOCK_VISIBLE_WIDTH = 14;

export const DATA_BAR_CONTENTS = {
  fiveHour: {
    label: {
      zh: "5小时窗口",
      en: "5h window",
    },
  },
  weekly: {
    label: {
      zh: "周窗口",
      en: "Weekly window",
    },
  },
  resetCredits: {
    label: {
      zh: "重置次数",
      en: "Reset credits",
    },
  },
  quotaEstimate: {
    label: {
      zh: "额度估算",
      en: "Quota estimate",
    },
  },
};

export const LOG_LEVELS = {
  off: {
    label: {
      zh: "关闭",
      en: "Off",
    },
  },
  error: {
    label: {
      zh: "错误",
      en: "Error",
    },
  },
  warn: {
    label: {
      zh: "警告",
      en: "Warn",
    },
  },
  info: {
    label: {
      zh: "信息",
      en: "Info",
    },
  },
  debug: {
    label: {
      zh: "调试",
      en: "Debug",
    },
  },
  trace: {
    label: {
      zh: "跟踪",
      en: "Trace",
    },
  },
};

export const PANEL_SIZE = { width: 390, height: 236 };
export const SETTINGS_PANEL_SIZE = { width: 800, height: 500 };
export const BALL_SIZES = {
  medium: 88,
  small: 64,
};
export function resolveBallSize(sizeKey) {
  return BALL_SIZES[sizeKey] || BALL_SIZES.small;
}
export const BALL_SIZE = 64;
export const SNAP_DISTANCE = 24;
export const CLICK_DELAY_MS = 220;
export const PANEL_DOUBLE_CLICK_MS = 320;
export const PANEL_DOUBLE_CLICK_DISTANCE = 8;
export const POSITION_SAVE_DEBOUNCE_MS = 300;
export const RESET_CREDIT_EXPIRY_DISPLAY_LIMIT = 5;

export const i18n = {
  zh: {
    brandName: "Codex 额度",
    loading: "读取中",
    ready: "额度正常",
    low: "额度偏低",
    critical: "额度不足",
    empty: "额度耗尽",
    error: "读取失败",
    remaining: "剩余",
    primaryFallback: "5小时窗口",
    secondaryFallback: "7天窗口",
    estimateTitle: "额度估算",
    estimatePrevious: "上周",
    estimateCurrent: "本周",
    estimateDisclaimer: "100% 周额度 Token API 等价值，不等于实际账单",
    estimatePriceTable: "价格表",
    estimateSamples: "样本",
    estimateSpan: "跨度",
    estimateUnpriced: "未计价",
    estimateSuspectedRemote: "疑似跨设备区间",
    estimateCollecting: "样本或跨度不足",
    estimateLoading: "正在获取数据",
    estimateWaitingCurrentUsage: "等待本周期本地使用数据",
    estimateUnavailable: "无可用本地会话数据",
    plan: "重置次数",
    resetCreditExpiryPrefix: "过期时间：",
    unknown: "未知",
    noData: "暂无数据",
    reading: "正在通过 Codex CLI 读取额度...",
    refreshedAt: "已刷新",
    nextReset: "重置",
    primaryResetInlineLabel: "重置时间：",
    secondaryResetLabel: "重置时间：",
    pin: "置顶",
    unpin: "取消置顶",
    refresh: "刷新数据",
    themeSwitch: "切换主题",
    hide: "隐藏",
    exit: "退出",
    hideToTray: "隐藏到托盘",
    ballMode: "悬浮球",
    panelMode: "完整面板",
    ballRestoreHint: "双击返回面板",
    ballRestoreHintSmall: "双击展开",
    unavailable: "未读取到额度数据",
    openCodex: "打开 Codex CLI",
    checkingUpdate: "正在检查更新...",
    updateAvailable: "发现新版本",
    updateDownloading: "正在下载更新",
    updateInstalling: "正在安装更新",
    updateReady: "更新已安装，重启后生效",
    updateFailed: "更新检查失败",
    updateCheckFailed: "获取版本失败",
    updateInstallFailed: "更新失败",
    updateLatest: "已是最新版本",
    checkUpdate: "检查更新",
    settings: "设置",
    close: "关闭",
    codexPath: "Codex CLI 路径",
    chooseCodex: "选择 Codex CLI (codex/codex.exe)",
    updateProxy: "更新代理",
    refreshInterval: "刷新分钟",
    theme: "主题",
    language: "语言",
    meterWindow: "仪表窗口",
    ballSize: "悬浮球大小",
    ballSizeDefault: "默认 (64px)",
    ballSizeLarge: "大 (88px)",
    ballSizeSmall: "小 (64px)",
    ballSnapStyle: "吸附样式",
    ballSnapStyleBall: "半球贴边",
    ballSnapStyleBar: "竖向进度条",
    dataBar1: "数据栏 1",
    dataBar2: "数据栏 2",
    dataBar3: "数据栏 3",
    logLevel: "日志等级",
    autoUpdate: "自动更新",
    autoUpdateHint: "更新依赖 GitHub，网络不可达时可能需要配置代理。",
    autoStart: "开机自启",
    autoStartHint: "登录系统后自动启动本应用，仅对当前用户生效。",
    hideDockIcon: "隐藏 Dock 图标",
    hideDockIconHint:
      "仅 macOS。开启后隐藏 Dock 图标，仅保留菜单栏图标作为入口。",
    updateProxyHint: "用于 GitHub 自动更新和 ChatGPT 额度过期时间接口。",
    save: "保存",
    cancel: "取消",
    settingsSaved: "设置已保存",
    codexPathPlaceholder: "留空自动探测",
    updateProxyPlaceholder: "http://127.0.0.1:7890",
    onboardingMode: "切换悬浮球",
    onboardingModeTitle: "切换悬浮球",
    onboardingModeDescription:
      "在完整面板和悬浮球之间切换，按使用场景选择显示方式。",
    onboardingSettings: "打开设置，配置主题、语言等",
    onboardingSettingsTitle: "右键快捷菜单",
    onboardingSettingsDescription:
      "右键单击悬浮球或面板，可快捷打开设置、切换数据源、切换主题或放至托盘。",
    onboardingRefresh: "手动刷新额度",
    onboardingRefreshTitle: "手动刷新额度",
    onboardingRefreshDescription: "立即重新读取 Codex CLI 额度，获取最新状态。",
    onboardingUpdate: "点击版本号检查更新",
    onboardingUpdateTitle: "检查更新",
    onboardingUpdateDescription: "点击版本号检查新版本，保持组件及时更新。",
    onboardingClose: "关闭引导",
    onboardingPrev: "上一步",
    onboardingNext: "下一步",
    onboardingDone: "完成",
    tabBasic: "外观显示",
    tabAppearance: "外观显示",
    tabSources: "中转站",
    tabSystem: "系统设置",
    officialSource: "官方 Codex CLI",
    addSite: "添加中转站点",
    editSite: "编辑站点",
    deleteSite: "删除站点",
    siteName: "站点名称",
    siteBaseUrl: "Base URL",
    addKey: "添加 Key",
    editKey: "编辑 Key",
    deleteKey: "删除 Key",
    keyName: "备注名称",
    apiKey: "API Key",
    testConnection: "测试连接",
    testingConnection: "测试中...",
    switchSource: "切换数据源",
    noSitesHint: "尚未添加中转站点，点击下方按钮添加",
    confirmDeleteSite: "确定要删除该站点及其包含的所有 Key 吗？",
    confirmDeleteKey: "确定要删除该 Key 吗？",
  },
  en: {
    brandName: "Codex Quota",
    loading: "Loading",
    ready: "Quota healthy",
    low: "Quota low",
    critical: "Quota insufficient",
    empty: "Quota empty",
    error: "Read failed",
    remaining: "Remain",
    primaryFallback: "5h window",
    secondaryFallback: "7d window",
    estimateTitle: "Quota est.",
    estimatePrevious: "Last",
    estimateCurrent: "Current",
    estimateDisclaimer: "100% weekly Token API equivalent, not an actual bill",
    estimatePriceTable: "Price table",
    estimateSamples: "Samples",
    estimateSpan: "Span",
    estimateUnpriced: "Unpriced",
    estimateSuspectedRemote: "Suspected cross-device intervals",
    estimateCollecting: "Insufficient samples or span",
    estimateLoading: "Fetching data",
    estimateWaitingCurrentUsage: "Waiting for local usage data in this cycle",
    estimateUnavailable: "No usable local session data",
    plan: "Reset credits",
    resetCreditExpiryPrefix: "Expiry: ",
    unknown: "Unknown",
    noData: "No data",
    reading: "Reading quota via Codex CLI...",
    refreshedAt: "Refreshed",
    nextReset: "Reset",
    primaryResetInlineLabel: "Reset:",
    secondaryResetLabel: "Reset:",
    pin: "Pin",
    unpin: "Unpin",
    refresh: "Refresh Data",
    themeSwitch: "Switch theme",
    hide: "Hide",
    exit: "Exit",
    hideToTray: "Hide to tray",
    ballMode: "Floating ball",
    panelMode: "Full panel",
    ballRestoreHint: "Double-click to restore panel",
    ballRestoreHintSmall: "Double-click",
    unavailable: "No quota data",
    openCodex: "Open Codex CLI",
    checkingUpdate: "Checking for updates...",
    updateAvailable: "Update available",
    updateDownloading: "Downloading update",
    updateInstalling: "Installing update",
    updateReady: "Update installed. Restart to apply.",
    updateFailed: "Update check failed",
    updateCheckFailed: "Version check failed",
    updateInstallFailed: "Update failed",
    updateLatest: "Already up to date",
    checkUpdate: "Check for updates",
    settings: "Settings",
    close: "Close",
    codexPath: "Codex CLI path",
    chooseCodex: "Choose Codex CLI (codex/codex.exe)",
    updateProxy: "Update proxy",
    refreshInterval: "Refresh min",
    theme: "Theme",
    language: "Language",
    meterWindow: "Meter window",
    ballSize: "Ball size",
    ballSizeDefault: "Default (64px)",
    ballSizeLarge: "Large (88px)",
    ballSizeSmall: "Small (64px)",
    ballSnapStyle: "Snap style",
    ballSnapStyleBall: "Half-ball dock",
    ballSnapStyleBar: "Vertical bar",
    dataBar1: "Data bar 1",
    dataBar2: "Data bar 2",
    dataBar3: "Data bar 3",
    logLevel: "Log level",
    autoUpdate: "Auto update",
    autoUpdateHint:
      "Updates depend on GitHub. Configure a proxy if the network cannot reach it.",
    autoStart: "Start at login",
    autoStartHint:
      "Launch this app automatically after signing in. Current user only.",
    hideDockIcon: "Hide Dock icon",
    hideDockIconHint:
      "macOS only. Hide the Dock icon and keep the menu bar icon as the app entry point.",
    updateProxyHint:
      "Used for GitHub updates and the ChatGPT quota expiry API.",
    save: "Save",
    cancel: "Cancel",
    settingsSaved: "Settings saved",
    codexPathPlaceholder: "Empty for auto detect",
    updateProxyPlaceholder: "http://127.0.0.1:7890",
    onboardingMode: "Switch to floating ball",
    onboardingModeTitle: "Switch to floating ball",
    onboardingModeDescription:
      "Switch between full panel and floating ball for different workflows.",
    onboardingSettings: "Open settings for theme, language, and more",
    onboardingSettingsTitle: "Quick Menu",
    onboardingSettingsDescription:
      "Right-click the floating ball or panel to access settings, switch data sources, toggle themes, or minimize to tray.",
    onboardingRefresh: "Refresh quota manually",
    onboardingRefreshTitle: "Refresh quota manually",
    onboardingRefreshDescription:
      "Read Codex CLI quota again and get the latest status.",
    onboardingUpdate: "Click version to check updates",
    onboardingUpdateTitle: "Check for updates",
    onboardingUpdateDescription:
      "Click the version to check for new releases and stay current.",
    onboardingClose: "Close guide",
    onboardingPrev: "Previous",
    onboardingNext: "Next",
    onboardingDone: "Done",
    tabBasic: "Appearance",
    tabAppearance: "Appearance",
    tabSources: "Relay Sites",
    tabSystem: "System",
    officialSource: "Official Codex CLI",
    addSite: "Add Provider",
    editSite: "Edit Provider",
    deleteSite: "Delete Provider",
    siteName: "Provider Name",
    siteBaseUrl: "Base URL",
    addKey: "Add Key",
    editKey: "Edit Key",
    deleteKey: "Delete Key",
    keyName: "Remark Name",
    apiKey: "API Key",
    testConnection: "Test",
    testingConnection: "Testing...",
    switchSource: "Switch source",
    noSitesHint: "No custom providers yet. Click button below to add.",
    confirmDeleteSite:
      "Are you sure you want to delete this provider and all its keys?",
    confirmDeleteKey: "Are you sure you want to delete this key?",
  },
};
