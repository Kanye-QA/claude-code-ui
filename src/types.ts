export type PermissionMode = "plan" | "auto" | "acceptEdits" | "dontAsk";
export type EffortLevel = "" | "low" | "medium" | "high" | "xhigh" | "max";
export type MessageStatus = "streaming" | "complete" | "error" | "stopped";

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
}

export interface ChatSession {
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

export interface Project {
  id: string;
  name: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  defaultCwd: string;
  defaultPermissionMode: PermissionMode;
  defaultEffort: EffortLevel;
  requestedModel: string;
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

export interface ClaudeUIApi {
  getState(): Promise<AppState>;
  createProject(input: Pick<Project, "name" | "cwd">): Promise<Project>;
  createSession(input?: Partial<ChatSession>): Promise<ChatSession>;
  updateSession(id: string, patch: Partial<ChatSession>): Promise<ChatSession>;
  deleteSession(id: string): Promise<boolean>;
  sendMessage(
    id: string,
    prompt: string,
  ): Promise<{ userMessageId: string; assistantMessageId: string }>;
  stopMessage(id: string): Promise<boolean>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  selectDirectory(initialPath?: string): Promise<string | null>;
  openPath(path: string): Promise<string>;
  openExternal(url: string): Promise<boolean>;
  claudeStatus(): Promise<ClaudeStatus>;
  onStateChanged(callback: (state: AppState) => void): () => void;
}

declare global {
  interface Window {
    claudeUI: ClaudeUIApi;
  }
}
