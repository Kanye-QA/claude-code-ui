import {
  Check,
  Camera,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardPaste,
  Clock3,
  Copy,
  CornerDownRight,
  Folder,
  FolderOpen,
  FolderPlus,
  KeyRound,
  MessageSquareText,
  Monitor,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Settings,
  Square,
  Sun,
  TextSelect,
  Trash2,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import MarkdownMessage from "./components/MarkdownMessage";
import ToolCard from "./components/ToolCard";
import ClaudeMascotIcon, {
  type ClaudeMascotVariant,
} from "./components/ClaudeMascotIcon";
import ComposerTuningControls, {
  commonModels,
  EffortGlyph,
  effortInfo,
  modeInfo,
} from "./components/ComposerTuningControls";
import ConversationTimeline from "./components/ConversationTimeline";
import ModelBrandIcon, { modelLabel } from "./components/ModelBrandIcon";
import type {
  AppSettings,
  AppState,
  BalanceStatus,
  ChatMessage,
  ChatSession,
  ClaudeStatus,
  EffortLevel,
  ModelCatalogEntry,
  PermissionMode,
  Project,
  ScreenSource,
} from "./types";

const emptyState: AppState = {
  projects: [],
  sessions: [],
  settings: {
    defaultCwd: "",
    defaultPermissionMode: "auto",
    defaultEffort: "",
  requestedModel: "",
    visionModel: "glm-4v-flash",
    claudePath: "",
    theme: "system",
  },
  activeSessionIds: [],
};

function sameDirectory(left?: string, right?: string): boolean {
  const normalize = (value = "") => value.replace(/[\\/]+$/, "").toLowerCase();
  return Boolean(left && right && normalize(left) === normalize(right));
}

function relativeTime(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(
    new Date(value),
  );
}

function displayModel(
  session?: ChatSession,
  modelCatalog: ModelCatalogEntry[] = [],
): string {
  const value = session?.activeModel || session?.requestedModel;
  return modelCatalog.find((model) => model.id === value)?.name ?? modelLabel(value);
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) {
    const digits = value >= 100_000 ? 0 : 1;
    return `${(value / 1_000).toFixed(digits)}k`;
  }
  return String(Math.max(0, Math.round(value)));
}

function balanceDisplay(balance: BalanceStatus | null): string {
  const entry = balance?.balances[0];
  if (!balance) return "查询余额";
  if (balance.status === "unsupported") return "暂不支持";
  if (balance.status === "error") return "查询失败";
  if (!balance.available) return "余额不可用";
  if (!entry) return "暂无余额";
  const prefix = entry.currency === "CNY" ? "¥" : entry.currency === "USD" ? "$" : `${entry.currency} `;
  return `${prefix}${entry.total}`;
}

function balanceHint(balance: BalanceStatus | null): string {
  if (!balance) return "正在读取当前供应商余额；自动查询已开启。";
  const entry = balance.balances[0];
  if (balance.error) return `${balance.provider}：${balance.error} 点击手动刷新。`;
  if (!entry) return `${balance.provider}：暂无可展示的余额。`;
  const details = [
    `总余额 ${entry.currency} ${entry.total}`,
    entry.granted !== undefined ? `赠金 ${entry.granted}` : "",
    entry.toppedUp !== undefined ? `充值 ${entry.toppedUp}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `${balance.provider}：${details}。自动查询已开启，点击可手动刷新。`;
}

function MessageView({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false);
  const copyMessage = async () => {
    if (!message.content) return;
    await window.claudeUI.writeClipboard(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  if (message.role === "user") {
    return (
      <article
        id={`conversation-message-${message.id}`}
        data-timeline-message-id={message.id}
        className={`message user-message ${message.status === "queued" ? "queued-message" : ""}`}
      >
        <div className="user-message-stack">
          <div className="user-bubble">{message.content}</div>
          {message.imagePath && (
            <div className="message-attachment-note">
              <Camera size={12} />
              {message.visionModel
                ? `已由 ${modelLabel(message.visionModel)} 识别截图`
                : "已附加截图"}
            </div>
          )}
          {message.status === "queued" && (
            <div className="queued-note">
              <Clock3 size={11} /> 等待当前任务完成后自动发送
            </div>
          )}
          {message.status === "stopped" && message.error && (
            <div className="queued-note stopped-note">
              <CircleAlert size={11} /> {message.error}
            </div>
          )}
          <div className="message-actions user-message-actions">
            <button
              type="button"
              onClick={() => void copyMessage()}
              title={copied ? "已复制" : "复制消息"}
              aria-label={copied ? "已复制" : "复制消息"}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
        </div>
      </article>
    );
  }

  const isEmptyStreaming = message.status === "streaming" && !message.content;
  return (
      <article id={`conversation-message-${message.id}`} className="message assistant-message">
        <div className="assistant-avatar">
          <ClaudeMascotIcon />
      </div>
      <div className="assistant-content">
        {message.reasoning && (
          <details className="reasoning">
            <summary>
              <ChevronDown size={14} />
              查看思考过程
            </summary>
            <div>{message.reasoning}</div>
          </details>
        )}

        {message.toolCalls?.map((tool) => <ToolCard key={tool.id} tool={tool} />)}

        {isEmptyStreaming ? (
          <div className="thinking-line">
            <span className="thinking-dot" />
            <span className="thinking-dot" />
            <span className="thinking-dot" />
            <span>Claude 正在思考</span>
          </div>
        ) : (
          message.content && <MarkdownMessage content={message.content} />
        )}

        {message.error && (
          <div className="message-error">
            <CircleAlert size={16} />
            <span>{message.error}</span>
          </div>
        )}
        {message.status === "stopped" && (
          <div className="message-note">已由你停止</div>
        )}
        {(message.costUsd !== undefined || message.durationMs !== undefined) && (
          <div className="message-meta">
            {message.durationMs !== undefined && (
              <span>
                <Clock3 size={12} /> {(message.durationMs / 1000).toFixed(1)} 秒
              </span>
            )}
            {message.costUsd !== undefined && <span>${message.costUsd.toFixed(4)}</span>}
          </div>
        )}
        {message.content && (
          <div className="message-actions">
            <button
              type="button"
              onClick={() => void copyMessage()}
              title={copied ? "已复制" : "复制回答"}
              aria-label={copied ? "已复制" : "复制回答"}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

interface SettingsPanelProps {
  state: AppState;
  modelCatalog: ModelCatalogEntry[];
  claudeStatus: ClaudeStatus | null;
  onClose(): void;
  onUpdate(patch: Partial<AppSettings>): Promise<void>;
}

function SettingsPanel({
  state,
  modelCatalog,
  claudeStatus,
  onClose,
  onUpdate,
}: SettingsPanelProps) {
  const [model, setModel] = useState(state.settings.requestedModel);
  const [visionModel, setVisionModel] = useState(state.settings.visionModel);
  const [claudePath, setClaudePath] = useState(state.settings.claudePath);

  const chooseDefaultFolder = async () => {
    const folder = await window.claudeUI.selectDirectory(state.settings.defaultCwd);
    if (folder) await onUpdate({ defaultCwd: folder });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">偏好设置</span>
            <h2 id="settings-title">Claude Code UI</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="settings-content">
          <div className="setting-group">
            <label>Claude Code 状态</label>
            <div className={`status-card ${claudeStatus?.ok ? "status-ok" : "status-bad"}`}>
              <span className="status-indicator" />
              <div>
                <strong>{claudeStatus?.ok ? "已连接" : "未检测到"}</strong>
                <span>{claudeStatus?.version || claudeStatus?.error || "正在检测…"}</span>
                {claudeStatus?.path && <code>{claudeStatus.path}</code>}
              </div>
            </div>
          </div>

          <div className="setting-group">
            <label>默认项目目录</label>
            <button className="path-picker" onClick={chooseDefaultFolder}>
              <FolderOpen size={16} />
              <span>{state.settings.defaultCwd || "选择文件夹"}</span>
            </button>
          </div>

          <fieldset className="setting-group setting-choice-fieldset">
            <legend>默认权限模式</legend>
            <div className="setting-choice-grid permission-choice-grid">
              {(Object.entries(modeInfo) as Array<
                [PermissionMode, (typeof modeInfo)[PermissionMode]]
              >).map(([value, info]) => {
                const selected = state.settings.defaultPermissionMode === value;
                const Icon = info.icon;
                return (
                  <label
                    className={`setting-choice-card permission-choice-card ${selected ? "selected" : ""}`}
                    key={value}
                  >
                    <input
                      type="radio"
                      name="default-permission-mode"
                      value={value}
                      checked={selected}
                      onChange={() => void onUpdate({ defaultPermissionMode: value })}
                    />
                    <span className="setting-choice-icon">
                      <Icon size={16} />
                    </span>
                    <span className="setting-choice-copy">
                      <strong>{info.label}</strong>
                      <small>{info.description}</small>
                    </span>
                    {selected && <Check size={14} className="setting-choice-check" />}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="setting-group setting-choice-fieldset">
            <legend>默认响应速度</legend>
            <div className="setting-choice-grid effort-choice-grid">
              {(Object.entries(effortInfo) as Array<
                [EffortLevel, (typeof effortInfo)[EffortLevel]]
              >).map(([value, info]) => {
                const selected = state.settings.defaultEffort === value;
                return (
                  <label
                    className={`setting-choice-card effort-choice-card ${selected ? "selected" : ""}`}
                    key={value || "auto"}
                  >
                    <input
                      type="radio"
                      name="default-effort"
                      value={value}
                      checked={selected}
                      onChange={() => void onUpdate({ defaultEffort: value })}
                    />
                    <span className="setting-choice-icon effort-choice-icon">
                      <EffortGlyph level={info.level} />
                    </span>
                    <span className="setting-choice-copy">
                      <strong>{info.label}</strong>
                      <small>{info.description}</small>
                    </span>
                    {selected && <Check size={14} className="setting-choice-check" />}
                  </label>
                );
              })}
            </div>
            <p>控制新对话的思考投入，不是网络速度；越快通常越省 Token。</p>
          </fieldset>

          <div className="setting-group">
            <label htmlFor="model">默认模型</label>
            <div className="input-save-row">
              <input
                id="model"
                list="claude-model-options"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="留空：跟随 Claude Code 配置中的模型"
              />
              <button onClick={() => void onUpdate({ requestedModel: model })}>保存</button>
            </div>
            <datalist id="claude-model-options">
              {commonModels.filter((option) => option.value).map((option) => (
                <option key={`alias-${option.value}`} value={option.value}>
                  {option.label}
                </option>
              ))}
              <option value="glm-4v-flash">GLM-4V-Flash（国内免费视觉，推荐）</option>
              <option value="gemini-3.6-flash">Gemini 3.6 Flash（视觉）</option>
              <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite（视觉）</option>
              {modelCatalog.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </datalist>
            <p>留空时使用 Claude Code 自己的默认模型；也可以输入具体模型 ID。</p>
          </div>

          <div className="setting-group">
            <label htmlFor="vision-model">截图识别模型（可选）</label>
            <div className="input-save-row">
              <input
                id="vision-model"
                list="claude-model-options"
                value={visionModel}
                onChange={(event) => setVisionModel(event.target.value)}
                placeholder="留空：使用当前模型读取截图"
              />
              <button onClick={() => void onUpdate({ visionModel })}>保存</button>
            </div>
            <p>
              推荐选择 GLM-4V-Flash：国内智谱模型先读截图，再把结果交给当前模型继续任务。模型本身免费，但仍需你的智谱 API Key，并受账号速率限制。
            </p>
          </div>

          <div className="setting-group">
            <label htmlFor="claude-path">Claude 程序路径</label>
            <div className="input-save-row">
              <input
                id="claude-path"
                value={claudePath}
                onChange={(event) => setClaudePath(event.target.value)}
                placeholder="自动检测，一般无需填写"
              />
              <button onClick={() => void onUpdate({ claudePath })}>保存</button>
            </div>
          </div>

          <div className="setting-group">
            <label>外观</label>
            <div className="theme-options" role="radiogroup" aria-label="外观主题">
              {(
                [
                  ["system", "跟随系统", Monitor],
                  ["light", "浅色", Sun],
                  ["dark", "深色", Moon],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  type="button"
                  key={value}
                  className={state.settings.theme === value ? "selected" : ""}
                  onClick={() => void onUpdate({ theme: value })}
                  role="radio"
                  aria-checked={state.settings.theme === value}
                >
                  <span className={`theme-preview theme-preview-${value}`} aria-hidden="true">
                    <i />
                    <i />
                  </span>
                  <span className="theme-option-label">
                    <Icon size={15} className="theme-option-icon" />
                    {label}
                  </span>
                  {state.settings.theme === value && (
                    <Check size={14} className="theme-option-check" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function DeleteConversationDialog({
  session,
  onClose,
  onConfirm,
}: {
  session: ChatSession;
  onClose(): void;
  onConfirm(): Promise<void>;
}) {
  const [removing, setRemoving] = useState(false);

  const remove = async () => {
    setRemoving(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <section
        className="theme-dialog confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-conversation-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-icon dialog-icon-danger">
          <Trash2 size={18} />
        </div>
        <div className="dialog-copy">
          <p className="eyebrow">删除会话</p>
          <h2 id="delete-conversation-title">删除“{session.title}”？</h2>
          <p>只会删除本应用中的聊天记录，不会修改项目文件。</p>
        </div>
        <div className="dialog-actions">
          <button className="dialog-secondary" onClick={onClose} disabled={removing}>
            取消
          </button>
          <button className="dialog-danger" onClick={() => void remove()} disabled={removing}>
            <Trash2 size={14} />
            {removing ? "正在删除" : "删除会话"}
          </button>
        </div>
      </section>
    </div>
  );
}

function NewProjectDialog({
  defaultCwd,
  onClose,
  onCreate,
}: {
  defaultCwd: string;
  onClose(): void;
  onCreate(input: Pick<Project, "name" | "cwd">): Promise<void>;
}) {
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState(defaultCwd);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const chooseFolder = async () => {
    const folder = await window.claudeUI.selectDirectory(cwd || defaultCwd);
    if (folder) setCwd(folder);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cwd) {
      setError("请先选择项目文件夹。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onCreate({ name: name.trim(), cwd });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form
        className="theme-dialog project-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        onSubmit={(event) => void submit(event)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div className="dialog-icon">
            <FolderPlus size={18} />
          </div>
          <div>
            <p className="eyebrow">项目空间</p>
            <h2 id="new-project-title">新建项目</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="dialog-form">
          <label>
            项目名称（可选）
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="留空将根据项目文件自动识别"
            />
          </label>
          <label>
            项目文件夹
            <button className="dialog-path-picker" type="button" onClick={() => void chooseFolder()}>
              <FolderOpen size={16} />
              <span>{cwd || "选择文件夹"}</span>
            </button>
          </label>
          <p className="dialog-hint">
            会优先读取 package.json、pyproject.toml、Git 等本地信息；若没有结果，发送首个任务后会按任务主题命名。
          </p>
          {error && <p className="dialog-error">{error}</p>}
        </div>
        <footer className="dialog-actions">
          <button className="dialog-secondary" type="button" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="dialog-primary" type="submit" disabled={saving}>
            <FolderPlus size={14} />
            {saving ? "正在创建" : "创建项目"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function VisionKeyDialog({
  onClose,
  onSaved,
}: {
  onClose(): void;
  onSaved(): void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) {
      setError("请输入智谱 API Key。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await window.claudeUI.setVisionApiKey(value);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form
        className="theme-dialog vision-key-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vision-key-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => void save(event)}
      >
        <header className="dialog-header">
          <div className="dialog-icon">
            <KeyRound size={18} />
          </div>
          <div>
            <p className="eyebrow">截图识别</p>
            <h2 id="vision-key-title">输入您的智谱 API Key</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="vision-key-content">
          <p>
            截图会先交给国内的 GLM-4V-Flash 识别，再把识别结果交给当前会话模型继续任务。
            该模型官方标注免费，但仍受智谱账号的速率和使用规则限制。
          </p>
          <label htmlFor="vision-api-key">智谱 API Key</label>
          <input
            id="vision-api-key"
            type="password"
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="粘贴您的智谱 API Key"
            autoComplete="off"
          />
          <small>密钥仅在本机使用 Windows 凭据加密保存，不会发送到本项目服务器。</small>
          <button
            className="vision-key-help"
            type="button"
            onClick={() => void window.claudeUI.openExternal("https://open.bigmodel.cn/")}
          >
            去智谱开放平台获取 API Key
          </button>
          {error && <p className="dialog-error">{error}</p>}
        </div>
        <footer className="dialog-actions">
          <button className="dialog-secondary" type="button" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="dialog-primary" type="submit" disabled={saving}>
            <KeyRound size={14} />
            {saving ? "正在保存" : "保存并继续截图"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function ScreenCaptureDialog({
  onClose,
  onCaptured,
}: {
  onClose(): void;
  onCaptured(value: { path: string; dataUrl: string }): void;
}) {
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadSources = async () => {
    setLoading(true);
    setError("");
    try {
      const next = await window.claudeUI.getScreenSources();
      setSources(next);
      setSelectedId((current) => (next.some((source) => source.id === current) ? current : next[0]?.id ?? ""));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSources();
  }, []);

  const selected = sources.find((source) => source.id === selectedId);
  const capture = async () => {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const result = await window.claudeUI.saveScreenshot(selected.thumbnail);
      onCaptured(result);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <section
        className="theme-dialog screen-capture-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="screen-capture-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div className="dialog-icon">
            <Camera size={18} />
          </div>
          <div>
            <p className="eyebrow">截图输入</p>
            <h2 id="screen-capture-title">截取并发送</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="screen-capture-content">
          <div className="screen-capture-toolbar">
            <span>选择屏幕或窗口，截取后会直接附加到输入框。</span>
            <button type="button" className="icon-button" onClick={() => void loadSources()} disabled={loading} aria-label="刷新画面列表">
              <RefreshCw size={14} className={loading ? "spin" : ""} />
            </button>
          </div>
          {selected ? (
            <div className="screen-preview">
              <img src={selected.thumbnail} alt={`${selected.name} 预览`} />
            </div>
          ) : (
            <div className="screen-preview screen-preview-empty">
              {loading ? "正在读取屏幕…" : "没有可用的屏幕或窗口"}
            </div>
          )}
          <div className="screen-source-list" role="listbox" aria-label="屏幕和窗口">
            {sources.map((source) => (
              <button
                type="button"
                role="option"
                aria-selected={source.id === selectedId}
                className={`screen-source-card ${source.id === selectedId ? "selected" : ""}`}
                key={source.id}
                onClick={() => setSelectedId(source.id)}
              >
                <img src={source.thumbnail} alt="" />
                <span>{source.name}</span>
              </button>
            ))}
          </div>
          {error && <p className="dialog-error">{error}</p>}
        </div>
        <footer className="dialog-actions">
          <button className="dialog-secondary" type="button" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="dialog-primary" type="button" onClick={() => void capture()} disabled={!selected || saving}>
            <Camera size={14} />
            {saving ? "正在附加" : "附加截图"}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<AppState>(emptyState);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [screenCaptureOpen, setScreenCaptureOpen] = useState(false);
  const [visionKeyDialogOpen, setVisionKeyDialogOpen] = useState(false);
  const [screenshotAttachment, setScreenshotAttachment] = useState<{
    path: string;
    dataUrl: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
  const [renamingSession, setRenamingSession] = useState<ChatSession | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [projectRenameDraft, setProjectRenameDraft] = useState("");
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [composerContextMenu, setComposerContextMenu] = useState<{
    x: number;
    y: number;
    clipboardText: string;
    selectionText: string;
  } | null>(null);
  const [claudeStatus, setClaudeStatus] = useState<ClaudeStatus | null>(null);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogEntry[]>([]);
  const [balance, setBalance] = useState<BalanceStatus | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [toast, setToast] = useState<string>("");
  const [activeTimelineMessageId, setActiveTimelineMessageId] = useState<string>();
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLElement>(null);
  const followTailRef = useRef(true);
  const previousScrollTopRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);

  const selected = state.sessions.find((session) => session.id === selectedId);
  const selectedProject = selected
    ? state.projects.find((project) => project.id === selected.projectId)
    : undefined;
  const currentProjectName = selected
    ? selectedProject && sameDirectory(selectedProject.cwd, selected.cwd)
      ? selectedProject.name
      : "未归类对话"
    : "";
  const active = selected ? state.activeSessionIds.includes(selected.id) : false;
  const queuedCount = selected
    ? selected.messages.filter(
        (message) => message.role === "user" && message.status === "queued",
      ).length
    : 0;
  const projectGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return state.projects
      .map((project) => {
        const sessions = state.sessions.filter((session) => session.projectId === project.id);
        const matchesProject =
          !query ||
          project.name.toLowerCase().includes(query) ||
          project.cwd.toLowerCase().includes(query);
        const matches = matchesProject
          ? sessions
          : sessions.filter((session) => session.title.toLowerCase().includes(query));
        return { project, sessions: matches, visible: matchesProject || matches.length > 0 };
      })
      .filter((group) => group.visible);
  }, [search, state.projects, state.sessions]);
  const unassignedSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return state.sessions.filter(
      (session) =>
        !session.projectId &&
        (!query || session.title.toLowerCase().includes(query) || session.cwd.toLowerCase().includes(query)),
    );
  }, [search, state.sessions]);
  const contextInput = selected
    ? selected.contextUsage.inputTokens +
      selected.contextUsage.cacheCreationInputTokens +
      selected.contextUsage.cacheReadInputTokens
    : 0;
  const contextWindow = selected?.contextUsage.contextWindowTokens || 0;
  const contextPercent = contextWindow
    ? Math.min(100, Math.max(0, (contextInput / contextWindow) * 100))
    : 0;
  const contextTone =
    contextPercent >= 90 ? "context-danger" : contextPercent >= 70 ? "context-warning" : "";

  const reportError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setToast(message.replace(/^Error invoking remote method '[^']+': /, ""));
    window.setTimeout(() => setToast(""), 4_500);
  };

  const openScreenCapture = async () => {
    try {
      const status = await window.claudeUI.getVisionKeyStatus();
      if (!status.configured) {
        setVisionKeyDialogOpen(true);
        return;
      }
      setScreenCaptureOpen(true);
    } catch (error) {
      reportError(error);
    }
  };

  const refreshBalance = async (keepSpinnerForOneSecond = false) => {
    const startedAt = Date.now();
    setBalanceLoading(true);
    try {
      setBalance(await window.claudeUI.queryBalance());
    } catch {
      setBalance({
        status: "error",
        provider: "当前供应商",
        available: false,
        balances: [],
        checkedAt: new Date().toISOString(),
        error: "余额查询服务不可用。",
      });
    } finally {
      const remaining = keepSpinnerForOneSecond ? 1_000 - (Date.now() - startedAt) : 0;
      if (remaining > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
      }
      setBalanceLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let dispose = () => {};
    void window.claudeUI
      .getState()
      .then((next) => {
        if (cancelled) return;
        setState(next);
        setSelectedId("");
        window.localStorage.removeItem("selected-session");
      })
      .catch((error) => {
        if (!cancelled) reportError(error);
      });
    dispose = window.claudeUI.onStateChanged((next) => setState(next));
    void window.claudeUI
      .claudeStatus()
      .then((status) => {
        if (!cancelled) setClaudeStatus(status);
      })
      .catch((error) => {
        if (!cancelled) reportError(error);
      });
    void window.claudeUI
      .getModelCatalog()
      .then((catalog) => {
        if (!cancelled) setModelCatalog(catalog);
      })
      .catch(() => {
        if (!cancelled) setModelCatalog([]);
      });
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  useEffect(() => {
    void refreshBalance();
    const refreshOnFocus = () => void refreshBalance();
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, []);

  useEffect(() => {
    if (selectedId && !state.sessions.some((session) => session.id === selectedId)) {
      setSelectedId(state.sessions[0]?.id ?? "");
    }
  }, [selectedId, state.sessions]);

  useEffect(() => {
    const theme = state.settings.theme;
    const resolved =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    document.documentElement.dataset.theme = resolved;
  }, [state.settings.theme]);

  useEffect(() => {
    followTailRef.current = true;
    previousScrollTopRef.current = 0;
    setActiveTimelineMessageId(undefined);
    setScreenshotAttachment(null);
  }, [selectedId]);

  useEffect(
    () => window.claudeUI.onScreenShortcut(() => void openScreenCapture()),
    [],
  );

  useEffect(() => {
    if (!followTailRef.current) return;
    endRef.current?.scrollIntoView({ behavior: active ? "auto" : "smooth" });
    const lastUserMessage = selected?.messages.filter((message) => message.role === "user").at(-1);
    if (lastUserMessage) setActiveTimelineMessageId(lastUserMessage.id);
  }, [active, selected?.messages]);

  useEffect(() => {
    const root = conversationRef.current;
    if (!root || !selected?.messages.length) {
      setActiveTimelineMessageId(undefined);
      return;
    }

    const anchors = Array.from(
      root.querySelectorAll<HTMLElement>("[data-timeline-message-id]"),
    );
    previousScrollTopRef.current = root.scrollTop;

    const updateTimelinePosition = () => {
      scrollFrameRef.current = null;
      const previousScrollTop = previousScrollTopRef.current;
      const nextScrollTop = root.scrollTop;
      const scrollDelta = nextScrollTop - previousScrollTop;
      previousScrollTopRef.current = nextScrollTop;
      const remaining = root.scrollHeight - root.scrollTop - root.clientHeight;
      const scrollable = root.scrollHeight - root.clientHeight > 2;
      const movingUp = scrollDelta < -0.5;
      const movingDown = scrollDelta > 0.5;
      const atTail = !scrollable || remaining <= 8;

      if (movingUp) {
        followTailRef.current = false;
      } else if (!scrollable || (movingDown && atTail)) {
        followTailRef.current = true;
      }

      const markerTop = root.getBoundingClientRect().top + Math.min(160, root.clientHeight * 0.28);
      if (!scrollable) {
        setActiveTimelineMessageId(anchors.at(-1)?.dataset.timelineMessageId);
        return;
      }
      let currentId = anchors[0]?.dataset.timelineMessageId;
      if (followTailRef.current) {
        currentId = anchors.at(-1)?.dataset.timelineMessageId;
      } else {
        let low = 0;
        let high = anchors.length - 1;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          if (anchors[middle].getBoundingClientRect().top <= markerTop) {
            currentId = anchors[middle].dataset.timelineMessageId;
            low = middle + 1;
          } else {
            high = middle - 1;
          }
        }
      }
      setActiveTimelineMessageId((current) =>
        current === currentId ? current : currentId,
      );
    };

    const onScroll = () => {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(updateTimelinePosition);
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0 && root.scrollHeight - root.clientHeight > 2) {
        followTailRef.current = false;
      }
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    root.addEventListener("wheel", onWheel, { passive: true });
    onScroll();
    return () => {
      root.removeEventListener("scroll", onScroll);
      root.removeEventListener("wheel", onWheel);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [selected?.id, selected?.messages.length]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 190)}px`;
  }, [draft]);

  useEffect(() => {
    if (!composerContextMenu) return;
    const close = () => setComposerContextMenu(null);
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [composerContextMenu]);

  const createSession = async (project?: Project) => {
    try {
      const session = await window.claudeUI.createSession(
        project
          ? { projectId: project.id, cwd: project.cwd }
          : { cwd: state.settings.defaultCwd || undefined },
      );
      setSelectedId(session.id);
      setDraft("");
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (error) {
      reportError(error);
    }
  };

  const createProject = async (input: Pick<Project, "name" | "cwd">) => {
    try {
      const project = await window.claudeUI.createProject(input);
      setSelectedId("");
      setDraft("");
      setCollapsedProjects((current) => ({ ...current, [project.id]: false }));
    } catch (error) {
      reportError(error);
      throw error;
    }
  };

  const beginProjectRename = (project: Project) => {
    setProjectRenameDraft(project.name);
    setRenamingProjectId(project.id);
  };

  const saveProjectRename = async (projectId: string) => {
    try {
      await window.claudeUI.updateProject(projectId, { name: projectRenameDraft });
      setRenamingProjectId(null);
    } catch (error) {
      reportError(error);
    }
  };

  const confirmRemoveSession = async () => {
    if (!deleteTarget) return;
    try {
      await window.claudeUI.deleteSession(deleteTarget.id);
    } catch (error) {
      reportError(error);
      throw error;
    }
  };

  const beginRename = (session: ChatSession) => {
    if (state.activeSessionIds.includes(session.id)) return;
    setSelectedId(session.id);
    setRenameDraft(session.title);
    setRenamingSession(session);
  };

  const saveRename = async () => {
    if (!renamingSession) return;
    try {
      await window.claudeUI.updateSession(renamingSession.id, { title: renameDraft });
      setRenamingSession(null);
    } catch (error) {
      reportError(error);
    }
  };

  const scrollToTimelineMessage = (messageId: string) => {
    const root = conversationRef.current;
    const target = document.getElementById(`conversation-message-${messageId}`);
    if (!root || !target || !root.contains(target)) return;
    setActiveTimelineMessageId(messageId);
    const requestedTop =
      root.scrollTop +
      target.getBoundingClientRect().top -
      root.getBoundingClientRect().top -
      24;
    const maximumTop = Math.max(0, root.scrollHeight - root.clientHeight);
    const top = Math.min(maximumTop, Math.max(0, requestedTop));
    followTailRef.current = maximumTop - top <= 2;
    previousScrollTopRef.current = root.scrollTop;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.scrollTo({ top, behavior: reducedMotion ? "auto" : "smooth" });
  };

  const send = async () => {
    if (!selected || (!draft.trim() && !screenshotAttachment)) return;
    const prompt = draft.trim() || "请查看我附加的截图，并告诉我截图中最重要的问题或下一步操作。";
    const attachment = screenshotAttachment;
    followTailRef.current = true;
    setDraft("");
    setScreenshotAttachment(null);
    try {
      await window.claudeUI.sendMessage(selected.id, prompt, attachment?.path);
    } catch (error) {
      setDraft((current) => current || prompt);
      setScreenshotAttachment((current) => current || attachment);
      reportError(error);
    }
  };

  const openComposerContextMenu = async (event: ReactMouseEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    const x = Math.min(event.clientX, window.innerWidth - 178);
    const y = Math.min(event.clientY, window.innerHeight - 142);
    const textarea = event.currentTarget;
    const selectionText = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
    setComposerContextMenu({
      x: Math.max(8, x),
      y: Math.max(8, y),
      clipboardText: "",
      selectionText,
    });
    try {
      const clipboardText = await window.claudeUI.readClipboard();
      setComposerContextMenu((current) =>
        current && current.x === Math.max(8, x) && current.y === Math.max(8, y)
          ? { ...current, clipboardText }
          : current,
      );
    } catch {
      // Keep paste disabled when clipboard access is unavailable.
    }
  };

  const copyComposerSelection = async () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const selectedText = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
    if (selectedText) await window.claudeUI.writeClipboard(selectedText);
    setComposerContextMenu(null);
    textarea.focus();
  };

  const pasteIntoComposer = () => {
    const textarea = textareaRef.current;
    const pasteText = composerContextMenu?.clipboardText ?? "";
    if (!textarea || !pasteText) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextDraft = `${draft.slice(0, start)}${pasteText}${draft.slice(end)}`;
    const caret = start + pasteText.length;
    setDraft(nextDraft);
    setComposerContextMenu(null);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  };

  const selectAllComposerText = () => {
    setComposerContextMenu(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    });
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void send();
    }
  };

  const updateSession = async (patch: Partial<ChatSession>) => {
    if (!selected) return;
    try {
      await window.claudeUI.updateSession(selected.id, patch);
    } catch (error) {
      reportError(error);
    }
  };

  const updateSettings = async (patch: Partial<AppSettings>) => {
    try {
      await window.claudeUI.updateSettings(patch);
    } catch (error) {
      reportError(error);
    }
  };

  useEffect(() => {
    const onShortcut = (event: globalThis.KeyboardEvent) => {
      const commandKey = event.ctrlKey || event.metaKey;
      if (commandKey && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setProjectDialogOpen(true);
      } else if (commandKey && event.shiftKey && event.key === "4") {
        event.preventDefault();
        void openScreenCapture();
      } else if (commandKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        void createSession();
      } else if (commandKey && event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      } else if (event.key === "Escape" && settingsOpen) {
        setSettingsOpen(false);
      } else if (event.key === "Escape" && projectDialogOpen) {
        setProjectDialogOpen(false);
      } else if (event.key === "Escape" && screenCaptureOpen) {
        setScreenCaptureOpen(false);
      } else if (event.key === "Escape" && visionKeyDialogOpen) {
        setVisionKeyDialogOpen(false);
      } else if (event.key === "Escape" && renamingSession) {
        setRenamingSession(null);
      } else if (event.key === "Escape" && renamingProjectId) {
        setRenamingProjectId(null);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [projectDialogOpen, renamingProjectId, renamingSession, screenCaptureOpen, settingsOpen, selectedProject, visionKeyDialogOpen]);

  const renderSessionRow = (session: ChatSession) => (
    <div
      key={session.id}
      className={`session-row ${selectedId === session.id ? "active" : ""}`}
    >
      <button
        className="session-select"
        onClick={() => setSelectedId(session.id)}
        aria-current={selectedId === session.id ? "page" : undefined}
      >
        <MessageSquareText size={15} />
        <span className="session-copy">
          <strong>{session.title}</strong>
          <small>{relativeTime(session.updatedAt)}</small>
        </span>
      </button>
      {state.activeSessionIds.includes(session.id) ? (
        <span className="live-dot" />
      ) : (
        <span className="session-actions">
          <button
            className="session-action"
            aria-label={`重命名会话：${session.title}`}
            onClick={() => beginRename(session)}
          >
            <Pencil size={13} />
          </button>
          <button
            className="session-action delete-session"
            aria-label={`删除会话：${session.title}`}
            onClick={() => setDeleteTarget(session)}
          >
            <Trash2 size={14} />
          </button>
        </span>
      )}
    </div>
  );

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-visible" : "sidebar-hidden"}`}>
      <div className="window-drag-region" />
      <aside className="sidebar">
          <div className="brand-row">
            <div className="brand-mark">
              <ClaudeMascotIcon />
          </div>
          <span>Claude Code</span>
          {window.location.protocol === "http:" && <span className="mock-badge">本地测试版</span>}
          <button
            className="icon-button sidebar-toggle"
            onClick={() => setSidebarOpen(false)}
            aria-label="收起侧边栏"
          >
            <PanelLeftClose size={17} />
          </button>
        </div>

        <button className="new-chat" onClick={() => setProjectDialogOpen(true)}>
          <FolderPlus size={17} />
          新建项目
          <span>Ctrl ⇧ N</span>
        </button>

        <div className="sidebar-search">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索会话"
            aria-label="搜索会话"
          />
        </div>

        <div className="session-label sidebar-section-heading">
          <span>未归类对话</span>
          <button
            type="button"
            className="section-add-button"
            onClick={() => void createSession()}
            title="新建未归类对话"
            aria-label="新建未归类对话"
          >
            <Plus size={13} />
          </button>
        </div>
        <nav className="session-list">
          {unassignedSessions.map(renderSessionRow)}
          {!unassignedSessions.length && (
            <div className="sidebar-empty sidebar-empty-compact">没有未归类对话</div>
          )}
          <div className="session-label sidebar-section-heading projects-label">
            <span>项目</span>
            <button
              type="button"
              className="section-add-button"
              onClick={() => setProjectDialogOpen(true)}
              title="新建项目"
              aria-label="新建项目"
            >
              <FolderPlus size={13} />
            </button>
          </div>
          {projectGroups.map(({ project, sessions }) => (
            <section className="project-group" key={project.id}>
              <header className="project-heading">
                {renamingProjectId === project.id ? (
                  <form
                    className="project-rename"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveProjectRename(project.id);
                    }}
                  >
                    <Folder size={14} />
                    <input
                      autoFocus
                      value={projectRenameDraft}
                      onChange={(event) => setProjectRenameDraft(event.target.value)}
                      aria-label="项目名称"
                    />
                    <button type="submit" aria-label="保存项目名称">
                      <Check size={13} />
                    </button>
                    <button type="button" onClick={() => setRenamingProjectId(null)} aria-label="取消">
                      <X size={13} />
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="project-name project-collapse-toggle"
                    onClick={() =>
                      setCollapsedProjects((current) => ({
                        ...current,
                        [project.id]: !(current[project.id] ?? false),
                      }))
                    }
                    aria-expanded={!(collapsedProjects[project.id] ?? false)}
                    title={project.cwd}
                  >
                    <ChevronRight
                      size={13}
                      className={collapsedProjects[project.id] ? "collapsed" : ""}
                    />
                    <Folder size={14} />
                    <strong>{project.name}</strong>
                  </button>
                )}
                {renamingProjectId !== project.id && (
                  <span className="project-heading-actions">
                    <button
                      className="project-new-chat project-rename-button"
                      onClick={() => beginProjectRename(project)}
                      title={`重命名“${project.name}”`}
                      aria-label={`重命名项目：${project.name}`}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className="project-new-chat"
                      onClick={() => void createSession(project)}
                      title={`在“${project.name}”中新建会话`}
                      aria-label={`在“${project.name}”中新建会话`}
                    >
                      <Plus size={15} />
                    </button>
                  </span>
                )}
              </header>
              {!collapsedProjects[project.id] &&
                (sessions.length ? (
                  sessions.map(renderSessionRow)
                ) : (
                  <button className="project-empty" onClick={() => void createSession(project)}>
                    <Plus size={13} /> 新建第一段会话
                  </button>
                ))}
            </section>
          ))}
          {!projectGroups.length && <div className="sidebar-empty">没有匹配的项目</div>}
        </nav>

        <div className="sidebar-footer">
          <button onClick={() => setSettingsOpen(true)} title="设置 (Ctrl + ,)">
            <Settings size={16} />
            设置
          </button>
          <div className="connection-mini">
            <span className={claudeStatus?.ok ? "connected" : ""} />
            {claudeStatus?.ok ? "Claude Code 已连接" : "Claude 未连接"}
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          {!sidebarOpen && (
              <button
                className="icon-button"
                onClick={() => setSidebarOpen(true)}
                aria-label="展开侧边栏"
              >
              <PanelLeftOpen size={17} />
            </button>
          )}
          <div className="conversation-heading">
            {selected && renamingSession?.id === selected.id ? (
              <form
                className="conversation-rename"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveRename();
                }}
              >
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  aria-label="会话名称"
                />
                <button className="icon-button rename-save" type="submit" aria-label="保存名称">
                  <Check size={15} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setRenamingSession(null)}
                  aria-label="取消重命名"
                >
                  <X size={15} />
                </button>
              </form>
            ) : selected ? (
              <button
                className="conversation-title"
                onClick={() => beginRename(selected)}
                disabled={active}
                title="点击重命名会话"
              >
                <strong>{selected.title}</strong>
                <Pencil size={13} />
              </button>
            ) : (
              <strong>Claude Code UI</strong>
            )}
            {selected && (
              <div
                className="folder-chip current-project-chip"
                title={`当前项目：${currentProjectName}\n工作目录：${selected.cwd}`}
              >
                <Folder size={13} />
                {currentProjectName}
              </div>
            )}
          </div>
          <div className="topbar-actions">
            {selected && (
              <>
                <div
                  className={`model-pill ${selected.activeModel ? "model-pill-confirmed" : ""}`}
                  title={`请求模型：${selected.requestedModel || "跟随 Claude Code 配置"}\n实际模型：${selected.activeModel || "尚未收到运行回显"}`}
                >
                  <ModelBrandIcon model={selected.activeModel || selected.requestedModel} size={14} />
                  {displayModel(selected, modelCatalog)}
                  {selected.activeModel && <span className="model-confirmed-mark">实</span>}
                </div>
              </>
            )}
            <button
              className="icon-button"
              onClick={() => setSettingsOpen(true)}
              aria-label="打开设置"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </header>

        <div className="conversation-stage">
          <section className="conversation" ref={conversationRef}>
            {selected?.messages.length ? (
              <div className="message-column">
                {selected.messages.map((message) => (
                  <MessageView key={message.id} message={message} />
                ))}
                <div ref={endRef} />
              </div>
            ) : (
              <div className="empty-conversation">
              <div className="hero-mark">
                <ClaudeMascotIcon />
              </div>
              <h1>
                {selected ? `想在「${currentProjectName}」中做些什么？` : "今天想做点什么？"}
              </h1>
              <p>
                {selected
                  ? "Claude Code 会以这个项目目录为范围读取和修改文件。"
                  : "先选择或新建一个项目，再像聊天一样描述任务；历史项目仍保留在左侧。"}
              </p>
              {selected && (
                <div className="project-context-path" title={selected.cwd}>
                  <FolderOpen size={15} />
                  <span>
                    <small>当前工作目录</small>
                    <code>{selected.cwd}</code>
                  </span>
                </div>
              )}
              <div className="quick-actions">
                {(
                  [
                    ["解释这个项目", "先浏览当前项目，告诉我它的结构、用途和启动方式。", "explain"],
                    ["排查一个问题", "帮我检查当前项目的问题，先分析原因再提出修复方案。", "debug"],
                    ["实现新功能", "请阅读当前项目，并帮我实现下面这个功能：", "build"],
                  ] satisfies Array<[string, string, ClaudeMascotVariant]>
                ).map(([label, prompt, variant]) => (
                  <button
                    key={label}
                    onClick={() =>
                      selected ? setDraft(prompt) : setProjectDialogOpen(true)
                    }
                  >
                    <ClaudeMascotIcon variant={variant} />
                    <span>
                      <strong>{label}</strong>
                      <small>{prompt}</small>
                    </span>
                  </button>
                ))}
              </div>
              {!selected && (
                <button className="empty-project-button" onClick={() => setProjectDialogOpen(true)}>
                  <FolderPlus size={17} />
                  新建项目
                </button>
              )}
              </div>
            )}
          </section>
          {selected?.messages.length ? (
            <ConversationTimeline
              messages={selected.messages}
              activeMessageId={activeTimelineMessageId}
              onSelect={scrollToTimelineMessage}
            />
          ) : null}
        </div>

        <div className="composer-zone">
          <div className={`composer ${active ? "composer-active" : ""}`}>
            {screenshotAttachment && (
              <div className="composer-attachment">
                <img src={screenshotAttachment.dataUrl} alt="截图预览" />
                <span>截图已附加，可直接发送</span>
                <button
                  type="button"
                  onClick={() => setScreenshotAttachment(null)}
                  aria-label="移除截图"
                  title="移除截图"
                >
                  <X size={13} />
                </button>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={draft}
              disabled={!selected}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
              onContextMenu={(event) => void openComposerContextMenu(event)}
              placeholder={
                !selected
                  ? "请先新建或选择项目"
                  : active
                    ? `继续补充「${currentProjectName}」中的任务要求…`
                    : `想在「${currentProjectName}」中做些什么？`
              }
              rows={1}
            />
            <div className="composer-toolbar">
              <div>
                <button
                  className="toolbar-project"
                  onClick={() => setProjectDialogOpen(true)}
                  disabled={!selected}
                  title={
                    selected
                      ? `当前项目：${currentProjectName}\n工作目录：${selected.cwd}\n点击新建另一个项目`
                      : "请先新建项目"
                  }
                >
                  <FolderOpen size={17} />
                  <span>{selected ? currentProjectName : "项目"}</span>
                </button>
                <button
                  type="button"
                  className="toolbar-screenshot"
                  onClick={() => void openScreenCapture()}
                  disabled={!selected}
                  title="截图并附加（Ctrl + Shift + 4）"
                  aria-label="截图并附加"
                >
                  <Camera size={15} />
                </button>
                {selected && (
                  <ComposerTuningControls
                    session={selected}
                    modelCatalog={modelCatalog}
                    disabled={active}
                    onUpdate={updateSession}
                  />
                )}
              </div>
              <div className="composer-actions">
                <button
                  type="button"
                  className={`balance-button balance-${balance?.status ?? "loading"}`}
                  onClick={() => void refreshBalance(true)}
                  disabled={balanceLoading}
                  title={balanceHint(balance)}
                  aria-label="手动查询余额"
                >
                  <Wallet size={14} />
                  <span className="balance-copy">
                    <strong>余额 {balanceDisplay(balance)}</strong>
                    <small>{balance?.provider || "余额查询"} · 自动查询</small>
                  </span>
                  <RefreshCw size={12} className={balanceLoading ? "spin" : ""} />
                </button>
                {selected && (
                  <div
                    className={`context-meter ${contextTone}`}
                    title={`当前上下文输入 ${formatTokens(contextInput)} Token${contextWindow ? `，窗口 ${formatTokens(contextWindow)}` : "，窗口上限等待模型返回"}；最近输出 ${formatTokens(selected.contextUsage.outputTokens)} Token`}
                  >
                    <span className="context-orb" aria-hidden="true">
                      <svg viewBox="0 0 36 36">
                        <circle className="context-ring-base" cx="18" cy="18" r="14" pathLength="100" />
                        <circle
                          className="context-ring-value"
                          cx="18"
                          cy="18"
                          r="14"
                          pathLength="100"
                          style={{ strokeDashoffset: 100 - contextPercent }}
                        />
                      </svg>
                      <em>{contextWindow ? Math.round(contextPercent) : "—"}</em>
                    </span>
                    <span className="context-copy">
                      <strong>上下文</strong>
                      <small>
                        {contextWindow
                          ? `${formatTokens(contextInput)} / ${formatTokens(contextWindow)}`
                          : contextInput
                            ? `${formatTokens(contextInput)} Token`
                            : "等待统计"}
                      </small>
                    </span>
                  </div>
                )}
                {active && selected ? (
                  <>
                    <button
                      className="send-button queue-button"
                      onClick={() => void send()}
                      disabled={!draft.trim() && !screenshotAttachment}
                      title="加入后续队列 (Enter)"
                      aria-label="加入后续队列"
                    >
                      <CornerDownRight size={16} />
                    </button>
                    <button
                      className="send-button stop-button"
                      onClick={() =>
                        void window.claudeUI.stopMessage(selected.id).catch(reportError)
                      }
                      title="停止当前回复"
                      aria-label="停止 Claude 当前回复"
                    >
                      <Square size={14} fill="currentColor" />
                    </button>
                  </>
                ) : (
                  <button
                    className="send-button"
                    onClick={() => void send()}
                    disabled={!selected || (!draft.trim() && !screenshotAttachment)}
                    title="发送 (Enter)"
                    aria-label="发送消息"
                  >
                    <Send size={17} />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="composer-caption">
            {active
              ? `当前回复进行中 · Enter 加入后续队列${queuedCount ? ` · 已排队 ${queuedCount} 条` : ""}`
              : "Enter 发送 · Shift + Enter 换行 · 模型、强度和权限从下一条回复开始生效"}
          </div>
        </div>
      </main>

      {composerContextMenu && (
        <div
          className="composer-context-menu"
          role="menu"
          aria-label="输入框编辑菜单"
          style={{ left: composerContextMenu.x, top: composerContextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void copyComposerSelection()}
            disabled={!composerContextMenu.selectionText}
          >
            <Copy size={14} />
            <span>复制</span>
            <kbd>Ctrl C</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={pasteIntoComposer}
            disabled={!composerContextMenu.clipboardText}
          >
            <ClipboardPaste size={14} />
            <span>粘贴</span>
            <kbd>Ctrl V</kbd>
          </button>
          <span className="context-menu-separator" />
          <button
            type="button"
            role="menuitem"
            onClick={selectAllComposerText}
            disabled={!draft}
          >
            <TextSelect size={14} />
            <span>全选</span>
            <kbd>Ctrl A</kbd>
          </button>
        </div>
      )}

      {settingsOpen && (
        <SettingsPanel
          state={state}
          modelCatalog={modelCatalog}
          claudeStatus={claudeStatus}
          onClose={() => setSettingsOpen(false)}
          onUpdate={updateSettings}
        />
      )}

      {projectDialogOpen && (
        <NewProjectDialog
          defaultCwd={state.settings.defaultCwd}
          onClose={() => setProjectDialogOpen(false)}
          onCreate={createProject}
        />
      )}

      {screenCaptureOpen && (
        <ScreenCaptureDialog
          onClose={() => setScreenCaptureOpen(false)}
          onCaptured={(value) => setScreenshotAttachment(value)}
        />
      )}
      {visionKeyDialogOpen && (
        <VisionKeyDialog
          onClose={() => setVisionKeyDialogOpen(false)}
          onSaved={() => {
            setVisionKeyDialogOpen(false);
            setScreenCaptureOpen(true);
          }}
        />
      )}

      {deleteTarget && (
        <DeleteConversationDialog
          session={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmRemoveSession}
        />
      )}

      {toast && (
        <div className="toast">
          <CircleAlert size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
