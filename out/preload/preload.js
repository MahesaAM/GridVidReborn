"use strict";
const electron = require("electron");
const api = {
  // General IPC
  sendMessage: (message) => electron.ipcRenderer.send("message", message),
  onUpdateAccounts: (callback) => electron.ipcRenderer.on("update-accounts", (_, accounts) => callback(accounts)),
  onUpdateTasks: (callback) => electron.ipcRenderer.on("update-tasks", (_, tasks) => callback(tasks)),
  onLogMessage: (callback) => electron.ipcRenderer.on("log-message", (_, log) => callback(log)),
  onNotification: (callback) => electron.ipcRenderer.on("notification", (_, options) => callback(options)),
  // Account Management
  importAccounts: (filePath) => electron.ipcRenderer.invoke("import-accounts", filePath),
  getAccounts: () => electron.ipcRenderer.invoke("get-accounts"),
  deleteAccount: (id) => electron.ipcRenderer.invoke("delete-account", id),
  openProfileWindow: (email) => electron.ipcRenderer.invoke("open-profile-window", email),
  // Task Management
  startBatch: (tasks, accountIds) => electron.ipcRenderer.invoke("start-batch", tasks, accountIds),
  pauseBatch: () => electron.ipcRenderer.invoke("pause-batch"),
  resumeBatch: () => electron.ipcRenderer.invoke("resume-batch"),
  stopBatch: () => electron.ipcRenderer.invoke("stop-batch"),
  setMaxConcurrency: (concurrency) => electron.ipcRenderer.invoke("set-max-concurrency", concurrency),
  setDownloadPath: (path) => electron.ipcRenderer.invoke("set-download-path", path),
  // Prompt/Image Management
  selectImages: () => electron.ipcRenderer.invoke("select-images"),
  getPrompts: () => electron.ipcRenderer.invoke("get-prompts"),
  // Placeholder for now
  savePrompts: (prompts) => electron.ipcRenderer.invoke("save-prompts", prompts),
  // Placeholder for now
  // Settings
  getSettings: () => electron.ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => electron.ipcRenderer.invoke("save-settings", settings)
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = api;
}
