import {
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Folder,
  FolderOpen,
  FolderPlus,
  Menu,
  MessageSquareText,
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
} from "react";
import MarkdownMessage from "./components/MarkdownMessage";
import ToolCard from "./components/ToolCard";
import ClaudeMascotIcon, {
  type ClaudeMascotVariant,
} from "./components/ClaudeMascotIcon";
import ComposerTuningControls, {
  commonModels,
  effortInfo,
  modeInfo,
} from "./components/ComposerTuningControls";
import type {
  AppSettings,
  AppState,
  BalanceStatus,
  ChatMessage,
  ChatSession,
  ClaudeStatus,
  EffortLevel,
  PermissionMode,
  Project,
} from "./types";

const emptyState: AppState = {
  projects: [],
  sessions: [],
  settings: {
    defaultCwd: "",
    defaultPermissionMode: "auto",
    defaultEffort: "",
    requestedModel: "",
    claudePath: "",
    theme: "system",
  },
  activeSessionIds: [],
};

function tail(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || path || "选择项目";
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

function displayModel(session?: ChatSession): string {
  return session?.requestedModel || session?.activeModel || "跟随 CC Switch";
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
  if (message.role === "user") {
    return (
      <article className="message user-message">
        <div className="user-bubble">{message.content}</div>
      </article>
    );
  }

  const isEmptyStreaming = message.status === "streaming" && !message.content;
  return (
      <article className="message assistant-message">
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
      </div>
    </article>
  );
}

interface SettingsPanelProps {
  state: AppState;
  claudeStatus: ClaudeStatus | null;
  onClose(): void;
  onUpdate(patch: Partial<AppSettings>): Promise<void>;
}

function SettingsPanel({ state, claudeStatus, onClose, onUpdate }: SettingsPanelProps) {
  const [model, setModel] = useState(state.settings.requestedModel);
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

          <div className="setting-group">
            <label htmlFor="default-mode">默认权限模式</label>
            <select
              id="default-mode"
              value={state.settings.defaultPermissionMode}
              onChange={(event) =>
                void onUpdate({ defaultPermissionMode: event.target.value as PermissionMode })
              }
            >
              {Object.entries(modeInfo).map(([value, info]) => (
                <option key={value} value={value}>
                  {info.label} — {info.description}
                </option>
              ))}
            </select>
          </div>

          <div className="setting-group">
            <label htmlFor="default-effort">默认响应速度</label>
            <select
              id="default-effort"
              value={state.settings.defaultEffort}
              onChange={(event) =>
                void onUpdate({ defaultEffort: event.target.value as EffortLevel })
              }
            >
              {Object.entries(effortInfo).map(([value, info]) => (
                <option key={value} value={value}>
                  {info.label} — {info.description}
                </option>
              ))}
            </select>
            <p>这里控制的是思考强度；越快通常越省 Token，复杂任务可选“深入”。</p>
          </div>

          <div className="setting-group">
            <label htmlFor="model">默认模型</label>
            <div className="input-save-row">
              <input
                id="model"
                list="claude-model-options"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="留空：跟随 CC Switch 当前模型"
              />
              <button onClick={() => void onUpdate({ requestedModel: model })}>保存</button>
            </div>
            <datalist id="claude-model-options">
              {commonModels
                .filter((option) => option.value)
                .map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
            </datalist>
            <p>建议留空，这样切换 CC Switch 后无需修改这里。</p>
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
            <div className="theme-options">
              {(
                [
                  ["system", "跟随系统", Menu],
                  ["light", "浅色", Sun],
                  ["dark", "深色", Moon],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  className={state.settings.theme === value ? "selected" : ""}
                  onClick={() => void onUpdate({ theme: value })}
                >
                  <Icon size={16} />
                  {label}
                  {state.settings.theme === value && <Check size={14} />}
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
    if (folder) {
      setCwd(folder);
      if (!name.trim()) setName(tail(folder));
    }
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
      await onCreate({ name: name.trim() || tail(cwd), cwd });
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
            项目名称
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：网站改版"
            />
          </label>
          <label>
            项目文件夹
            <button className="dialog-path-picker" type="button" onClick={() => void chooseFolder()}>
              <FolderOpen size={16} />
              <span>{cwd || "选择文件夹"}</span>
            </button>
          </label>
          <p className="dialog-hint">创建后会自动在这个项目下新建第一段会话。</p>
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

export default function App() {
  const [state, setState] = useState<AppState>(emptyState);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
  const [renamingSession, setRenamingSession] = useState<ChatSession | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [claudeStatus, setClaudeStatus] = useState<ClaudeStatus | null>(null);
  const [balance, setBalance] = useState<BalanceStatus | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [toast, setToast] = useState<string>("");
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selected = state.sessions.find((session) => session.id === selectedId);
  const selectedProject = selected
    ? state.projects.find((project) => project.id === selected.projectId)
    : undefined;
  const active = selected ? state.activeSessionIds.includes(selected.id) : false;
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
    let dispose = () => {};
    void window.claudeUI
      .getState()
      .then(async (next) => {
        setState(next);
        const remembered = window.localStorage.getItem("selected-session");
        if (remembered && next.sessions.some((session) => session.id === remembered)) {
          setSelectedId(remembered);
        } else if (next.sessions[0]) {
          setSelectedId(next.sessions[0].id);
        }
      })
      .catch(reportError);
    dispose = window.claudeUI.onStateChanged((next) => setState(next));
    void window.claudeUI.claudeStatus().then(setClaudeStatus).catch(reportError);
    return () => dispose();
  }, []);

  useEffect(() => {
    void refreshBalance();
    const timer = window.setInterval(() => void refreshBalance(), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedId) window.localStorage.setItem("selected-session", selectedId);
  }, [selectedId]);

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
    endRef.current?.scrollIntoView({ behavior: active ? "auto" : "smooth" });
  }, [active, selected?.messages]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 190)}px`;
  }, [draft]);

  const createSession = async (project = selectedProject) => {
    if (!project) {
      setProjectDialogOpen(true);
      return;
    }
    try {
      const session = await window.claudeUI.createSession({
        projectId: project.id,
        cwd: project.cwd,
      });
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
      await createSession(project);
    } catch (error) {
      reportError(error);
      throw error;
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

  const send = async () => {
    if (!selected || active || !draft.trim()) return;
    const prompt = draft;
    try {
      await window.claudeUI.sendMessage(selected.id, prompt);
      setDraft("");
    } catch (error) {
      reportError(error);
    }
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

  const chooseFolder = async () => {
    if (!selected || active) return;
    try {
      const folder = await window.claudeUI.selectDirectory(selected.cwd);
      if (folder) await window.claudeUI.updateSession(selected.id, { cwd: folder });
    } catch (error) {
      reportError(error);
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
      } else if (event.key === "Escape" && renamingSession) {
        setRenamingSession(null);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [projectDialogOpen, renamingSession, settingsOpen, selectedProject]);

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

        <div className="session-label">项目与会话</div>
        <nav className="session-list">
          {projectGroups.map(({ project, sessions }) => (
            <section className="project-group" key={project.id}>
              <header className="project-heading">
                <span className="project-name" title={project.cwd}>
                  <Folder size={14} />
                  <strong>{project.name}</strong>
                </span>
                <button
                  className="project-new-chat"
                  onClick={() => void createSession(project)}
                  title={`在“${project.name}”中新建会话`}
                  aria-label={`在“${project.name}”中新建会话`}
                >
                  <Plus size={15} />
                </button>
              </header>
              {sessions.length ? (
                sessions.map((session) => (
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
                ))
              ) : (
                <button className="project-empty" onClick={() => void createSession(project)}>
                  <Plus size={13} /> 新建第一段会话
                </button>
              )}
            </section>
          ))}
          {!projectGroups.length && (
            <div className="sidebar-empty">没有匹配的项目或会话</div>
          )}
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
              <button className="folder-chip" onClick={chooseFolder} disabled={active}>
                <Folder size={13} />
                {tail(selectedProject?.cwd || selected.cwd)}
              </button>
            )}
          </div>
          <div className="topbar-actions">
            {selected && (
              <>
                <div className="model-pill">
                  <Bot size={14} />
                  {displayModel(selected)}
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

        <section className="conversation">
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
              <h1>{selected ? "今天想做点什么？" : "从一个项目开始"}</h1>
              <p>
                {selected
                  ? "Claude Code 已通过 CC Switch 接入。选择项目文件夹，然后像聊天一样描述任务。"
                  : "项目会集中保存同一文件夹下的会话，让每个任务都有清晰的上下文。"}
              </p>
              {!selected ? (
                <button className="empty-project-button" onClick={() => setProjectDialogOpen(true)}>
                  <FolderPlus size={17} />
                  新建第一个项目
                </button>
              ) : (
                <div className="quick-actions">
                {(
                  [
                    ["解释这个项目", "先浏览当前项目，告诉我它的结构、用途和启动方式。", "explain"],
                    ["排查一个问题", "帮我检查当前项目的问题，先分析原因再提出修复方案。", "debug"],
                    ["实现新功能", "请阅读当前项目，并帮我实现下面这个功能：", "build"],
                  ] satisfies Array<[string, string, ClaudeMascotVariant]>
                ).map(([label, prompt, variant]) => (
                  <button key={label} onClick={() => setDraft(prompt)}>
                    <ClaudeMascotIcon variant={variant} />
                    <span>
                      <strong>{label}</strong>
                      <small>{prompt}</small>
                    </span>
                  </button>
                ))}
                </div>
              )}
            </div>
          )}
        </section>

        <div className="composer-zone">
          <div className={`composer ${active ? "composer-active" : ""}`}>
            <textarea
              ref={textareaRef}
              value={draft}
              disabled={!selected || active}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder={active ? "Claude 正在处理…" : "给 Claude Code 发送消息"}
              rows={1}
            />
            <div className="composer-toolbar">
              <div>
                <button
                  className="toolbar-project"
                  onClick={chooseFolder}
                  disabled={!selected || active}
                  title="选择项目文件夹"
                >
                  <FolderOpen size={17} />
                  <span>{selected ? tail(selected.cwd) : "项目"}</span>
                </button>
                {selected && (
                  <ComposerTuningControls
                    session={selected}
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
                    <span>
                      {contextWindow
                        ? `上下文 ${Math.round(contextPercent)}%`
                        : contextInput
                          ? `上下文 ${formatTokens(contextInput)}`
                          : "上下文 —"}
                    </span>
                    {contextWindow > 0 && (
                      <span className="context-track">
                        <i style={{ width: `${contextPercent}%` }} />
                      </span>
                    )}
                  </div>
                )}
                {active && selected ? (
                  <button
                    className="send-button stop-button"
                    onClick={() => void window.claudeUI.stopMessage(selected.id)}
                    title="停止"
                    aria-label="停止 Claude"
                  >
                    <Square size={14} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    className="send-button"
                    onClick={() => void send()}
                    disabled={!selected || !draft.trim()}
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
            Enter 发送 · Shift + Enter 换行 · 模型、强度和权限从下一条回复开始生效
          </div>
        </div>
      </main>

      {settingsOpen && (
        <SettingsPanel
          state={state}
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
