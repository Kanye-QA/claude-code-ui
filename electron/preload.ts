import { contextBridge, ipcRenderer } from "electron";

const api = {
  getState: () => ipcRenderer.invoke("state:get"),
  getModelCatalog: () => ipcRenderer.invoke("models:catalog"),
  createProject: (input: unknown) => ipcRenderer.invoke("project:create", input),
  updateProject: (id: string, patch: unknown) =>
    ipcRenderer.invoke("project:update", id, patch),
  createSession: (input?: unknown) => ipcRenderer.invoke("session:create", input),
  updateSession: (id: string, patch: unknown) =>
    ipcRenderer.invoke("session:update", id, patch),
  deleteSession: (id: string) => ipcRenderer.invoke("session:delete", id),
  sendMessage: (id: string, prompt: string, screenshotPath?: string, attachments?: unknown[]) =>
    ipcRenderer.invoke("chat:send", id, prompt, screenshotPath, attachments),
  stopMessage: (id: string) => ipcRenderer.invoke("chat:stop", id),
  updateSettings: (patch: unknown) => ipcRenderer.invoke("settings:update", patch),
  selectDirectory: (initialPath?: string) =>
    ipcRenderer.invoke("dialog:directory", initialPath),
  openPath: (path: string) => ipcRenderer.invoke("path:open", path),
  openExternal: (url: string) => ipcRenderer.invoke("external:open", url),
  claudeStatus: () => ipcRenderer.invoke("claude:status"),
  queryBalance: () => ipcRenderer.invoke("balance:query"),
  getVisionKeyStatus: () => ipcRenderer.invoke("vision:key-status"),
  setVisionApiKey: (value: string) => ipcRenderer.invoke("vision:key:set", value),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  selectAttachments: (kind: "file" | "project") => ipcRenderer.invoke("dialog:attachments", kind),
  readClipboard: () => ipcRenderer.invoke("clipboard:readText"),
  writeClipboard: (text: string) => ipcRenderer.invoke("clipboard:writeText", text),
  getScreenSources: () => ipcRenderer.invoke("screen:sources"),
  saveScreenshot: (dataUrl: string) => ipcRenderer.invoke("screen:save", dataUrl),
  onScreenShortcut: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("screen:shortcut", listener);
    return () => ipcRenderer.removeListener("screen:shortcut", listener);
  },
  onStateChanged: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  },
};

contextBridge.exposeInMainWorld("claudeUI", api);
