import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
} from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

type PermissionMode = "plan" | "auto" | "acceptEdits" | "dontAsk";
type EffortLevel = "" | "low" | "medium" | "high" | "xhigh" | "max";
type MessageStatus = "streaming" | "complete" | "error" | "stopped";
type ToolStatus = "running" | "success" | "error";

interface ContextUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  contextWindowTokens: number;
}

interface ToolCall {
  id: string;
  name: string;
  input: unknown;
  inputBuffer?: string;
  output?: string;
  status: ToolStatus;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  createdAt: string;
  status: MessageStatus;
  toolCalls?: ToolCall[];
  error?: string;
  costUsd?: number;
  durationMs?: number;
}

interface ChatSession {
  id: string;
  projectId: string;
  title: string;
  titleEdited?: boolean;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  started: boolean;
  permissionMode: PermissionMode;
  requestedModel?: string;
  activeModel?: string;
  status: "idle" | "starting" | "thinking" | "working" | "error";
  effort: EffortLevel;
  contextUsage: ContextUsage;
  messages: ChatMessage[];
}

interface Project {
  id: string;
  name: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
}

interface AppSettings {
  defaultCwd: string;
  defaultPermissionMode: PermissionMode;
  defaultEffort: EffortLevel;
  requestedModel: string;
  claudePath: string;
  theme: "system" | "light" | "dark";
}

interface BalanceEntry {
  currency: string;
  total: string;
  granted?: string;
  toppedUp?: string;
}

interface BalanceStatus {
  status: "ok" | "unavailable" | "unsupported" | "error";
  provider: string;
  available: boolean;
  balances: BalanceEntry[];
  checkedAt: string;
  error?: string;
}

interface AppStore {
  version: 2;
  projects: Project[];
  sessions: ChatSession[];
  settings: AppSettings;
}

interface ActiveJob {
  child: ChildProcessWithoutNullStreams;
  assistantMessageId: string;
  stopped: boolean;
  stderr: string;
  blockTypes: Map<number, string>;
  blockToolIds: Map<number, string>;
}

let mainWindow: BrowserWindow | null = null;
let store: AppStore;
let storePath = "";
const activeJobs = new Map<string, ActiveJob>();
const syncTimers = new Map<string, NodeJS.Timeout>();
let saveTimer: NodeJS.Timeout | null = null;
const previewMode = process.env.CLAUDE_UI_MOCK === "1";

const effortLevels: EffortLevel[] = ["", "low", "medium", "high", "xhigh", "max"];

function now(): string {
  return new Date().toISOString();
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isEffortLevel(value: unknown): value is EffortLevel {
  return typeof value === "string" && effortLevels.includes(value as EffortLevel);
}

function emptyContextUsage(): ContextUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    contextWindowTokens: 0,
  };
}

function normalizeContextUsage(value: unknown): ContextUsage {
  const defaults = emptyContextUsage();
  if (!value || typeof value !== "object") return defaults;
  const input = value as Partial<ContextUsage>;
  return {
    inputTokens: Number.isFinite(input.inputTokens) ? Math.max(0, input.inputTokens!) : 0,
    outputTokens: Number.isFinite(input.outputTokens) ? Math.max(0, input.outputTokens!) : 0,
    cacheCreationInputTokens: Number.isFinite(input.cacheCreationInputTokens)
      ? Math.max(0, input.cacheCreationInputTokens!)
      : 0,
    cacheReadInputTokens: Number.isFinite(input.cacheReadInputTokens)
      ? Math.max(0, input.cacheReadInputTokens!)
      : 0,
    contextWindowTokens:
      Number.isFinite(input.contextWindowTokens) && input.contextWindowTokens! > 0
        ? input.contextWindowTokens!
        : defaults.contextWindowTokens,
  };
}

function defaultStore(): AppStore {
  const documents = app.getPath("documents");
  const base: AppStore = {
    version: 2,
    projects: [],
    sessions: [],
    settings: {
      defaultCwd: documents,
      defaultPermissionMode: "auto",
      defaultEffort: "",
      requestedModel: "",
      claudePath: "",
      theme: "system",
    },
  };
  if (!previewMode) return base;

  const timestamp = now();
  const project: Project = {
    id: "preview-project",
    name: "Claude Code UI",
    cwd: process.cwd(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return {
    ...base,
    projects: [project],
    settings: { ...base.settings, defaultCwd: process.cwd(), theme: "dark" },
    sessions: [
      {
        id: "preview-conversation-a",
        projectId: project.id,
        title: "1.0 版本优化规划",
        titleEdited: true,
        cwd: project.cwd,
        createdAt: timestamp,
        updatedAt: timestamp,
        started: false,
        permissionMode: "auto",
        effort: "",
        contextUsage: emptyContextUsage(),
        status: "idle",
        messages: [],
      },
      {
        id: "preview-conversation-b",
        projectId: project.id,
        title: "排查删除窗口样式",
        titleEdited: true,
        cwd: project.cwd,
        createdAt: timestamp,
        updatedAt: timestamp,
        started: false,
        permissionMode: "auto",
        effort: "",
        contextUsage: emptyContextUsage(),
        status: "idle",
        messages: [],
      },
    ],
  };
}

function projectNameFromPath(cwd: string): string {
  return basename(cwd) || cwd || "未命名项目";
}

function createProjectRecord(name: string, cwd: string): Project {
  const timestamp = now();
  return {
    id: randomUUID(),
    name: name.trim() || projectNameFromPath(cwd),
    cwd,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function projectById(id: string): Project {
  const project = store.projects.find((item) => item.id === id);
  if (!project) throw new Error("项目不存在，请重新选择项目后再试。");
  return project;
}

function loadStore(): AppStore {
  storePath = join(app.getPath("userData"), "sessions.json");
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8")) as Omit<
      AppStore,
      "version" | "projects"
    > & {
      version: number;
      projects?: Project[];
    };
    if ((parsed.version !== 1 && parsed.version !== 2) || !Array.isArray(parsed.sessions)) {
      return defaultStore();
    }
    const defaults = defaultStore();
    parsed.settings = { ...defaults.settings, ...parsed.settings };
    const projects = Array.isArray(parsed.projects)
      ? parsed.projects
          .filter(
            (project): project is Project =>
              Boolean(project) &&
              typeof project.id === "string" &&
              typeof project.name === "string" &&
              typeof project.cwd === "string",
          )
          .map((project) => ({
            ...project,
            name: project.name.trim() || projectNameFromPath(project.cwd),
            createdAt: project.createdAt || now(),
            updatedAt: project.updatedAt || now(),
          }))
      : [];
    const projectForCwd = (cwd: string): Project => {
      const existing = projects.find((project) => project.cwd === cwd);
      if (existing) return existing;
      const project = createProjectRecord(projectNameFromPath(cwd), cwd);
      projects.push(project);
      return project;
    };
    parsed.sessions = parsed.sessions.map((session) => {
      const normalizedCwd = typeof session.cwd === "string" ? session.cwd : defaults.settings.defaultCwd;
      const existingProject = projects.find((project) => project.id === session.projectId);
      const project = existingProject ?? projectForCwd(normalizedCwd);
      return {
      ...session,
      projectId: project.id,
      cwd: normalizedCwd,
      titleEdited: Boolean(session.titleEdited),
      status: "idle",
      permissionMode: session.permissionMode ?? "auto",
      effort: isEffortLevel(session.effort)
        ? session.effort
        : parsed.settings.defaultEffort,
      contextUsage: normalizeContextUsage(session.contextUsage),
      messages: Array.isArray(session.messages)
        ? session.messages.map((message) =>
            message.status === "streaming"
              ? { ...message, status: "stopped" as MessageStatus }
              : message,
          )
        : [],
      };
    });
    return { ...parsed, version: 2, projects };
  } catch {
    return defaultStore();
  }
}

function saveStoreNow(): void {
  if (!storePath) return;
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveStoreNow();
  }, 250);
}

function sessionById(id: string): ChatSession {
  const session = store.sessions.find((item) => item.id === id);
  if (!session) throw new Error("会话不存在。请新建一个会话后重试。");
  return session;
}

function assistantMessage(session: ChatSession, id: string): ChatMessage {
  const message = session.messages.find((item) => item.id === id);
  if (!message) throw new Error("找不到当前回复。");
  return message;
}

function publicState() {
  return {
    projects: [...store.projects].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    sessions: [...store.sessions].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    ),
    settings: store.settings,
    activeSessionIds: [...activeJobs.keys()],
  };
}

function emitState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("state:changed", publicState());
}

function scheduleSync(sessionId: string, immediate = false): void {
  scheduleSave();
  const existing = syncTimers.get(sessionId);
  if (immediate) {
    if (existing) clearTimeout(existing);
    syncTimers.delete(sessionId);
    emitState();
    return;
  }
  if (existing) return;
  const timer = setTimeout(() => {
    syncTimers.delete(sessionId);
    emitState();
  }, 55);
  syncTimers.set(sessionId, timer);
}

function resolveClaudeExecutable(): string {
  const custom = store.settings.claudePath.trim();
  if (custom && existsSync(custom)) return custom;

  const appData = process.env.APPDATA;
  const candidates = [
    appData
      ? join(
          appData,
          "npm",
          "node_modules",
          "@anthropic-ai",
          "claude-code",
          "bin",
          "claude.exe",
        )
      : "",
    appData ? join(appData, "npm", "claude.cmd") : "",
  ].filter(Boolean);

  const match = candidates.find((candidate) => existsSync(candidate));
  return match ?? "claude";
}

function balanceResult(
  status: BalanceStatus["status"],
  provider: string,
  available: boolean,
  balances: BalanceEntry[] = [],
  error?: string,
): BalanceStatus {
  return { status, provider, available, balances, checkedAt: now(), error };
}

async function queryBalance(): Promise<BalanceStatus> {
  if (previewMode) {
    return balanceResult("ok", "DeepSeek", true, [
      { currency: "CNY", total: "28.60", granted: "3.60", toppedUp: "25.00" },
    ]);
  }

  const settingsPath = join(app.getPath("home"), ".claude", "settings.json");
  let env: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    env = parsed.env && typeof parsed.env === "object" ? (parsed.env as Record<string, unknown>) : null;
  } catch {
    return balanceResult("error", "当前供应商", false, [], "未找到可读取的 Claude 配置。");
  }

  const baseUrl = typeof env?.ANTHROPIC_BASE_URL === "string" ? env.ANTHROPIC_BASE_URL : "";
  const token =
    typeof env?.ANTHROPIC_AUTH_TOKEN === "string"
      ? env.ANTHROPIC_AUTH_TOKEN
      : typeof env?.ANTHROPIC_API_KEY === "string"
        ? env.ANTHROPIC_API_KEY
        : "";
  if (!baseUrl || !token) {
    return balanceResult("error", "当前供应商", false, [], "配置中缺少查询余额所需的凭据。");
  }

  let endpoint: URL;
  try {
    const configured = new URL(baseUrl);
    if (configured.hostname.toLowerCase() !== "api.deepseek.com") {
      return balanceResult(
        "unsupported",
        configured.hostname,
        false,
        [],
        "当前供应商暂未提供自动余额查询。",
      );
    }
    endpoint = new URL("/user/balance", configured.origin);
  } catch {
    return balanceResult("error", "当前供应商", false, [], "供应商地址格式不正确。");
  }

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return balanceResult("error", "DeepSeek", false, [], `查询失败（${response.status}）。`);
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const rawBalances = Array.isArray(payload.balance_infos) ? payload.balance_infos : [];
    const balances = rawBalances.flatMap((item): BalanceEntry[] => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (typeof row.currency !== "string" || row.total_balance === undefined) return [];
      return [
        {
          currency: row.currency,
          total: String(row.total_balance),
          granted: row.granted_balance === undefined ? undefined : String(row.granted_balance),
          toppedUp: row.topped_up_balance === undefined ? undefined : String(row.topped_up_balance),
        },
      ];
    });
    return balanceResult("ok", "DeepSeek", payload.is_available === true, balances);
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError" ? "查询超时，请稍后手动刷新。" : "余额服务暂时不可用。";
    return balanceResult("error", "DeepSeek", false, [], message);
  }
}

function titleFromPrompt(prompt: string): string {
  const compact = prompt.replace(/\s+/g, " ").trim();
  if (!compact) return "新会话";
  return compact.length > 28 ? `${compact.slice(0, 28)}…` : compact;
}

function toolById(message: ChatMessage, id: string): ToolCall | undefined {
  return message.toolCalls?.find((tool) => tool.id === id);
}

function stringifyToolOutput(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 12_000);
  try {
    return JSON.stringify(value, null, 2).slice(0, 12_000);
  } catch {
    return String(value).slice(0, 12_000);
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function numericField(
  value: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return Math.max(0, candidate);
    }
  }
  return undefined;
}

function applyUsage(session: ChatSession, value: unknown): void {
  const usage = record(value);
  if (!usage) return;
  const next = { ...session.contextUsage };
  let changed = false;

  const input = numericField(usage, "input_tokens", "inputTokens");
  const output = numericField(usage, "output_tokens", "outputTokens");
  const cacheCreation = numericField(
    usage,
    "cache_creation_input_tokens",
    "cacheCreationInputTokens",
  );
  const cacheRead = numericField(
    usage,
    "cache_read_input_tokens",
    "cacheReadInputTokens",
  );

  if (input !== undefined) {
    next.inputTokens = input;
    changed = true;
  }
  if (output !== undefined) {
    next.outputTokens = output;
    changed = true;
  }
  if (cacheCreation !== undefined) {
    next.cacheCreationInputTokens = cacheCreation;
    changed = true;
  }
  if (cacheRead !== undefined) {
    next.cacheReadInputTokens = cacheRead;
    changed = true;
  }
  if (changed) session.contextUsage = next;
}

function applyContextWindow(session: ChatSession, value: unknown): void {
  const context = record(value);
  if (!context) return;
  const windowTokens = numericField(
    context,
    "context_window_size",
    "contextWindowTokens",
    "contextWindow",
  );
  if (windowTokens && windowTokens > 0) {
    session.contextUsage.contextWindowTokens = windowTokens;
  }

  const current = record(context.current_usage ?? context.currentUsage);
  if (current) {
    applyUsage(session, current);
    return;
  }

  const totalInput = numericField(context, "total_input_tokens", "totalInputTokens");
  const totalOutput = numericField(context, "total_output_tokens", "totalOutputTokens");
  if (totalInput !== undefined) {
    session.contextUsage.inputTokens = totalInput;
    session.contextUsage.cacheCreationInputTokens = 0;
    session.contextUsage.cacheReadInputTokens = 0;
  }
  if (totalOutput !== undefined) session.contextUsage.outputTokens = totalOutput;
}

function updateContextFromEvent(
  session: ChatSession,
  event: Record<string, unknown>,
): void {
  applyContextWindow(session, event.context_window ?? event.contextWindow);

  const message = record(event.message);
  if (message) applyUsage(session, message.usage);

  const streamEvent = record(event.event);
  if (streamEvent) {
    const streamMessage = record(streamEvent.message);
    if (streamMessage) applyUsage(session, streamMessage.usage);
    applyUsage(session, streamEvent.usage);
  }

  const modelUsage = record(event.modelUsage ?? event.model_usage);
  if (modelUsage) {
    const preferred = session.activeModel ? record(modelUsage[session.activeModel]) : null;
    const entries = preferred ? [preferred] : Object.values(modelUsage).map(record).filter(Boolean);
    for (const usage of entries) {
      const windowTokens = numericField(
        usage!,
        "contextWindow",
        "context_window",
        "contextWindowTokens",
      );
      if (windowTokens && windowTokens > 0) {
        session.contextUsage.contextWindowTokens = windowTokens;
        break;
      }
    }
  }
}

function parseFullAssistantContent(message: ChatMessage, content: unknown): void {
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const item = block as Record<string, unknown>;
    if (item.type === "text" && !message.content && typeof item.text === "string") {
      message.content = item.text;
    }
    if (
      item.type === "thinking" &&
      !message.reasoning &&
      typeof item.thinking === "string"
    ) {
      message.reasoning = item.thinking;
    }
    if (item.type === "tool_use" && typeof item.id === "string") {
      message.toolCalls ??= [];
      const existing = toolById(message, item.id);
      if (existing) {
        existing.name = typeof item.name === "string" ? item.name : existing.name;
        existing.input = item.input ?? existing.input;
      } else {
        message.toolCalls.push({
          id: item.id,
          name: typeof item.name === "string" ? item.name : "Tool",
          input: item.input ?? {},
          status: "running",
        });
      }
    }
  }
}

function parseToolResults(message: ChatMessage, content: unknown): void {
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const item = block as Record<string, unknown>;
    if (item.type !== "tool_result" || typeof item.tool_use_id !== "string") continue;
    const tool = toolById(message, item.tool_use_id);
    if (!tool) continue;
    tool.status = item.is_error ? "error" : "success";
    tool.output = stringifyToolOutput(item.content ?? "");
  }
}

function handleClaudeEvent(
  session: ChatSession,
  message: ChatMessage,
  job: ActiveJob,
  event: Record<string, unknown>,
): void {
  updateContextFromEvent(session, event);
  const eventType = event.type;

  if (eventType === "system") {
    const subtype = event.subtype;
    if (subtype === "init") {
      session.started = true;
      session.status = "thinking";
      if (typeof event.model === "string") session.activeModel = event.model;
    } else if (subtype === "status") {
      const status = String(event.status ?? "");
      session.status = status === "requesting" ? "thinking" : "working";
    }
    scheduleSync(session.id);
    return;
  }

  if (eventType === "stream_event") {
    const streamEvent = event.event;
    if (!streamEvent || typeof streamEvent !== "object") return;
    const detail = streamEvent as Record<string, unknown>;
    const streamType = detail.type;
    const index = typeof detail.index === "number" ? detail.index : -1;

    if (streamType === "content_block_start") {
      const block = detail.content_block;
      if (block && typeof block === "object") {
        const blockInfo = block as Record<string, unknown>;
        const blockType = String(blockInfo.type ?? "");
        job.blockTypes.set(index, blockType);
        if (blockType === "tool_use" && typeof blockInfo.id === "string") {
          message.toolCalls ??= [];
          const tool: ToolCall = {
            id: blockInfo.id,
            name: typeof blockInfo.name === "string" ? blockInfo.name : "Tool",
            input: blockInfo.input ?? {},
            inputBuffer: "",
            status: "running",
          };
          if (!toolById(message, tool.id)) message.toolCalls.push(tool);
          job.blockToolIds.set(index, tool.id);
          session.status = "working";
        }
      }
    }

    if (streamType === "content_block_delta") {
      const delta = detail.delta;
      if (delta && typeof delta === "object") {
        const deltaInfo = delta as Record<string, unknown>;
        if (deltaInfo.type === "text_delta" && typeof deltaInfo.text === "string") {
          message.content += deltaInfo.text;
          session.status = "working";
        } else if (
          deltaInfo.type === "thinking_delta" &&
          typeof deltaInfo.thinking === "string"
        ) {
          message.reasoning = (message.reasoning ?? "") + deltaInfo.thinking;
          session.status = "thinking";
        } else if (
          deltaInfo.type === "input_json_delta" &&
          typeof deltaInfo.partial_json === "string"
        ) {
          const toolId = job.blockToolIds.get(index);
          const tool = toolId ? toolById(message, toolId) : undefined;
          if (tool) tool.inputBuffer = (tool.inputBuffer ?? "") + deltaInfo.partial_json;
        }
      }
    }

    if (streamType === "content_block_stop") {
      const toolId = job.blockToolIds.get(index);
      const tool = toolId ? toolById(message, toolId) : undefined;
      if (tool?.inputBuffer) {
        try {
          tool.input = JSON.parse(tool.inputBuffer);
        } catch {
          tool.input = tool.inputBuffer;
        }
        delete tool.inputBuffer;
      }
    }
    scheduleSync(session.id);
    return;
  }

  if (eventType === "assistant") {
    const assistant = event.message;
    if (assistant && typeof assistant === "object") {
      const assistantMessage = assistant as Record<string, unknown>;
      parseFullAssistantContent(message, assistantMessage.content);
      if (typeof assistantMessage.model === "string") {
        session.activeModel = assistantMessage.model;
      }
    }
    session.status = message.toolCalls?.some((tool) => tool.status === "running")
      ? "working"
      : "thinking";
    scheduleSync(session.id);
    return;
  }

  if (eventType === "user") {
    const user = event.message;
    if (user && typeof user === "object") {
      parseToolResults(message, (user as Record<string, unknown>).content);
    }
    scheduleSync(session.id);
    return;
  }

  if (eventType === "result") {
    const isError = Boolean(event.is_error) || String(event.subtype ?? "").startsWith("error");
    message.status = isError ? "error" : "complete";
    message.durationMs = typeof event.duration_ms === "number" ? event.duration_ms : undefined;
    message.costUsd =
      typeof event.total_cost_usd === "number" ? event.total_cost_usd : undefined;
    if (isError) {
      const errors = Array.isArray(event.errors) ? event.errors.join("\n") : "";
      message.error = errors || String(event.subtype ?? "Claude Code 返回了错误。");
      session.status = "error";
    } else {
      session.status = "idle";
    }
    session.started = true;
    scheduleSync(session.id, true);
  }
}

function finishJob(sessionId: string, exitCode: number | null): void {
  const job = activeJobs.get(sessionId);
  if (!job) return;
  const session = sessionById(sessionId);
  const message = assistantMessage(session, job.assistantMessageId);

  if (job.stopped) {
    message.status = "stopped";
    session.status = "idle";
  } else if (message.status === "streaming") {
    if (exitCode === 0 && message.content) {
      message.status = "complete";
      session.status = "idle";
      session.started = true;
    } else {
      message.status = "error";
      session.status = "error";
      const cleaned = job.stderr.trim().slice(-4_000);
      message.error = cleaned || `Claude Code 已退出（代码 ${exitCode ?? "未知"}）。`;
    }
  }

  for (const tool of message.toolCalls ?? []) {
    if (tool.status === "running") tool.status = job.stopped ? "error" : "success";
    delete tool.inputBuffer;
  }

  session.updatedAt = now();
  activeJobs.delete(sessionId);
  scheduleSync(sessionId, true);
}

function startClaude(session: ChatSession, prompt: string, assistantId: string): void {
  const executable = resolveClaudeExecutable();
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--permission-mode",
    session.permissionMode,
    "--prompt-suggestions",
    "false",
  ];

  if (session.requestedModel?.trim()) {
    args.push("--model", session.requestedModel.trim());
  }
  if (session.effort) args.push("--effort", session.effort);
  if (session.started) {
    args.push("--resume", session.id);
  } else {
    args.push("--session-id", session.id);
  }

  const child = spawn(executable, args, {
    cwd: session.cwd,
    env: {
      ...process.env,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      TERM: "dumb",
    },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const job: ActiveJob = {
    child,
    assistantMessageId: assistantId,
    stopped: false,
    stderr: "",
    blockTypes: new Map(),
    blockToolIds: new Map(),
  };
  activeJobs.set(session.id, job);

  let stdoutBuffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        handleClaudeEvent(session, assistantMessage(session, assistantId), job, parsed);
      } catch {
        // Claude Code occasionally emits a plain diagnostic line. Keep it out of
        // the conversation unless the process ultimately fails.
      }
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    job.stderr = (job.stderr + chunk).slice(-12_000);
  });

  child.on("error", (error) => {
    job.stderr = `${job.stderr}\n${error.message}`;
  });
  child.on("close", (code) => {
    if (stdoutBuffer.trim()) {
      try {
        const parsed = JSON.parse(stdoutBuffer) as Record<string, unknown>;
        handleClaudeEvent(session, assistantMessage(session, assistantId), job, parsed);
      } catch {
        // Handled by finishJob if no usable result arrived.
      }
    }
    finishJob(session.id, code);
  });

  child.stdin.end(prompt, "utf8");
  scheduleSync(session.id, true);
}

function registerIpc(): void {
  ipcMain.handle("state:get", () => publicState());

  ipcMain.handle("project:create", (_event, input: Pick<Project, "name" | "cwd">) => {
    const cwd = typeof input?.cwd === "string" ? resolve(input.cwd) : "";
    if (!cwd || !isDirectory(cwd)) throw new Error("请选择一个有效的项目文件夹。");
    const name = typeof input?.name === "string" ? input.name.trim() : "";
    const existing = store.projects.find((project) => project.cwd === cwd);
    if (existing) return existing;
    const project = createProjectRecord(name || projectNameFromPath(cwd), cwd);
    store.projects.push(project);
    scheduleSave();
    emitState();
    return project;
  });

  ipcMain.handle("session:create", (_event, input?: Partial<ChatSession>) => {
    const requestedCwd = input?.cwd && isDirectory(input.cwd) ? resolve(input.cwd) : store.settings.defaultCwd;
    const project = input?.projectId
      ? projectById(input.projectId)
      : store.projects.find((item) => item.cwd === requestedCwd) ?? (() => {
          const created = createProjectRecord(projectNameFromPath(requestedCwd), requestedCwd);
          store.projects.push(created);
          return created;
        })();
    const timestamp = now();
    const session: ChatSession = {
      id: randomUUID(),
      projectId: project.id,
      title: "新会话",
      titleEdited: false,
      cwd: isDirectory(project.cwd) ? project.cwd : app.getPath("documents"),
      createdAt: timestamp,
      updatedAt: timestamp,
      started: false,
      permissionMode: input?.permissionMode ?? store.settings.defaultPermissionMode,
      effort: isEffortLevel(input?.effort)
        ? input.effort
        : store.settings.defaultEffort,
      requestedModel: input?.requestedModel ?? store.settings.requestedModel,
      contextUsage: emptyContextUsage(),
      status: "idle",
      messages: [],
    };
    store.sessions.unshift(session);
    scheduleSync(session.id, true);
    return session;
  });

  ipcMain.handle("session:update", (_event, id: string, patch: Partial<ChatSession>) => {
    const session = sessionById(id);
    if (activeJobs.has(id)) throw new Error("Claude 正在回复，结束后再修改会话设置。");
    if (typeof patch.title === "string") {
      session.title = patch.title.trim() || "新会话";
      session.titleEdited = true;
    }
    if (typeof patch.cwd === "string") {
      const cwd = resolve(patch.cwd);
      if (!isDirectory(cwd)) throw new Error("所选项目文件夹不存在。");
      session.cwd = cwd;
    }
    if (
      patch.permissionMode &&
      ["plan", "auto", "acceptEdits", "dontAsk"].includes(patch.permissionMode)
    ) {
      session.permissionMode = patch.permissionMode;
    }
    if (isEffortLevel(patch.effort)) session.effort = patch.effort;
    if (typeof patch.requestedModel === "string") {
      const requestedModel = patch.requestedModel.trim();
      if (requestedModel !== (session.requestedModel ?? "")) {
        session.contextUsage.contextWindowTokens = 0;
      }
      session.requestedModel = requestedModel;
    }
    session.updatedAt = now();
    scheduleSync(id, true);
    return session;
  });

  ipcMain.handle("session:delete", (_event, id: string) => {
    if (activeJobs.has(id)) throw new Error("请先停止当前回复，再删除会话。");
    store.sessions = store.sessions.filter((session) => session.id !== id);
    scheduleSave();
    emitState();
    return true;
  });

  ipcMain.handle("chat:send", (_event, id: string, rawPrompt: string) => {
    const prompt = rawPrompt.trim();
    if (!prompt) throw new Error("请输入消息。");
    if (activeJobs.has(id)) throw new Error("Claude 仍在回复，请稍候或先停止。 ");
    const session = sessionById(id);
    if (!isDirectory(session.cwd)) throw new Error("当前项目文件夹不存在，请重新选择。");

    const timestamp = now();
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: "user",
      content: prompt,
      createdAt: timestamp,
      status: "complete",
    };
    const response: ChatMessage = {
      id: randomUUID(),
      role: "assistant",
      content: "",
      reasoning: "",
      createdAt: timestamp,
      status: "streaming",
      toolCalls: [],
    };
    if (session.messages.length === 0 && !session.titleEdited) {
      session.title = titleFromPrompt(prompt);
    }
    session.messages.push(userMessage, response);
    session.updatedAt = timestamp;
    session.status = "starting";
    startClaude(session, prompt, response.id);
    return { userMessageId: userMessage.id, assistantMessageId: response.id };
  });

  ipcMain.handle("chat:stop", (_event, id: string) => {
    const job = activeJobs.get(id);
    if (!job) return false;
    job.stopped = true;
    const pid = job.child.pid;
    if (process.platform === "win32" && pid) {
      const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
      });
      killer.on("error", () => job.child.kill());
    } else {
      job.child.kill("SIGTERM");
    }
    return true;
  });

  ipcMain.handle("settings:update", (_event, patch: Partial<AppSettings>) => {
    if (typeof patch.defaultCwd === "string") {
      const cwd = resolve(patch.defaultCwd);
      if (!isDirectory(cwd)) throw new Error("默认项目文件夹不存在。");
      store.settings.defaultCwd = cwd;
    }
    if (
      patch.defaultPermissionMode &&
      ["plan", "auto", "acceptEdits", "dontAsk"].includes(
        patch.defaultPermissionMode,
      )
    ) {
      store.settings.defaultPermissionMode = patch.defaultPermissionMode;
    }
    if (isEffortLevel(patch.defaultEffort)) {
      store.settings.defaultEffort = patch.defaultEffort;
    }
    if (typeof patch.requestedModel === "string") {
      store.settings.requestedModel = patch.requestedModel.trim();
    }
    if (typeof patch.claudePath === "string") {
      const candidate = patch.claudePath.trim();
      if (candidate && !existsSync(candidate)) throw new Error("Claude 程序路径不存在。");
      store.settings.claudePath = candidate;
    }
    if (patch.theme && ["system", "light", "dark"].includes(patch.theme)) {
      store.settings.theme = patch.theme;
      nativeTheme.themeSource = patch.theme;
    }
    scheduleSave();
    emitState();
    return store.settings;
  });

  ipcMain.handle("dialog:directory", async (_event, initialPath?: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "选择 Claude Code 工作目录",
      defaultPath: initialPath && isDirectory(initialPath) ? initialPath : undefined,
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle("path:open", async (_event, path: string) => {
    if (!isDirectory(path) && !existsSync(path)) throw new Error("路径不存在。");
    return shell.openPath(path);
  });

  ipcMain.handle("external:open", async (_event, url: string) => {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("不支持这个链接。");
    await shell.openExternal(parsed.toString());
    return true;
  });

  ipcMain.handle("claude:status", async () => {
    const executable = resolveClaudeExecutable();
    return await new Promise((resolveStatus) => {
      const child = spawn(executable, ["--version"], { windowsHide: true });
      let output = "";
      let error = "";
      child.stdout?.on("data", (data) => (output += data.toString()));
      child.stderr?.on("data", (data) => (error += data.toString()));
      child.on("error", (spawnError) =>
        resolveStatus({ ok: false, path: executable, error: spawnError.message }),
      );
      child.on("close", (code) =>
        resolveStatus({
          ok: code === 0,
          path: executable,
          version: output.trim(),
          error: code === 0 ? "" : error.trim(),
        }),
      );
    });
  });

  ipcMain.handle("balance:query", () => queryBalance());
}

function createWindow(): void {
  const developmentIcon = join(__dirname, "..", "assets", "icon.png");
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#111310",
    ...(existsSync(developmentIcon) ? { icon: developmentIcon } : {}),
    title: "Claude Code UI",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#00000000",
      symbolColor: "#858b80",
      height: 42,
    },
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (["http:", "https:"].includes(parsed.protocol)) void shell.openExternal(url);
    } catch {
      // Invalid URLs are ignored.
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) void mainWindow.loadURL(devServer);
  else void mainWindow.loadFile(join(__dirname, "..", "dist", "index.html"));
}

if (previewMode) {
  app.setPath("userData", join(app.getPath("temp"), "Claude-Code-UI-本地测试版"));
}

app.whenReady().then(() => {
  store = loadStore();
  nativeTheme.themeSource = store.settings.theme;
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  for (const job of activeJobs.values()) {
    job.stopped = true;
    job.child.kill();
  }
  saveStoreNow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
