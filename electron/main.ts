import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  ipcMain,
  globalShortcut,
  nativeImage,
  nativeTheme,
  safeStorage,
  shell,
} from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { bundledModelCatalog } from "./bundledModelCatalog";

type PermissionMode = "plan" | "auto" | "acceptEdits" | "dontAsk";
type EffortLevel = "" | "low" | "medium" | "high" | "xhigh" | "max";
type MessageStatus = "queued" | "streaming" | "complete" | "error" | "stopped";
type ToolStatus = "running" | "success" | "error";
type ProjectNameSource = "directory" | "metadata" | "task" | "user";

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
  topic?: string;
  imagePath?: string;
  visionSummary?: string;
  visionModel?: string;
}

interface ChatSession {
  id: string;
  projectId?: string;
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
  nameSource?: ProjectNameSource;
}

interface AppSettings {
  defaultCwd: string;
  defaultPermissionMode: PermissionMode;
  defaultEffort: EffortLevel;
  requestedModel: string;
  visionModel: string;
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

interface ModelCatalogEntry {
  id: string;
  name: string;
  provider: string;
}

interface AppStore {
  version: 3;
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
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEFAULT_VISION_MODEL = "glm-4v-flash";
const MAX_QUEUED_MESSAGES = 20;

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

function sameDirectoryPath(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

function isEffortLevel(value: unknown): value is EffortLevel {
  return typeof value === "string" && effortLevels.includes(value as EffortLevel);
}

function migrateModel(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
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
    version: 3,
    projects: [],
    sessions: [],
    settings: {
      defaultCwd: documents,
      defaultPermissionMode: "auto",
      defaultEffort: "",
      requestedModel: "",
      visionModel: DEFAULT_VISION_MODEL,
      claudePath: "",
      theme: "system",
    },
  };
  if (!previewMode) return base;

  const timestamp = now();
  const firstPreviewTimestamp = new Date(Date.now() - 18 * 60_000).toISOString();
  const secondPreviewTimestamp = new Date(Date.now() - 9 * 60_000).toISOString();
  const thirdPreviewTimestamp = new Date(Date.now() - 2 * 60_000).toISOString();
  const project: Project = {
    id: "preview-project",
    name: "Claude Code UI",
    cwd: process.cwd(),
    createdAt: firstPreviewTimestamp,
    updatedAt: timestamp,
    nameSource: "metadata",
  };
  return {
    ...base,
    projects: [project],
    settings: { ...base.settings, defaultCwd: process.cwd(), theme: "dark" },
    sessions: [
      {
        id: "preview-conversation-a",
        projectId: project.id,
        title: "5.0 本地测试版体验升级",
        titleEdited: true,
        cwd: project.cwd,
        createdAt: firstPreviewTimestamp,
        updatedAt: timestamp,
        started: true,
        permissionMode: "auto",
        effort: "",
        requestedModel: DEFAULT_DEEPSEEK_MODEL,
        activeModel: DEFAULT_DEEPSEEK_MODEL,
        contextUsage: {
          inputTokens: 61_420,
          outputTokens: 3_280,
          cacheCreationInputTokens: 8_100,
          cacheReadInputTokens: 12_600,
          contextWindowTokens: 200_000,
        },
        status: "idle",
        messages: [
          {
            id: "preview-user-message",
            role: "user",
            content: "把工作台的上下文状态、模型图标和消息操作统一优化。",
            createdAt: firstPreviewTimestamp,
            status: "complete",
            topic: "统一优化工作台界面",
          },
          {
            id: "preview-assistant-message",
            role: "assistant",
            content:
              "已完成第一轮界面整理。现在上下文改为轻量环形状态，消息下方可直接复制，输入区也支持右键编辑菜单。",
            createdAt: firstPreviewTimestamp,
            status: "complete",
            toolCalls: [],
            durationMs: 2_840,
          },
          {
            id: "preview-user-models",
            role: "user",
            content: "把 Claude、GPT、DeepSeek 等模型按厂商大类折叠，展开后再选择具体版本。",
            createdAt: secondPreviewTimestamp,
            status: "complete",
            topic: "按厂商折叠模型目录",
          },
          {
            id: "preview-assistant-models",
            role: "assistant",
            content:
              "模型选择器已经按供应商重新整理，并保留搜索与自定义模型 ID；各厂商继续使用对应品牌图标。",
            createdAt: secondPreviewTimestamp,
            status: "complete",
            toolCalls: [],
            durationMs: 1_920,
          },
          {
            id: "preview-user-timeline",
            role: "user",
            content: "新增任务时间线，并让新项目自动识别主题和命名。",
            createdAt: thirdPreviewTimestamp,
            status: "complete",
            topic: "新增任务时间线与自动命名",
          },
          {
            id: "preview-assistant-timeline",
            role: "assistant",
            content:
              "右侧时间线会按每次用户要求整理节点，点击可跳回对应内容；新项目名称则优先从本地项目元数据识别。",
            createdAt: thirdPreviewTimestamp,
            status: "complete",
            toolCalls: [],
            durationMs: 2_360,
          },
        ],
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

function cleanProjectName(value: unknown): string {
  if (typeof value !== "string") return "";
  let name = value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  if (name.startsWith("@") && name.includes("/")) name = name.split("/").at(-1) ?? name;
  name = name.replace(/\.git$/i, "").trim();
  return Array.from(name).slice(0, 60).join("");
}

function readSmallProjectFile(path: string): string {
  try {
    const stats = statSync(path);
    if (!stats.isFile() || stats.size > 256 * 1024) return "";
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function tomlProjectName(content: string, sections: string[]): string {
  const acceptedSections = new Set(sections);
  const namesBySection = new Map<string, string>();
  let activeSection = "";

  for (const rawLine of content.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const section = rawLine.match(/^\s*\[([^\[\]]+)]\s*(?:#.*)?$/)?.[1]?.trim();
    if (section) {
      activeSection = section;
      continue;
    }
    if (/^\s*\[/.test(rawLine)) {
      activeSection = "";
      continue;
    }
    if (!acceptedSections.has(activeSection)) continue;

    const match = rawLine.match(/^\s*name\s*=\s*(["'])(.*?)\1\s*(?:#.*)?$/);
    const name = cleanProjectName(match?.[2]);
    if (name && !namesBySection.has(activeSection)) {
      namesBySection.set(activeSection, name);
    }
  }
  return sections.map((section) => namesBySection.get(section)).find(Boolean) ?? "";
}

function gitRepositoryName(content: string): string {
  const remote = content.match(/^\s*url\s*=\s*(.+)$/m)?.[1]?.trim();
  if (!remote) return "";
  const withoutQuery = remote.split(/[?#]/, 1)[0].replace(/[\\/]+$/, "");
  return cleanProjectName(withoutQuery.split(/[\\/:]/).at(-1));
}

function detectProjectIdentity(cwd: string): {
  name: string;
  source: Exclude<ProjectNameSource, "task" | "user">;
} {
  const packageJson = readSmallProjectFile(join(cwd, "package.json"));
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson) as Record<string, unknown>;
      const name = cleanProjectName(parsed.productName || parsed.displayName || parsed.name);
      if (name) return { name, source: "metadata" };
    } catch {
      // Invalid project metadata falls through to the next safe detector.
    }
  }

  const pyprojectName = tomlProjectName(
    readSmallProjectFile(join(cwd, "pyproject.toml")),
    ["project", "tool.poetry"],
  );
  if (pyprojectName) return { name: pyprojectName, source: "metadata" };

  const cargoName = tomlProjectName(readSmallProjectFile(join(cwd, "Cargo.toml")), [
    "package",
  ]);
  if (cargoName) return { name: cargoName, source: "metadata" };

  const goModule = readSmallProjectFile(join(cwd, "go.mod")).match(
    /^\s*module\s+([^\s]+)\s*$/m,
  )?.[1];
  if (goModule) {
    const name = cleanProjectName(goModule.split("/").at(-1));
    if (name) return { name, source: "metadata" };
  }

  const pom = readSmallProjectFile(join(cwd, "pom.xml")).replace(
    /<parent\b[\s\S]*?<\/parent>/i,
    "",
  );
  const artifactId = cleanProjectName(pom.match(/<artifactId>\s*([^<]+)\s*<\/artifactId>/i)?.[1]);
  if (artifactId) return { name: artifactId, source: "metadata" };

  const gitName = gitRepositoryName(readSmallProjectFile(join(cwd, ".git", "config")));
  if (gitName) return { name: gitName, source: "metadata" };

  return { name: projectNameFromPath(cwd), source: "directory" };
}

function isProjectNameSource(value: unknown): value is ProjectNameSource {
  return ["directory", "metadata", "task", "user"].includes(String(value));
}

function createProjectRecord(name: string, cwd: string): Project {
  const timestamp = now();
  const explicitName = cleanProjectName(name);
  const identity = explicitName
    ? { name: explicitName, source: "user" as const }
    : detectProjectIdentity(cwd);
  return {
    id: randomUUID(),
    name: identity.name,
    cwd,
    createdAt: timestamp,
    updatedAt: timestamp,
    nameSource: identity.source,
  };
}

function projectById(id: string): Project {
  const project = store.projects.find((item) => item.id === id);
  if (!project) throw new Error("项目不存在，请重新选择项目后再试。");
  return project;
}

function requireExistingProjectDirectory(project: Project): string {
  if (!isDirectory(project.cwd)) {
    throw new Error("项目文件夹不存在，请重新选择文件夹并新建项目。");
  }
  return project.cwd;
}

function canNameProjectFromFirstTask(
  project: Project | undefined,
  isFirstProjectTask: boolean,
): project is Project {
  return Boolean(
    project && isFirstProjectTask && project.nameSource === "directory",
  );
}

function preserveUnusableStore(): void {
  if (!storePath || !existsSync(storePath)) return;
  const recoveryName = `sessions.recovery-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.json`;
  try {
    copyFileSync(storePath, join(dirname(storePath), recoveryName));
  } catch {
    // If even the recovery copy cannot be created, write the fresh store to a
    // different file so the unreadable original is never overwritten.
    storePath = join(dirname(storePath), `sessions-recovered-${Date.now()}.json`);
  }
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
    if (![1, 2, 3].includes(parsed.version) || !Array.isArray(parsed.sessions)) {
      preserveUnusableStore();
      return defaultStore();
    }
    const defaults = defaultStore();
    parsed.settings = { ...defaults.settings, ...parsed.settings };
    parsed.settings.requestedModel = migrateModel(parsed.settings.requestedModel);
    parsed.settings.visionModel = migrateModel(parsed.settings.visionModel) || DEFAULT_VISION_MODEL;
    const projects: Project[] = Array.isArray(parsed.projects)
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
            nameSource: isProjectNameSource(project.nameSource)
              ? project.nameSource
              : undefined,
          }))
      : [];
    const projectForCwd = (cwd: string): Project => {
      const existing = projects.find((project) => sameDirectoryPath(project.cwd, cwd));
      if (existing) return existing;
      const project = createProjectRecord("", cwd);
      projects.push(project);
      return project;
    };
    parsed.sessions = parsed.sessions.map((session) => {
      const normalizedCwd = typeof session.cwd === "string" ? session.cwd : defaults.settings.defaultCwd;
      const hasProjectId = typeof session.projectId === "string" && session.projectId.trim().length > 0;
      const existingProject = hasProjectId
        ? projects.find(
            (project) =>
              project.id === session.projectId && sameDirectoryPath(project.cwd, normalizedCwd),
          )
        : undefined;
      const project = hasProjectId ? existingProject ?? projectForCwd(normalizedCwd) : undefined;
      return {
      ...session,
      projectId: project?.id,
      cwd: normalizedCwd,
      titleEdited: Boolean(session.titleEdited),
      status: "idle",
      permissionMode: session.permissionMode ?? "auto",
      effort: isEffortLevel(session.effort)
        ? session.effort
        : parsed.settings.defaultEffort,
      requestedModel: migrateModel(session.requestedModel),
      activeModel: session.activeModel,
      contextUsage: normalizeContextUsage(session.contextUsage),
      messages: Array.isArray(session.messages)
        ? session.messages.map((message) =>
            message.status === "streaming" || message.status === "queued"
              ? {
                  ...message,
                  status: "stopped" as MessageStatus,
                  error:
                    message.status === "queued"
                      ? "应用关闭前尚未发送。"
                      : message.error,
                }
              : message,
          )
        : [],
      };
    });
    return { ...parsed, version: 3, projects };
  } catch {
    preserveUnusableStore();
    return defaultStore();
  }
}

function saveStoreNow(): void {
  if (!storePath) return;
  mkdirSync(dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, JSON.stringify(store, null, 2), "utf8");
    if (existsSync(storePath)) copyFileSync(storePath, `${storePath}.bak`);
    renameSync(temporaryPath, storePath);
  } catch (error) {
    if (existsSync(temporaryPath)) {
      try {
        unlinkSync(temporaryPath);
      } catch {
        // Keep the original save error as the useful diagnostic.
      }
    }
    console.error("Unable to save Claude Code UI state safely:", error);
  }
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

function validateScreenshotPath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const candidate = resolve(value);
  const root = resolve(join(app.getPath("userData"), "screenshots"));
  const candidateLower = candidate.toLowerCase();
  const rootLower = root.toLowerCase();
  if (candidateLower !== rootLower && !candidateLower.startsWith(`${rootLower}\\`)) {
    throw new Error("截图文件只能来自本应用的截图目录。");
  }
  const stats = statSync(candidate);
  if (!stats.isFile() || stats.size > 20 * 1024 * 1024 || !/\.png$/i.test(candidate)) {
    throw new Error("截图文件无效或过大，请重新截取。");
  }
  return candidate;
}

function resolveProviderApiKey(environmentNames: string[]): string | undefined {
  const environmentKey = environmentNames
    .map((name) => process.env[name])
    .find((value) => typeof value === "string" && value.trim());
  return environmentKey?.trim() || undefined;
}

function visionApiKeyPath(): string {
  return join(app.getPath("userData"), "vision-api-key.bin");
}

function readStoredVisionApiKey(): string | undefined {
  if (!safeStorage.isEncryptionAvailable()) return undefined;
  try {
    if (!existsSync(visionApiKeyPath())) return undefined;
    const value = safeStorage.decryptString(readFileSync(visionApiKeyPath()));
    return value.trim() || undefined;
  } catch {
    return undefined;
  }
}

function saveVisionApiKey(value: string): void {
  const key = value.trim();
  const path = visionApiKeyPath();
  if (!key) {
    if (existsSync(path)) unlinkSync(path);
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Windows 凭据加密不可用，请改用 ZHIPU_API_KEY 环境变量。");
  }
  const temporaryPath = `${path}.tmp-${randomUUID()}`;
  writeFileSync(temporaryPath, safeStorage.encryptString(key));
  renameSync(temporaryPath, path);
}

function resolveGeminiApiKey(): string | undefined {
  return resolveProviderApiKey([
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
  ]);
}

function resolveZhipuApiKey(): string | undefined {
  return (
    resolveProviderApiKey([
      "ZHIPU_API_KEY",
      "ZHIPUAI_API_KEY",
      "BIGMODEL_API_KEY",
      "GLM_API_KEY",
    ]) ?? readStoredVisionApiKey()
  );
}

function isDirectVisionModel(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("gemini-") || /^glm-(?:4v|4\.6v)/.test(normalized);
}

async function analyzeScreenshotWithGemini(
  imagePath: string,
  model: string,
  userPrompt: string,
): Promise<string> {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "未找到 Gemini API Key。请设置 GEMINI_API_KEY；Google AI Studio 的免费额度受账号和地区限制。",
    );
  }
  const stats = statSync(imagePath);
  if (stats.size > 10 * 1024 * 1024) {
    throw new Error("截图超过视觉模型的 10 MB 限制，请重新截取较小画面。");
  }
  const modelId = model.trim().replace(/^models\//i, "");
  const imageData = readFileSync(imagePath).toString("base64");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `请识别这张桌面截图，提取与用户任务有关的界面文字、错误、文件名和关键状态。只输出事实和可执行线索，不要代替主模型修改文件。用户补充要求：${userPrompt}`,
              },
              { inline_data: { mime_type: "image/png", data: imageData } },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 2_000, temperature: 0.1 },
      }),
    },
  );
  const payload = (await response.json()) as {
    error?: { message?: unknown };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: unknown }> };
    }>;
  };
  if (!response.ok) {
    const message =
      typeof payload.error?.message === "string" ? payload.error.message.slice(0, 500) : `HTTP ${response.status}`;
    throw new Error(`Gemini 截图识别失败：${message}`);
  }
  const result = (payload.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => (typeof part.text === "string" ? part.text.trim() : ""))
    .filter(Boolean)
    .join("\n")
    .slice(0, 12_000);
  if (!result) throw new Error("Gemini 没有返回截图识别结果，请重试。");
  return result;
}

async function analyzeScreenshotWithZhipu(
  imagePath: string,
  model: string,
  userPrompt: string,
): Promise<string> {
  const apiKey = resolveZhipuApiKey();
  if (!apiKey) {
    throw new Error(
      "未找到智谱 API Key。请在智谱开放平台配置 ZHIPU_API_KEY；GLM-4V-Flash 模型本身免费，但仍需要你自己的账号密钥。",
    );
  }
  const stats = statSync(imagePath);
  if (stats.size > 10 * 1024 * 1024) {
    throw new Error("截图超过视觉模型的 10 MB 限制，请重新截取较小画面。");
  }
  const imageData = readFileSync(imagePath).toString("base64");
  const response = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model.trim() || "glm-4v-flash",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `请识别这张桌面截图，提取与用户任务有关的界面文字、错误、文件名和关键状态。只输出事实和可执行线索，不要代替主模型修改文件。用户补充要求：${userPrompt}`,
            },
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${imageData}` },
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 2_000,
    }),
  });
  const payload = (await response.json()) as {
    error?: { message?: unknown };
    choices?: Array<{
      message?: { content?: unknown };
    }>;
  };
  if (!response.ok) {
    const message =
      typeof payload.error?.message === "string" ? payload.error.message.slice(0, 500) : `HTTP ${response.status}`;
    throw new Error(`GLM-4V-Flash 截图识别失败：${message}`);
  }
  const content = payload.choices?.[0]?.message?.content;
  const result =
    typeof content === "string"
      ? content.trim()
      : Array.isArray(content)
        ? content
            .map((part) =>
              part && typeof part === "object" && "text" in part && typeof part.text === "string"
                ? part.text.trim()
                : "",
            )
            .filter(Boolean)
            .join("\n")
        : "";
  if (!result) throw new Error("GLM-4V-Flash 没有返回截图识别结果，请重试。");
  return result.slice(0, 12_000);
}

async function analyzeScreenshot(
  imagePath: string,
  model: string,
  userPrompt: string,
): Promise<string> {
  const normalized = model.trim().toLowerCase();
  if (/^glm-(?:4v|4\.6v)/.test(normalized)) {
    return analyzeScreenshotWithZhipu(imagePath, model, userPrompt);
  }
  return analyzeScreenshotWithGemini(imagePath, model, userPrompt);
}

function promptWithScreenshot(
  prompt: string,
  imagePath?: string,
  visionSummary?: string,
  visionModel?: string,
): string {
  if (visionSummary) {
    return `${prompt}\n\n[截图识别结果，来自 ${visionModel || "视觉模型"}]\n${visionSummary}\n\n请基于上面的截图识别结果继续完成原任务；如果识别结果不足，请先说明需要补充什么。`;
  }
  if (!imagePath) return prompt;
  return `${prompt}\n\n[已附加截图：${imagePath}]\n请先使用 Read 工具读取这张 PNG 截图，再结合截图完成任务；如果当前模型不支持图片，请明确说明。`;
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

function resolveClaudeConfigDirectory(): string {
  const configured = process.env.CLAUDE_CONFIG_DIR?.trim();
  return configured ? resolve(configured) : join(app.getPath("home"), ".claude");
}

function modelProvider(modelId: string, displayName: string): string {
  const value = `${modelId} ${displayName}`.toLowerCase();
  if (value.includes("claude")) return "anthropic";
  if (value.includes("deepseek")) return "deepseek";
  if (/\b(?:gpt|codex|openai|o[134](?:-|\b))/.test(value)) return "openai";
  if (value.includes("gemini")) return "gemini";
  if (value.includes("qwen") || value.includes("qwq")) return "qwen";
  if (value.includes("glm")) return "zhipu";
  if (value.includes("kimi") || /^k[23]\b/.test(value)) return "kimi";
  if (value.includes("minimax")) return "minimax";
  if (value.includes("doubao")) return "doubao";
  if (
    value.includes("mistral") ||
    value.includes("codestral") ||
    value.includes("devstral") ||
    value.includes("magistral")
  ) {
    return "mistral";
  }
  if (value.includes("command-") || value.includes("cohere")) return "cohere";
  if (value.includes("grok")) return "xai";
  if (value.includes("hunyuan") || /^hy3\b/.test(value)) return "hunyuan";
  if (value.includes("mimo")) return "xiaomi";
  if (value.includes("step-")) return "stepfun";
  return "custom";
}

function loadBundledModels(): ModelCatalogEntry[] {
  return bundledModelCatalog
    .map((model) => ({
    ...model,
    provider: modelProvider(model.id, model.name),
  }))
    .sort((left, right) => left.id.localeCompare(right.id));
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

  const settingsPath = join(resolveClaudeConfigDirectory(), "settings.json");
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
    if (configured.protocol !== "https:") {
      return balanceResult(
        "error",
        configured.hostname || "当前供应商",
        false,
        [],
        "为保护 API 凭据，余额查询只允许使用 HTTPS。",
      );
    }
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

function cleanTopicClause(value: string): string {
  let topic = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/^\s*(?:(?:#{1,6}|>|[-*+]|\d+[.)、])\s*)+/, "")
    .replace(/[*_~`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  topic = topic
    .replace(
      /^(?:(?:请(?:你)?|麻烦(?:你)?|帮我|我(?:想|希望|需要)(?:要)?|我们(?:想|希望|需要)(?:要)?|能否|能不能|可以(?:帮我)?|是否|应该(?:是)?|接下来|然后|现在|这次|另外(?:还)?(?:要)?|此外(?:还)?(?:要)?|同时(?:还)?(?:要)?|还有|并且(?:还)?(?:要)?|也(?:要)?|还要|就是|像你这样)\s*[，,、:：]?\s*)+/u,
      "",
    )
    .replace(
      /^(?:(?:please|could you|can you|would you|i (?:want|need)(?: you)? to|i(?:'d| would) like(?: you)? to|we (?:want|need|would like) to|also|then|next|now)\b[\s,:-]*)+/iu,
      "",
    )
    .replace(
      /[，,、:：\s]*(?:对不对|对吗|好吗|可以吗|行吗|是不是|right|okay|ok)\s*[?？]?$/iu,
      "",
    )
    .replace(/^上下滑动(?=时间线)/u, "")
    .replace(/(?:这个是)?当前(?:那时候|当时)的/gu, "当前")
    .replace(/(?:可以|能够)(?=显示|识别|创建|新建|命名)/gu, "")
    .replace(/主要是(?:用来)?干什么的/gu, "主要任务")
    .replace(/^[，,、:：;；\-\s]+|[，,、:：;；\-\s]+$/gu, "")
    .trim();

  return topic;
}

function topicClauseScore(value: string, index: number): number {
  const actions = new Set(
    [
      ...(value.match(
        /新增|新建|添加|实现|修复|修改|优化|重构|测试|检查|排查|发布|上传|推送|删除|迁移|支持|显示|识别|命名|创建|改进|调整|解决|浏览|分析|解释|提交/gu,
      ) ?? []),
      ...(value.match(
        /\b(?:add|create|implement|fix|update|improve|refactor|test|check|debug|release|publish|upload|push|delete|migrate|support|show|display|identify|detect|rename|auto[- ]?name|inspect|analyze|explain|review)\b/giu,
      ) ?? []),
    ].map((item) => item.toLowerCase()),
  );
  const objects = new Set(
    [
      ...(value.match(
        /时间线|项目|对话|会话|功能|页面|窗口|界面|模型|目录|主题|名称|错误|问题/gu,
      ) ?? []),
      ...(value.match(
        /\b(?:timeline|project|conversation|chat|session|feature|page|window|interface|ui|model|directory|topic|name|error|issue)\b/giu,
      ) ?? []),
    ].map((item) => item.toLowerCase()),
  );
  const lengthScore = Math.min(Array.from(value).length, 24);
  const preamblePenalty = /^(?:我看|我觉得|感觉|不太满意|你确定|好[的啊]?|继续|i (?:looked|checked|think)|not happy|are you sure|well\b)/iu.test(
    value,
  )
    ? 24
    : 0;

  return (
    actions.size * 18 +
    objects.size * 10 +
    lengthScore +
    Math.min(index, 20) -
    preamblePenalty
  );
}

function truncateTopic(value: string, maximum = 40): string {
  const characters = Array.from(value);
  return characters.length > maximum
    ? `${characters.slice(0, maximum).join("")}…`
    : value;
}

function titleFromPrompt(prompt: string): string {
  const sample =
    prompt.length > 16_000
      ? `${prompt.slice(0, 8_000)}\n${prompt.slice(-8_000)}`
      : prompt;
  const withoutFencedCode = sample.replace(/```[\s\S]*?```/g, " ");
  const candidates = withoutFencedCode
    .split(
      /(?:\r?\n)+|[。！？!?；;，,：:]+|\b(?:but|however|please|also|then|next)\b/iu,
    )
    .map(cleanTopicClause)
    .filter((value) => Array.from(value).length >= 2);

  if (!candidates.length) {
    return truncateTopic(cleanTopicClause(prompt) || "新会话");
  }

  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  candidates.forEach((candidate, index) => {
    const score = topicClauseScore(candidate, index);
    if (score >= bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  return truncateTopic(candidates[bestIndex]);
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

function createAssistantMessage(timestamp = now()): ChatMessage {
  return {
    id: randomUUID(),
    role: "assistant",
    content: "",
    reasoning: "",
    createdAt: timestamp,
    status: "streaming",
    toolCalls: [],
  };
}

function stopQueuedMessages(session: ChatSession, reason: string): void {
  for (const queued of session.messages) {
    if (queued.role === "user" && queued.status === "queued") {
      queued.status = "stopped";
      queued.error = reason;
    }
  }
}

function startNextQueuedMessage(session: ChatSession): boolean {
  const queuedIndex = session.messages.findIndex(
    (message) => message.role === "user" && message.status === "queued",
  );
  if (queuedIndex < 0) return false;
  if (!isDirectory(session.cwd)) {
    stopQueuedMessages(session, "项目文件夹已不存在，消息未自动发送。");
    session.status = "error";
    return false;
  }

  const queued = session.messages[queuedIndex];
  let imagePath: string | undefined;
  try {
    imagePath = queued.visionSummary ? undefined : validateScreenshotPath(queued.imagePath);
  } catch (error) {
    queued.status = "stopped";
    queued.error = error instanceof Error ? error.message : String(error);
    session.status = "error";
    return false;
  }
  queued.status = "complete";
  delete queued.error;
  const response = createAssistantMessage();
  session.messages.splice(queuedIndex + 1, 0, response);
  session.updatedAt = now();
  session.status = "starting";
  startClaude(
    session,
    queued.content,
    response.id,
    imagePath,
    imagePath ? store.settings.visionModel.trim() || undefined : undefined,
    queued.visionSummary,
    queued.visionModel,
  );
  return true;
}

function finishJob(sessionId: string, exitCode: number | null): void {
  const job = activeJobs.get(sessionId);
  if (!job) return;
  const session = sessionById(sessionId);
  const message = assistantMessage(session, job.assistantMessageId);

  if (job.stopped) {
    message.status = "stopped";
    session.status = "idle";
  } else if (exitCode !== 0) {
    message.status = "error";
    session.status = "error";
    const cleaned = job.stderr.trim().slice(-4_000);
    message.error = cleaned || `Claude Code 已退出（代码 ${exitCode ?? "未知"}）。`;
  } else if (message.status === "streaming") {
    if (message.content) {
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

  const completedSuccessfully =
    !job.stopped && exitCode === 0 && message.status === "complete";
  for (const tool of message.toolCalls ?? []) {
    if (tool.status === "running") {
      tool.status = completedSuccessfully ? "success" : "error";
    }
    delete tool.inputBuffer;
  }

  session.updatedAt = now();
  activeJobs.delete(sessionId);
  if (completedSuccessfully) {
    startNextQueuedMessage(session);
  } else {
    stopQueuedMessages(
      session,
      job.stopped
        ? "当前回复已停止，这条排队消息没有自动发送。"
        : "上一条回复未正常完成，这条排队消息没有自动发送。",
    );
  }
  scheduleSync(sessionId, true);
}

function startClaude(
  session: ChatSession,
  prompt: string,
  assistantId: string,
  imagePath?: string,
  modelOverride?: string,
  visionSummary?: string,
  visionModel?: string,
): void {
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

  const requestedModel = modelOverride?.trim() || session.requestedModel?.trim();
  if (requestedModel) {
    args.push("--model", requestedModel);
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

  child.stdin.end(promptWithScreenshot(prompt, imagePath, visionSummary, visionModel), "utf8");
  scheduleSync(session.id, true);
}

function registerIpc(): void {
  ipcMain.handle("state:get", () => publicState());
  ipcMain.handle("models:catalog", () => loadBundledModels());
  ipcMain.handle("vision:key-status", () => ({ configured: Boolean(resolveZhipuApiKey()) }));
  ipcMain.handle("vision:key:set", (_event, rawValue: unknown) => {
    if (typeof rawValue !== "string" || rawValue.trim().length > 512) {
      throw new Error("智谱 API Key 格式不正确，请重新输入。");
    }
    saveVisionApiKey(rawValue);
    return { configured: Boolean(resolveZhipuApiKey()) };
  });
  ipcMain.handle("clipboard:readText", () => clipboard.readText());
  ipcMain.handle("clipboard:writeText", (_event, value: unknown) => {
    clipboard.writeText(typeof value === "string" ? value : String(value ?? ""));
    return true;
  });

  ipcMain.handle("screen:sources", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 4096, height: 4096 },
      fetchWindowIcons: false,
    });
    return sources.map((source) => {
      const size = source.thumbnail.getSize();
      return {
        id: source.id,
        name: source.name,
        displayId: source.display_id,
        thumbnail: source.thumbnail.toDataURL(),
        width: size.width,
        height: size.height,
      };
    });
  });

  ipcMain.handle("screen:save", (_event, rawDataUrl: unknown) => {
    if (typeof rawDataUrl !== "string" || rawDataUrl.length > 50 * 1024 * 1024) {
      throw new Error("截图数据无效或过大，请重新截取。");
    }
    if (!/^data:image\/(?:png|jpeg);base64,[a-z0-9+/=]+$/i.test(rawDataUrl)) {
      throw new Error("只支持 PNG 或 JPEG 截图。");
    }
    const image = nativeImage.createFromDataURL(rawDataUrl);
    if (image.isEmpty()) throw new Error("截图读取失败，请重新截取。");
    const directory = join(app.getPath("userData"), "screenshots");
    mkdirSync(directory, { recursive: true });
    const filePath = join(directory, `screenshot-${Date.now()}-${randomUUID()}.png`);
    writeFileSync(filePath, image.toPNG());
    return { path: filePath, dataUrl: image.toDataURL() };
  });

  ipcMain.handle("project:create", (_event, input: Pick<Project, "name" | "cwd">) => {
    const cwd = typeof input?.cwd === "string" ? resolve(input.cwd) : "";
    if (!cwd || !isDirectory(cwd)) throw new Error("请选择一个有效的项目文件夹。");
    const name = typeof input?.name === "string" ? input.name.trim() : "";
    const existing = store.projects.find((project) => sameDirectoryPath(project.cwd, cwd));
    if (existing) return existing;
    const project = createProjectRecord(name, cwd);
    store.projects.push(project);
    scheduleSave();
    emitState();
    return project;
  });

  ipcMain.handle("project:update", (_event, id: string, patch: Partial<Project>) => {
    const project = projectById(id);
    if (typeof patch.name === "string") {
      project.name = cleanProjectName(patch.name) || projectNameFromPath(project.cwd);
      project.nameSource = "user";
    }
    project.updatedAt = now();
    scheduleSave();
    emitState();
    return project;
  });

  ipcMain.handle("session:create", (_event, input?: Partial<ChatSession>) => {
    const requestedCwd =
      typeof input?.cwd === "string" && input.cwd.trim()
        ? resolve(input.cwd)
        : store.settings.defaultCwd;
    if (!input?.projectId && !isDirectory(requestedCwd)) {
      throw new Error("工作目录不存在，请在设置中选择一个有效文件夹。");
    }
    const project = input?.projectId
      ? projectById(input.projectId)
      : undefined;
    const projectCwd = project ? requireExistingProjectDirectory(project) : requestedCwd;
    const timestamp = now();
    const session: ChatSession = {
      id: randomUUID(),
      projectId: project?.id,
      title: "新会话",
      titleEdited: false,
      cwd: projectCwd,
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
      if (session.started && !sameDirectoryPath(session.cwd, cwd)) {
        throw new Error("已开始的会话不能更换项目目录，请在目标项目中新建会话。");
      }
      const project = store.projects.find((item) => sameDirectoryPath(item.cwd, cwd));
      session.cwd = cwd;
      session.projectId = project?.id;
    }
    if (
      patch.permissionMode &&
      ["plan", "auto", "acceptEdits", "dontAsk"].includes(patch.permissionMode)
    ) {
      session.permissionMode = patch.permissionMode;
    }
    if (isEffortLevel(patch.effort)) session.effort = patch.effort;
    if (typeof patch.requestedModel === "string") {
      const requestedModel = migrateModel(patch.requestedModel);
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

  ipcMain.handle(
    "chat:send",
    async (_event, id: string, rawPrompt: string, rawScreenshotPath?: unknown) => {
    const prompt = rawPrompt.trim();
    if (!prompt) throw new Error("请输入消息。");
    const imagePath = validateScreenshotPath(rawScreenshotPath);
    const session = sessionById(id);
    if (!isDirectory(session.cwd)) throw new Error("当前项目文件夹不存在，请重新选择。");

    const timestamp = now();
    const wasActive = activeJobs.has(id);
    if (
      wasActive &&
      session.messages.filter(
        (message) => message.role === "user" && message.status === "queued",
      ).length >= MAX_QUEUED_MESSAGES
    ) {
      throw new Error(`当前会话最多排队 ${MAX_QUEUED_MESSAGES} 条消息。`);
    }
    const visionModel = imagePath
      ? store.settings.visionModel.trim() || DEFAULT_VISION_MODEL
      : "";
    const visionSummary =
      imagePath && isDirectVisionModel(visionModel)
        ? await analyzeScreenshot(imagePath, visionModel, prompt)
        : undefined;
    const isQueued = activeJobs.has(id);
    const topic = titleFromPrompt(prompt);
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: "user",
      content: prompt,
      createdAt: timestamp,
      status: isQueued ? "queued" : "complete",
      topic,
      imagePath,
      visionSummary,
      visionModel: visionSummary ? visionModel : undefined,
    };
    if (session.messages.length === 0 && !session.titleEdited) {
      session.title = topic;
    }
    const project = store.projects.find((item) => item.id === session.projectId);
    const isFirstProjectTask = project
      ? !store.sessions.some(
          (item) =>
            item.projectId === project.id &&
            item.messages.some((message) => message.role === "user"),
        )
      : false;
    if (canNameProjectFromFirstTask(project, isFirstProjectTask)) {
      project.name = topic;
      project.nameSource = "task";
      project.updatedAt = timestamp;
    }
    session.updatedAt = timestamp;
    if (isQueued) {
      session.messages.push(userMessage);
      scheduleSync(id, true);
      return { userMessageId: userMessage.id, queued: true };
    }

    const response = createAssistantMessage(timestamp);
    session.messages.push(userMessage, response);
    session.status = "starting";
    startClaude(
      session,
      prompt,
      response.id,
      visionSummary ? undefined : imagePath,
      visionSummary ? undefined : visionModel || undefined,
      visionSummary,
      visionSummary ? visionModel : undefined,
    );
    return {
      userMessageId: userMessage.id,
      assistantMessageId: response.id,
      queued: false,
    };
    },
  );

  ipcMain.handle("chat:stop", async (_event, id: string) => {
    const job = activeJobs.get(id);
    if (!job) return false;
    job.stopped = true;
    const pid = job.child.pid;
    if (process.platform === "win32" && pid) {
      const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
      });
      const killedTree = await new Promise<boolean>((resolveKilled) => {
        let settled = false;
        const settle = (value: boolean) => {
          if (settled) return;
          settled = true;
          resolveKilled(value);
        };
        killer.once("error", () => settle(false));
        killer.once("close", (code) => settle(code === 0));
      });
      if (!killedTree && activeJobs.has(id) && !job.child.kill()) {
        job.stopped = false;
        throw new Error("无法停止当前 Claude 任务，请稍后重试。");
      }
    } else {
      if (!job.child.kill("SIGTERM") && activeJobs.has(id)) {
        job.stopped = false;
        throw new Error("无法停止当前 Claude 任务，请稍后重试。");
      }
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
      store.settings.requestedModel = migrateModel(patch.requestedModel);
    }
    if (typeof patch.visionModel === "string") {
      store.settings.visionModel = migrateModel(patch.visionModel);
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
  saveStoreNow();
  nativeTheme.themeSource = store.settings.theme;
  registerIpc();
  createWindow();
  if (!globalShortcut.register("CommandOrControl+Shift+4", () => {
    mainWindow?.webContents.send("screen:shortcut");
  })) {
    console.warn("截图快捷键 Ctrl+Shift+4 注册失败，仍可点击输入台截图按钮。");
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  for (const job of activeJobs.values()) {
    job.stopped = true;
    job.child.kill();
  }
  saveStoreNow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
