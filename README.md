# Claude Code UI

一个非官方、仅在本机运行的 Windows 桌面界面，让 Claude Code 可以像聊天应用一样使用。

## ⬇ 最新正式版

[![最新正式版](https://img.shields.io/github/v/release/Kanye-QA/claude-code-ui?label=%E6%9C%80%E6%96%B0%E6%AD%A3%E5%BC%8F%E7%89%88)](https://github.com/Kanye-QA/claude-code-ui/releases/latest)

**当前版本：5.0**  ·  [下载 Windows 便携版（Claude-Code-UI-5.0-portable.exe）](https://github.com/Kanye-QA/claude-code-ui/releases/download/v5.0/Claude-Code-UI-5.0-portable.exe)

下载后双击即可运行，不需要安装 Node.js。旧版本和完整说明都保留在 [Releases](https://github.com/Kanye-QA/claude-code-ui/releases)。

> 以后每次正式发版都会优先更新这一块：版本号、下载按钮和更新摘要；GitHub 右侧的 **Latest** 也会自动指向最新正式版。

> 本项目与 Anthropic 无隶属或官方合作关系。Claude、Claude Code 等名称归其各自权利人所有。

> 模型菜单中的品牌图标仅用于识别供应商，不代表任何厂商的合作或背书；图标来源与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 更新摘要

### 5.0 正式版

- 每次启动停留在“今天想做点什么”首页，不再自动进入上次对话；三个功能卡片与“新建项目”入口同时保留。
- 新增右侧任务时间线：按每次用户要求生成主题、时间与状态节点，点击即可跳回当时的对话位置。
- 新建项目可留空名称，命名优先级为“手动名称 → 本地项目元数据 → 首个任务主题 → 文件夹名”；手动改名后永久优先。
- 默认权限模式和响应强度改为主题化卡片，不再弹出与项目风格不一致的 Windows 原生下拉菜单。
- 模型选择器改为“供应商大类 → 具体模型”，Claude、DeepSeek、OpenAI / GPT / Codex 等默认折叠，搜索时直接显示匹配结果。
- 首页会直接显示 Claude 实际使用的项目名称和工作目录；顶部栏与输入台显示项目名，悬停可查看完整目录，防止界面项目与运行目录不一致。

### 4.0 正式版

- 上下文占用改为融入工具栏的环形状态，不再使用突兀的长进度条。
- 模型菜单同步本机 CC Switch 目录并按供应商分组，内置 177 个模型兜底目录与同款品牌图标；旧的 `deepseek-v4-pro` 选择会迁移为 `deepseek-v4-flash`。
- AI 工作时仍可输入补充要求；消息会按顺序排队，当前回复完成后自动继续。
- 支持直接重命名项目，并为用户消息与 AI 回答加入复制按钮。
- 输入区右键菜单提供“复制、粘贴、全选”，样式与项目主题一致。
- 余额自动查询与 Claude 实际运行统一读取当前生效的配置目录。

### 3.1 正式版
- 余额工具区文案优化为“自动查询”，保留手动刷新。

### 3.0 正式版
- 新增 DeepSeek 余额查询：输入栏工具区展示余额，打开或重新聚焦应用时自动查询，也可手动点击刷新。
- 余额查询仅在本机读取当前 Claude 配置中的凭据，不会保存，也不会发送到本项目服务器；只允许通过 HTTPS 直连 DeepSeek 官方余额接口，暂不支持的供应商会明确提示。

### 2.0 正式版

- 项目与会话分层管理：每个项目可保存多段独立对话。
- 支持在项目下快速新建会话，以及直接重命名会话。
- 删除确认窗口统一为深色 Claude 主题；已有聊天历史会自动迁移保留。

## 功能

- 原生 Windows 桌面窗口，无需启动网页服务器。
- 按项目归档会话；项目可自动识别名称，项目和会话也都可手动重命名，每个项目可单独新建多段对话。
- 选择项目文件夹后直接与 Claude Code 对话。
- 会话历史、任务时间线、Markdown、代码块复制、思考过程与工具调用展示。
- AI 工作时仍可继续输入补充要求，排队后自动依次执行；也可停止当前任务。
- 用户消息和 AI 回答均可一键复制，输入区支持主题化右键复制、粘贴和全选。
- 在输入台按供应商展开、搜索并切换 CC Switch 模型目录，也可使用自定义模型 ID、推理强度和权限模式；未知的新模型会自动匹配供应商图标或回退到通用图标。
- 根据 Claude Code 返回的 usage 数据显示上下文占用。
- 沿用本机 Claude Code 配置；使用 CC Switch 时会自然继承其当前配置。
- 不读取 CC Switch 数据库中的密钥，也不会在程序或仓库中嵌入密钥；余额查询会按上一条说明读取当前 Claude 配置并直连 DeepSeek 官方 HTTPS 接口。

## 运行要求

- Windows 10/11 64 位。
- 已安装 Claude Code CLI，并已完成登录或 API/供应商配置。
- CC Switch 可选，不是必需依赖。

## 使用便携版

从 GitHub Releases 下载 5.0 正式版 `Claude-Code-UI-5.0-portable.exe`，双击即可启动。便携版已经包含桌面界面和 Electron，不需要另外安装 Node.js。

首次运行若出现 Windows SmartScreen 提示，请先核对下载来源和 Release 页 SHA-256。当前社区构建没有商业代码签名；提示不等于已检测到病毒，也不要求必须上架 Microsoft Store，但不建议关闭 Defender 或 Smart App Control。

## 基本使用

1. 打开 Claude Code UI。
2. 点击左侧“新建项目”并选择项目目录；名称可留空，由应用根据本地项目信息自动识别，随后会创建第一段会话。
3. 点击项目名称右侧的“+”可在该项目下继续新建会话；项目和会话标题旁的铅笔都可直接重命名。
4. 输入任务并按 Enter 发送；Shift + Enter 换行。
5. 使用输入台按钮切换模型、推理强度和权限模式。
6. 对话较长时，可使用右侧任务时间线查看每一阶段的主题并跳转定位。

模型选择“跟随 CC Switch”时，不传入模型覆盖参数，由本机 Claude Code 配置决定实际模型；也可以选择 `sonnet`、`opus`、`haiku`、`fable`、`deepseek-v4-flash`，或输入其他模型 ID。

“推理强度”对应 Claude Code 的 effort 参数，不是网络下载速度。更高的强度通常会进行更多分析，也可能使用更多时间和 Token。

## 隐私

- Claude Code UI 只在本机启动 Claude Code CLI，不提供自己的云端中转服务。
- 会话历史与界面设置保存在当前 Windows 用户的应用数据目录。
- 发布包不包含开发者的 Claude 登录、API Key、CC Switch 密钥或聊天历史。
- 发送给模型的数据范围仍由你自己的 Claude Code、供应商与项目配置决定。

## 本地开发

需要 Node.js 22 或更高版本：

```powershell
npm install
npm start
```

类型检查：

```powershell
npm run typecheck
```

生成 Windows 便携版：

```powershell
npm run pack:win
```

## 技术栈

- Electron
- React + TypeScript
- Vite
- Claude Code `stream-json`

## 许可证

[MIT](LICENSE)
