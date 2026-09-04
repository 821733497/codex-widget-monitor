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

相对上游项目，本仓库只聚焦以下二次开发能力：

- **第三方供应商适配**：接入兼容 `sub2api` 的用量接口，自动读取今日消耗、周期额度和周窗口数据。
- **多站点管理**：支持添加多个供应商站点，并自动规范化 `/v1/usage` 请求地址。
- **多 Key 管理**：每个站点可保存多个 API Key，支持脱敏展示、编辑、删除和激活切换。
- **连接测试**：在保存或切换前测试供应商接口，明确反馈鉴权失败、接口错误和成功状态。
- **数据源切换**：在官方 Codex CLI 与第三方供应商之间切换，主面板显示当前激活站点和 Key。
- **第三方额度卡片**：针对供应商返回的数据展示“今日消耗 / 周期额度 / 周窗口”，不再套用官方额度估算逻辑。
- **顶部快捷操作栏**：调整主面板顶部入口，集中提供悬浮球、设置、置顶、刷新、主题、数据源和隐藏到托盘操作。
- **设置交互优化**：设置窗口扩大到 `800 × 500`；移除“取消 / 保存”按钮，选择、开关和数据源切换点击后立即生效，文本输入在变更或失焦后自动保存。

上游已有的面板、悬浮球、边缘吸附、主题、自动刷新和桌面设置能力继续保留，但不在这里重复展开；安装和基础使用方式见下文。截图按“二开功能页面、主题、悬浮球”分组，便于快速查看本仓库实际改动。

## 功能截图

以下展示当前已提供的主题示例；后续新增主题时可直接追加截图，无需改动本节说明。

### 二开功能页面

<table>
  <tr>
    <td width="50%"><strong>中转站与 Key 管理</strong><br><img src="docs/assets/provider-settings.png" alt="中转站与 Key 管理页面" width="100%"></td>
    <td width="50%"><strong>设置页（800 × 500，修改立即生效）</strong><br><img src="docs/assets/settings-expanded.png" alt="800 × 500 设置页面" width="100%"></td>
  </tr>
</table>

### 多种主题的用量面板

<table>
  <tr>
    <td width="50%"><strong>全息 3D 核心</strong><br><img src="docs/assets/third-party-usage-dashboard.png" alt="全息 3D 核心主题的第三方用量主面板" width="100%"></td>
    <td width="50%"><strong>烈焰熔核</strong><br><img src="docs/assets/theme-pyro.png" alt="烈焰熔核主题的第三方用量主面板" width="100%"></td>
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
3. 如果读取失败，打开“设置 → 基础设置”，手动选择 Codex CLI 路径。
4. 在完整面板查看额度；点击圆形按钮可以切换到悬浮球，双击悬浮球可回到面板。

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
├─ docs/assets/         # README 功能截图
├─ src/                 # 前端界面、主题与交互
├─ src-tauri/           # Rust 后端、Tauri 配置和供应商适配
├─ scripts/             # 构建/发布辅助脚本
├─ index.html           # Vite 页面入口
├─ package.json         # 前端依赖和 npm 脚本
└─ README.md
```

## 许可

本项目遵循仓库 [`LICENSE`](LICENSE) 中的 MIT License。上游版权和许可声明继续有效；新增代码、资源和第三方依赖请分别遵循其适用许可。
