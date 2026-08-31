export type PermissionMode = "plan" | "auto" | "acceptEdits" | "dontAsk";
export type EffortLevel = "" | "low" | "medium" | "high" | "xhigh" | "max";
export type MessageStatus = "queued" | "streaming" | "complete" | "error" | "stopped";
export type ProjectNameSource = "directory" | "metadata" | "task" | "user";

export interface ContextUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  contextWindowTokens: number;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
  output?: string;
  status: "running" | "success" | "error";
}

export interface ChatMessage {
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
  attachments?: ChatAttachment[];
}

export interface ChatAttachment {
  path: string;
  name: string;
  kind: "file" | "project";
  size?: number;
}

export interface ChatSession {
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

export interface Project {
  id: string;
  name: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  nameSource?: ProjectNameSource;
}

export interface AppSettings {
  defaultCwd: string;
  defaultPermissionMode: PermissionMode;
  defaultEffort: EffortLevel;
  requestedModel: string;
  visionModel: string;
  claudePath: string;
  theme: "system" | "light" | "dark";
}

export interface AppState {
  projects: Project[];
  sessions: ChatSession[];
  settings: AppSettings;
  activeSessionIds: string[];
}

export interface ClaudeStatus {
  ok: boolean;
  path: string;
  version?: string;
  error?: string;
}

export interface BalanceEntry {
  currency: string;
  total: string;
  granted?: string;
  toppedUp?: string;
}

export interface BalanceStatus {
  status: "ok" | "unavailable" | "unsupported" | "error";
  provider: string;
  available: boolean;
  balances: BalanceEntry[];
  checkedAt: string;
  error?: string;
}

export interface ModelCatalogEntry {
  id: string;
  name: string;
  provider: string;
}

export interface ScreenSource {
  id: string;
  name: string;
  displayId: string;
  thumbnail: string;
  width: number;
  height: number;
}

export interface VisionKeyStatus {
  configured: boolean;
}

export interface UpdateCheckResult {
  status: "current" | "available" | "error";
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseUrl?: string;
  downloadUrl?: string;
  publishedAt?: string;
  notes?: string;
  error?: string;
}

export interface ClaudeUIApi {
  getState(): Promise<AppState>;
  getModelCatalog(): Promise<ModelCatalogEntry[]>;
  createProject(input: Pick<Project, "name" | "cwd">): Promise<Project>;
  updateProject(id: string, patch: Partial<Project>): Promise<Project>;
  createSession(input?: Partial<ChatSession>): Promise<ChatSession>;
  updateSession(id: string, patch: Partial<ChatSession>): Promise<ChatSession>;
  deleteSession(id: string): Promise<boolean>;
  sendMessage(
    id: string,
    prompt: string,
    screenshotPath?: string,
    attachments?: ChatAttachment[],
  ): Promise<{ userMessageId: string; assistantMessageId?: string; queued: boolean }>;
  stopMessage(id: string): Promise<boolean>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  selectDirectory(initialPath?: string): Promise<string | null>;
  openPath(path: string): Promise<string>;
  openExternal(url: string): Promise<boolean>;
  openMicrophoneSettings(): Promise<boolean>;
  claudeStatus(): Promise<ClaudeStatus>;
  queryBalance(): Promise<BalanceStatus>;
  getVisionKeyStatus(): Promise<VisionKeyStatus>;
  setVisionApiKey(value: string): Promise<VisionKeyStatus>;
  checkForUpdates(): Promise<UpdateCheckResult>;
  selectAttachments(kind: "file" | "project"): Promise<ChatAttachment[]>;
  readClipboard(): Promise<string>;
  writeClipboard(text: string): Promise<boolean>;
  getScreenSources(): Promise<ScreenSource[]>;
  saveScreenshot(dataUrl: string): Promise<{ path: string; dataUrl: string }>;
  onScreenShortcut(callback: () => void): () => void;
  onStateChanged(callback: (state: AppState) => void): () => void;
}

declare global {
  interface Window {
    claudeUI: ClaudeUIApi;
  }
}
