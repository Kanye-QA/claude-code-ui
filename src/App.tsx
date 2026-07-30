import {
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Folder,
  FolderOpen,
  Menu,
  MessageSquareText,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Square,
  Sun,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import MarkdownMessage from "./components/MarkdownMessage";
import ToolCard from "./components/ToolCard";
import ComposerTuningControls, {
  commonModels,
  effortInfo,
  modeInfo,
} from "./components/ComposerTuningControls";
import type {
  AppSettings,
  AppState,
  ChatMessage,
  ChatSession,
  ClaudeStatus,
  EffortLevel,
  PermissionMode,
} from "./types";

const emptyState: AppState = {
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
        <Sparkles size={16} />
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

export default function App() {
  const [state, setState] = useState<AppState>(emptyState);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [claudeStatus, setClaudeStatus] = useState<ClaudeStatus | null>(null);
  const [toast, setToast] = useState<string>("");
  const initialized = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selected = state.sessions.find((session) => session.id === selectedId);
  const active = selected ? state.activeSessionIds.includes(selected.id) : false;
  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return state.sessions;
    return state.sessions.filter(
      (session) =>
        session.title.toLowerCase().includes(query) ||
        session.cwd.toLowerCase().includes(query),
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
        } else if (!initialized.current) {
          initialized.current = true;
          const created = await window.claudeUI.createSession();
          setSelectedId(created.id);
        }
      })
      .catch(reportError);
    dispose = window.claudeUI.onStateChanged((next) => setState(next));
    void window.claudeUI.claudeStatus().then(setClaudeStatus).catch(reportError);
    return () => dispose();
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

  const createSession = async () => {
    try {
      const session = await window.claudeUI.createSession();
      setSelectedId(session.id);
      setDraft("");
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (error) {
      reportError(error);
    }
  };

  const removeSession = async (session: ChatSession) => {
    if (!window.confirm(`删除会话“${session.title}”？\n只删除 UI 历史，不会删除项目文件。`)) {
      return;
    }
    try {
      await window.claudeUI.deleteSession(session.id);
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
      if (commandKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        void createSession();
      } else if (commandKey && event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      } else if (event.key === "Escape" && settingsOpen) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [settingsOpen]);

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-visible" : "sidebar-hidden"}`}>
      <div className="window-drag-region" />
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">
            <Sparkles size={17} />
          </div>
          <span>Claude Code</span>
          <button
            className="icon-button sidebar-toggle"
            onClick={() => setSidebarOpen(false)}
            aria-label="收起侧边栏"
          >
            <PanelLeftClose size={17} />
          </button>
        </div>

        <button className="new-chat" onClick={() => void createSession()}>
          <Plus size={17} />
          新会话
          <span>Ctrl N</span>
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

        <div className="session-label">最近</div>
        <nav className="session-list">
          {filteredSessions.map((session) => (
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
                  <small>{tail(session.cwd)} · {relativeTime(session.updatedAt)}</small>
                </span>
              </button>
              {state.activeSessionIds.includes(session.id) ? (
                <span className="live-dot" />
              ) : (
                <button
                  className="delete-session"
                  aria-label={`删除会话：${session.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void removeSession(session);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
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
            <strong>{selected?.title || "Claude Code UI"}</strong>
            {selected && (
              <button className="folder-chip" onClick={chooseFolder} disabled={active}>
                <Folder size={13} />
                {tail(selected.cwd)}
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
                <Sparkles size={28} />
              </div>
              <h1>今天想做点什么？</h1>
              <p>Claude Code 已通过 CC Switch 接入。选择项目文件夹，然后像聊天一样描述任务。</p>
              <div className="quick-actions">
                {[
                  ["解释这个项目", "先浏览当前项目，告诉我它的结构、用途和启动方式。"],
                  ["排查一个问题", "帮我检查当前项目的问题，先分析原因再提出修复方案。"],
                  ["实现新功能", "请阅读当前项目，并帮我实现下面这个功能："],
                ].map(([label, prompt]) => (
                  <button key={label} onClick={() => setDraft(prompt)}>
                    <Sparkles size={15} />
                    <span>
                      <strong>{label}</strong>
                      <small>{prompt}</small>
                    </span>
                  </button>
                ))}
              </div>
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

      {toast && (
        <div className="toast">
          <CircleAlert size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
