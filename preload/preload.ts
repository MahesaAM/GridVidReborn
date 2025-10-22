import { contextBridge, ipcRenderer } from "electron";

// Custom APIs for renderer
const api = {
  // General IPC
  sendMessage: (message: string) => ipcRenderer.send("message", message),
  onUpdateAccounts: (callback: (accounts: any[]) => void) => {
    const handler = (_, accounts: any[]) => callback(accounts);
    ipcRenderer.on("update-accounts", handler);
    return () => ipcRenderer.off("update-accounts", handler);
  },
  onUpdateTasks: (callback: (tasks: any[]) => void) => {
    const handler = (_, tasks: any[]) => callback(tasks);
    ipcRenderer.on("update-tasks", handler);
    return () => ipcRenderer.off("update-tasks", handler);
  },
  onLogMessage: (callback: (log: string) => void) => {
    const handler = (_, log: string) => callback(log);
    ipcRenderer.on("log-message", handler);
    return () => ipcRenderer.off("log-message", handler);
  },
  onNotification: (callback: (options: any) => void) => {
    const handler = (_, options: any) => callback(options);
    ipcRenderer.on("notification", handler);
    return () => ipcRenderer.off("notification", handler);
  },

  // Account Management
  importAccounts: (filePath: string) =>
    ipcRenderer.invoke("import-accounts", filePath),
  getAccounts: () => ipcRenderer.invoke("get-accounts"),
  getFirstAccount: () => ipcRenderer.invoke("get-first-account"),
  getAccountPassword: (id: string) =>
    ipcRenderer.invoke("get-account-password", id),
  deleteAccount: (id: string) => ipcRenderer.invoke("delete-account", id),
  openProfileWindow: (email: string) =>
    ipcRenderer.invoke("open-profile-window", email),

  // Task Management
  startBatch: (tasks: any[], accountIds: string[]) =>
    ipcRenderer.invoke("start-batch", tasks, accountIds),
  pauseBatch: () => ipcRenderer.invoke("pause-batch"),
  resumeBatch: () => ipcRenderer.invoke("resume-batch"),
  stopBatch: () => ipcRenderer.invoke("stop-batch"),
  setMaxConcurrency: (concurrency: number) =>
    ipcRenderer.invoke("set-max-concurrency", concurrency),
  setDownloadPath: (path: string) =>
    ipcRenderer.invoke("set-download-path", path),

  // Prompt/Image Management
  selectImages: () => ipcRenderer.invoke("select-images"),
  selectExcelFile: () => ipcRenderer.invoke("select-excel-file"),
  getPrompts: () => ipcRenderer.invoke("get-prompts"), // Placeholder for now
  savePrompts: (prompts: string[]) =>
    ipcRenderer.invoke("save-prompts", prompts), // Placeholder for now

  // Settings
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings: any) =>
    ipcRenderer.invoke("save-settings", settings),

  // Video Generation
  startVideoGeneration: (options: {
    prompts: string[];
    savePath: string;
    aspectRatio: string;
    duration: string;
    accountIds: string[];
  }) => ipcRenderer.invoke("start-video-generation", options),
  stopVideoGeneration: () => ipcRenderer.invoke("stop-video-generation"),
  onTextToVideoLog: (callback: (event: any, message: string) => void) => {
    const handler = (event: any, message: string) => callback(event, message);
    ipcRenderer.on("log-message", handler);
    return () => ipcRenderer.off("log-message", handler);
  },
  testBrowserControl: () => ipcRenderer.invoke("test-browser-control"),

  // Single Account Login
  loginSingleAccount: (account: { email: string; password: string }) =>
    ipcRenderer.invoke("login-single-account", account),
};

// Use `contextBridge`s to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just directly add to the DOM global object (window)
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = api;
}
