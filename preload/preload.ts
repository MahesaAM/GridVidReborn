/// <reference types="electron" />
// preload.js
import { contextBridge, ipcRenderer } from "electron";

// Declare window.chrome to avoid TypeScript errors in preload
declare global {
  interface Window {
    chrome: {
      runtime: {};
      // Add other properties that might be checked
    };
  }
}

// 1. Menghapus properti 'webdriver' yang menjadi penanda utama otomatisasi
Object.defineProperty(navigator, "webdriver", {
  get: () => undefined,
});

// 2. Mengelabui detektor 'window.chrome'
// Beberapa situs memeriksa apakah objek `window.chrome` ada dan memiliki properti tertentu.
window.chrome = {
  runtime: {},
  // Anda bisa menambahkan properti lain yang mungkin diperiksa
};

// 3. Menyamarkan daftar plugin browser
// Chrome asli melaporkan beberapa plugin default seperti PDF Viewer.
const mockPlugins = [
  {
    name: "Chrome PDF Plugin",
    filename: "internal-pdf-viewer",
    description: "Portable Document Format",
    mimeTypes: [{ type: "application/x-google-chrome-pdf", suffixes: "pdf" }],
  },
  {
    name: "Chrome PDF Viewer",
    filename: "internal-pdf-viewer",
    description: "Portable Document Format",
    mimeTypes: [{ type: "application/pdf", suffixes: "pdf" }],
  },
  {
    name: "Native Client",
    filename: "internal-nacl-plugin",
    description: "",
    mimeTypes: [
      { type: "application/x-nacl", suffixes: "" },
      { type: "application/x-pnacl", suffixes: "" },
    ],
  },
];

// Menggunakan defineProperty untuk membuatnya terlihat lebih otentik
Object.defineProperty(navigator, "plugins", {
  get: () => mockPlugins,
});

// 4. Menyamarkan daftar MIME types
const mockMimeTypes = [
  { type: "application/pdf", suffixes: "pdf", enabledPlugin: mockPlugins[1] },
  {
    type: "application/x-google-chrome-pdf",
    suffixes: "pdf",
    enabledPlugin: mockPlugins[0],
  },
  { type: "application/x-nacl", suffixes: "", enabledPlugin: mockPlugins[2] },
  { type: "application/x-pnacl", suffixes: "", enabledPlugin: mockPlugins[2] },
];

Object.defineProperty(navigator, "mimeTypes", {
  get: () => mockMimeTypes,
});

// 5. Memberi tahu konsol bahwa script ini telah berjalan
console.log("Preload script executed: Electron fingerprints cleaned.");

// Expose Electron API to the renderer process
contextBridge.exposeInMainWorld("electron", {
  sendMessage: (message: string) => ipcRenderer.send("message", message),
  onUpdateAccounts: (callback: (accounts: any[]) => void) => {
    ipcRenderer.on("update-accounts", (_event, accounts) => callback(accounts));
    return () => ipcRenderer.removeListener("update-accounts", callback);
  },
  onUpdateTasks: (callback: (tasks: any[]) => void) => {
    ipcRenderer.on("update-tasks", (_event, tasks) => callback(tasks));
    return () => ipcRenderer.removeListener("update-tasks", callback);
  },
  onLogMessage: (callback: (log: string) => void) => {
    ipcRenderer.on("log-message", (_event, log) => callback(log));
    return () => ipcRenderer.removeListener("log-message", callback);
  },
  onNotification: (callback: (options: any) => void) => {
    ipcRenderer.on("notification", (_event, options) => callback(options));
    return () => ipcRenderer.removeListener("notification", callback);
  },
  selectExcelFile: () => ipcRenderer.invoke("select-excel-file"),
  importAccounts: (filePath: string) =>
    ipcRenderer.invoke("import-accounts", filePath),
  getAccounts: () => ipcRenderer.invoke("get-accounts"),
  getFirstAccount: () => ipcRenderer.invoke("get-first-account"),
  getAccountPassword: (id: string) =>
    ipcRenderer.invoke("get-account-password", id),
  addAccount: (email: string, password: string) =>
    ipcRenderer.invoke("add-account", email, password),
  deleteAccount: (id: string) => ipcRenderer.invoke("delete-account", id),
  openProfileWindow: (email: string) =>
    ipcRenderer.invoke("open-profile-window", email),
  startBatch: (tasks: any[], accountIds: string[]) =>
    ipcRenderer.invoke("start-batch", tasks, accountIds),
  pauseBatch: () => ipcRenderer.invoke("pause-batch"),
  resumeBatch: () => ipcRenderer.invoke("resume-batch"),
  stopBatch: () => ipcRenderer.invoke("stop-batch"),
  setMaxConcurrency: (concurrency: number) =>
    ipcRenderer.invoke("set-max-concurrency", concurrency),
  setDownloadPath: (path: string) =>
    ipcRenderer.invoke("set-download-path", path),
  selectImages: () => ipcRenderer.invoke("select-images"),
  getPrompts: () => ipcRenderer.invoke("get-prompts"),
  savePrompts: (prompts: string[]) =>
    ipcRenderer.invoke("save-prompts", prompts),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings: any) =>
    ipcRenderer.invoke("save-settings", settings),
  startVideoGeneration: (options: any) =>
    ipcRenderer.invoke("start-video-generation", options),
  stopVideoGeneration: () => ipcRenderer.invoke("stop-video-generation"),
  onTextToVideoLog: (callback: (message: string) => void) => {
    ipcRenderer.on("text-to-video-log", (_event, message) => callback(message));
    return () => ipcRenderer.removeListener("text-to-video-log", callback);
  },
  testBrowserControl: () => ipcRenderer.invoke("test-browser-control"),
  getWebviewPreloadPath: () => ipcRenderer.invoke("get-webview-preload-path"),
  createPopupWindow: (options: {
    url: string;
    width?: number;
    height?: number;
    title?: string;
  }) => ipcRenderer.invoke("create-popup-window", options),
  getPopupPreloadPath: () => ipcRenderer.invoke("get-popup-preload-path"),
  onAllowButtonClicked: (callback: () => void) => {
    ipcRenderer.on("allow-button-clicked", callback);
    return () => ipcRenderer.removeListener("allow-button-clicked", callback);
  },
  onAutoAllowClicked: (callback: () => void) => {
    ipcRenderer.on("auto-allow-clicked", callback);
    return () => ipcRenderer.removeListener("auto-allow-clicked", callback);
  },
  onAllowButtonNotFound: (callback: () => void) => {
    ipcRenderer.on("allow-button-not-found", callback);
    return () => ipcRenderer.removeListener("allow-button-not-found", callback);
  },
  clickAllowButton: () => ipcRenderer.send("click-allow-button"),
});
