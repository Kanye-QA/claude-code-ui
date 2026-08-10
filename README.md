# Claude Code UI

一个非官方、仅在本机运行的 Windows 桌面界面，让 Claude Code 可以像聊天应用一样使用。

## ⬇ 最新正式版

[![最新正式版](https://img.shields.io/github/v/release/Kanye-QA/claude-code-ui?label=%E6%9C%80%E6%96%B0%E6%AD%A3%E5%BC%8F%E7%89%88)](https://github.com/Kanye-QA/claude-code-ui/releases/latest)

**当前版本：4.0**  ·  [下载 Windows 便携版（Claude-Code-UI-4.0-portable.exe）](https://github.com/Kanye-QA/claude-code-ui/releases/download/v4.0/Claude-Code-UI-4.0-portable.exe)

下载后双击即可运行，不需要安装 Node.js。旧版本和完整说明都保留在 [Releases](https://github.com/Kanye-QA/claude-code-ui/releases)。

> 以后每次正式发版都会优先更新这一块：版本号、下载按钮和更新摘要；GitHub 右侧的 **Latest** 也会自动指向最新正式版。

> 本项目与 Anthropic 无隶属或官方合作关系。Claude、Claude Code 等名称归其各自权利人所有。

> 模型菜单中的品牌图标仅用于识别供应商，不代表任何厂商的合作或背书；图标来源与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 更新摘要

### 4.0 正式版

- 上下文占用改为融入工具栏的环形状态，不再使用突兀的长进度条。
- 模型菜单同步本机 CC Switch 目录并按供应商分组，内置 177 个模型兜底目录与同款品牌图标；DeepSeek 默认升级为 `deepseek-v4-flash`。
- AI 工作时仍可输入补充要求；消息会按顺序排队，当前回复完成后自动继续。
- 支持直接重命名项目，并为用户消息与 AI 回答加入复制按钮。
- 输入区右键菜单提供“复制、粘贴、全选”，样式与项目主题一致。
- 余额自动查询与 Claude 实际运行统一读取当前生效的配置目录。

### 3.1 正式版
- 余额工具区文案优化为“自动查询”，保留手动刷新。

### 3.0 正式版
- 新增 DeepSeek 余额查询：输入栏工具区展示余额，打开或重新聚焦应用时自动查询，也可手动点击刷新。
- 余额请求仅在本机使用当前 Claude/CC Switch 配置中的凭据，不会保存或上传凭据；暂不支持的供应商会明确提示。

### 2.0 正式版

- 项目与会话分层管理：每个项目可保存多段独立对话。
- 支持在项目下快速新建会话，以及直接重命名会话。
- 删除确认窗口统一为深色 Claude 主题；已有聊天历史会自动迁移保留。

## 功能

- 原生 Windows 桌面窗口，无需启动网页服务器。
- 按项目归档会话；项目和会话都可直接重命名，每个项目可单独新建多段对话。
- 选择项目文件夹后直接与 Claude Code 对话。
- 会话历史、Markdown、代码块复制、思考过程与工具调用展示。
- AI 工作时仍可继续输入补充要求，排队后自动依次执行；也可停止当前任务。
- 用户消息和 AI 回答均可一键复制，输入区支持主题化右键复制、粘贴和全选。
- 在输入台搜索并切换 CC Switch 模型目录、自定义模型 ID、推理强度和权限模式；未知的新模型会自动匹配供应商图标或回退到通用图标。
- 根据 Claude Code 返回的 usage 数据显示上下文占用。
- 沿用本机 Claude Code 配置；使用 CC Switch 时会自然继承其当前配置。
- 不读取、嵌入或上传 CC Switch 密钥。

## 运行要求

- Windows 10/11 64 位。
- 已安装 Claude Code CLI，并已完成登录或 API/供应商配置。
- CC Switch 可选，不是必需依赖。

## 使用便携版

从 GitHub Releases 下载 4.0 正式版 `Claude-Code-UI-4.0-portable.exe`，双击即可启动。便携版已经包含桌面界面和 Electron，不需要另外安装 Node.js。

首次运行若出现 Windows SmartScreen 提示，请先核对下载来源。当前社区构建没有商业代码签名。

## 基本使用

1. 打开 Claude Code UI。
2. 点击左侧“新建项目”，命名并选择项目目录；系统会自动创建第一段会话。
3. 点击项目名称右侧的“+”可在该项目下继续新建会话；项目和会话标题旁的铅笔都可直接重命名。
4. 输入任务并按 Enter 发送；Shift + Enter 换行。
5. 使用输入台按钮切换模型、推理强度和权限模式。

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
