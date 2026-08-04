import { contextBridge, ipcRenderer } from "electron";

const api = {
  getState: () => ipcRenderer.invoke("state:get"),
  createProject: (input: unknown) => ipcRenderer.invoke("project:create", input),
  createSession: (input?: unknown) => ipcRenderer.invoke("session:create", input),
  updateSession: (id: string, patch: unknown) =>
    ipcRenderer.invoke("session:update", id, patch),
  deleteSession: (id: string) => ipcRenderer.invoke("session:delete", id),
  sendMessage: (id: string, prompt: string) =>
    ipcRenderer.invoke("chat:send", id, prompt),
  stopMessage: (id: string) => ipcRenderer.invoke("chat:stop", id),
  updateSettings: (patch: unknown) => ipcRenderer.invoke("settings:update", patch),
  selectDirectory: (initialPath?: string) =>
    ipcRenderer.invoke("dialog:directory", initialPath),
  openPath: (path: string) => ipcRenderer.invoke("path:open", path),
  openExternal: (url: string) => ipcRenderer.invoke("external:open", url),
  claudeStatus: () => ipcRenderer.invoke("claude:status"),
  queryBalance: () => ipcRenderer.invoke("balance:query"),
  onStateChanged: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  },
};

contextBridge.exposeInMainWorld("claudeUI", api);
