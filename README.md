# Codex 额度监控小组件

[English](README.en.md)

一个运行在本机的 Codex 额度监控桌面小组件。它支持读取本机已登录的 Codex CLI，也支持配置兼容 `sub2api` 用量接口的第三方供应商，并通过完整面板或悬浮球展示额度状态。

> 本项目不是 OpenAI 官方产品，也不代表任何第三方供应商。截图中的域名、金额和 Key 均为示例数据。

## 项目来源与二次开发说明

本仓库 Fork 自 [359956085/codex-widget](https://github.com/359956085/codex-widget)，在原项目 MIT License 的基础上进行二次开发。当前版本重点加入了第三方供应商用量监控、多站点/多 Key 管理、连接测试和数据源切换。

MIT 许可允许使用、修改和再发布，但发布二开版本时请保持以下事项：

- **保留许可**：保留仓库中的 [`LICENSE`](LICENSE) 文件及原作者版权和许可声明。
- **标注来源**：在 README、About 或 Release 说明中明确标注上游项目和本仓库的改动范围。
- **避免混淆**：不要使用容易让人误以为获得上游作者或 OpenAI 官方背书的名称、图标或文案。
- **检查新增内容**：检查新增依赖和供应商接口的许可条款；不要把 API Key、密码、证书或本机配置提交到 Git。

上游 README 中与安装、Codex CLI 路径、悬浮球和基础设置有关的内容仍然适用，已在下文合并并按当前界面更新。原来的主题画廊、旧截图和只针对官方额度估算的长篇公式说明不再作为本 Fork 的发布文档，避免与第三方用量模式混淆。

## 本仓库新增功能

相对上游项目，本仓库聚焦并增强了以下能力：

- **第三方供应商适配**：接入兼容 `sub2api` 的用量接口，自动读取今日消耗、周期额度和周窗口数据。
- **多站点与多 Key 管理**：支持添加多个供应商站点并自动规范化 `/v1/usage` 请求地址；每个站点可配置多个 API Key，支持脱敏展示、编辑、删除与激活切换。
- **连接测试与即时切换**：在保存或切换前一键测试接口联通性与凭据鉴权；切换数据源实现即时响应与后台异步静默刷新。
- **第三方额度卡片**：针对供应商返回的数据展示“今日消耗 / 周期额度 / 周窗口”，独立呈现第三方用量体系。
- **统一右键快捷菜单（Quick Menu）**：悬浮球与主面板右键统一唤起极简暗黑毛玻璃快捷菜单，支持快速刷新、一键切换数据源、一键切换主题、设置及退出。
- **托盘悬浮用量概览（Tray Preview）**：鼠标悬停系统托盘图标即时呼出额度概览卡片，快速查看发光运行状态、当前站点与额度卡片，无需唤起主面板。
- **悬浮球吸附形态切换（竖向微型进度条）**：悬浮球贴边吸附支持在“半球贴边”与“竖向微型进度条”之间自由切换，具备左右贴边感知、流光刻度与自适应尺寸，极致节省桌面空间。
- **悬浮球与设置智能联动**：在悬浮球模式下打开设置窗口自动转为居中面板，关闭设置后无缝还原为悬浮球。
- **分类设置与即时生效**：设置页升级为 `800 × 500` 三标签页布局（外观显示、中转站、系统设置），支持悬浮球大小、吸附形态、数据槽位定制及更新代理等配置，所有修改即时生效自动保存。
- **3D 仪表盘架构重构**：全仓精简废弃代码，抽取统一的 3D 仪表盘基座与官方/第三方统一数据契约。

上游已有的面板、悬浮球、主题渲染、自动刷新和桌面基础设置能力继续保留。

## 功能截图

以下展示当前版本的核心功能界面、快捷交互与主题示例：

### 核心功能与设置

<table>
  <tr>
    <td width="50%"><strong>中转站与 Key 管理</strong><br><img src="docs/assets/provider-settings.png" alt="中转站与 Key 管理页面" width="100%"></td>
    <td width="50%"><strong>分类设置页（修改立即生效）</strong><br><img src="docs/assets/settings-expanded.png" alt="分类设置页面" width="100%"></td>
  </tr>
</table>

### 便捷交互与贴边形态

<table>
  <tr>
    <td width="33%"><strong>统一右键快捷菜单</strong><br><img src="docs/assets/quick-menu.png" alt="统一右键快捷菜单" width="100%"></td>
    <td width="33%"><strong>托盘悬浮用量概览</strong><br><img src="docs/assets/tray-preview.png" alt="托盘悬浮用量概览" width="100%"></td>
    <td width="34%"><strong>竖向进度条吸附形态</strong><br><img src="docs/assets/dock-bar.png" alt="竖向进度条贴边吸附" width="100%"></td>
  </tr>
</table>

### 多种主题的悬浮球

<table>
  <tr>
    <td width="50%"><strong>全息 3D 核心悬浮球</strong><br><img src="docs/assets/floating-ball-holo.png" alt="全息 3D 核心主题悬浮球" width="100%"></td>
    <td width="50%"><strong>烈焰熔核悬浮球</strong><br><img src="docs/assets/floating-ball-pyro.png" alt="烈焰熔核主题悬浮球" width="100%"></td>
  </tr>
</table>

截图由当前分支的前端组件和样式生成，使用示例数据且 Key 已脱敏；请勿把真实凭据放进截图、README 或 Issue。

## 使用方式

### 1. 使用官方 Codex CLI

1. 安装并登录 Codex CLI。
2. 启动本应用；首次启动会尝试自动寻找 `codex` 或 `codex.exe`。
3. 如果读取失败，打开“设置 → 系统设置”，手动选择 Codex CLI 路径。
4. 在完整面板查看额度；点击顶部圆形按钮可以切换到悬浮球，双击悬浮球可回到面板。
5. 悬浮球或主面板支持右键呼出快捷菜单进行一键刷新、数据源切换与设置。

### 2. 配置第三方供应商

1. 打开“设置 → 中转站”，点击“添加中转站点”。
2. 填写站点名称和 Base URL。程序会将请求地址规范化为：
   - Base URL 以 `/v1` 结尾时，请求 `${BaseURL}/usage`；
   - 其他情况，请求 `${BaseURL}/v1/usage`。
3. 在站点下添加一个或多个 API Key，使用“测试连接”确认接口和凭据有效。
4. 点击“使用”激活目标；回到主面板即可查看第三方返回的今日消耗、周期额度和周窗口。

供应商接口需要返回 JSON 用量数据，至少应能提供 `status`、`rate_limits` 或 `usage` 中的一项；具体字段以 [`src-tauri/src/quota/sub2api.rs`](src-tauri/src/quota/sub2api.rs) 的解析规则为准。请求会携带 `Authorization: Bearer <API_KEY>` 和 `X-API-Key` 请求头。

## 配置与隐私

- 官方模式只调用本机 Codex CLI，并复用本机登录状态；本地会话日志不会上传。
- 第三方模式会把请求发送到你选择的 Base URL，API Key 会随请求发送给该供应商。请确认供应商的隐私和数据处理政策。
- 站点和 Key 会保存到本机应用配置目录下的 `settings.json`。当前版本未对 Key 做端到端加密，请按本机文件权限保护该文件，不要把它复制到公共位置或提交到 Git。
- 截图、日志、Issue 和示例配置中请使用占位域名与脱敏凭据。

## 本地开发

环境要求：Node.js、npm、Rust 和 Tauri 构建依赖。Windows 开发建议使用 PowerShell。

```powershell
# 安装锁定版本的前端依赖
npm ci

# 启动 Tauri 开发模式
npm run tauri:dev

# 前端检查
npm run lint
npm test
npm run build:frontend

# Rust 检查与测试
cargo test --locked --manifest-path src-tauri/Cargo.toml

# 一键检查（包含前端审计、Rust fmt/clippy/test）
npm run check
```

发布前建议至少确认：

- `npm run check` 通过；
- Release 中包含安装包和校验/签名文件，不要把 `.exe`、`src-tauri/target` 或本机配置直接提交进源码仓库；
- README、About 和 Release 页面都保留上游来源、MIT 许可和非官方声明；
- 发布包中的自动更新地址已改为你自己的 GitHub Releases（如果仍沿用上游配置，应先确认不会把用户导向上游版本）。

常用构建命令：

```powershell
# Windows NSIS 安装包
npm run tauri:build:nsis

# Windows 便携版（不生成安装器，产物为 src-tauri/target/release/CodexWidget.exe）
npm run tauri:build:portable

# 生成 GitHub Release 产物
npm run release:github
```

便携版不会创建安装器或自动安装 WebView2；运行目标电脑需要已有 WebView2 Runtime。便携版可执行文件属于发布产物，请放在 GitHub Releases 或其他分发渠道，不要提交到源码仓库。

## 项目结构

```text
codex-widget-monitor/
├─ .github/workflows/   # CI 与发布流程
├─ docs/assets/         # README 功能截图与介绍图
├─ src/                 # 前端界面、主题与交互
│  ├─ quick-menu/       # 统一右键快捷菜单
│  ├─ tray-preview/     # 托盘悬浮用量概览
│  └─ components/       # 3D 仪表盘与可视化组件
├─ src-tauri/           # Rust 后端、Tauri 配置和供应商适配
├─ scripts/             # 构建/发布辅助脚本
├─ index.html           # 主窗口入口
├─ quick-menu.html      # 快捷菜单窗口入口
├─ tray-preview.html    # 托盘预览窗口入口
├─ package.json         # 前端依赖和 npm 脚本
└─ README.md
```

## 许可

本项目遵循仓库 [`LICENSE`](LICENSE) 中的 MIT License。上游版权和许可声明继续有效；新增代码、资源和第三方依赖请分别遵循其适用许可。
