"use strict";
const electron = require("electron");
const node_os = require("node:os");
const node_path = require("node:path");
const path = require("path");
const fs = require("fs/promises");
const Database = require("better-sqlite3");
const keytar = require("keytar");
const uuid = require("uuid");
const puppeteer = require("puppeteer-core");
const getPort = require("get-port");
const child_process = require("child_process");
const notifier = require("node-notifier");
const fs$1 = require("node:fs/promises");
const DB_PATH = path.join(electron.app.getPath("userData"), "database.sqlite");
const SERVICE_NAME = "GridAutomationStudio";
class ProfileManager {
  constructor() {
    this.db = new Database(DB_PATH);
    this.initDb();
  }
  initDb() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        lastLogin TEXT,
        status TEXT DEFAULT 'Ready'
      );
    `);
  }
  async addAccount(email, password) {
    const id = uuid.v4();
    await keytar.setPassword(SERVICE_NAME, id, password);
    this.db.prepare("INSERT INTO accounts (id, email) VALUES (?, ?)").run(id, email);
    return { id, email, status: "Ready" };
  }
  async getAccountPassword(id) {
    return await keytar.getPassword(SERVICE_NAME, id);
  }
  getAccounts() {
    return this.db.prepare("SELECT id, email, lastLogin, status FROM accounts").all();
  }
  updateAccountStatus(id, status) {
    this.db.prepare("UPDATE accounts SET status = ? WHERE id = ?").run(status, id);
  }
  updateAccountLastLogin(id) {
    this.db.prepare("UPDATE accounts SET lastLogin = ? WHERE id = ?").run((/* @__PURE__ */ new Date()).toISOString(), id);
  }
  async importAccountsFromExcel(filePath) {
    const { parseAccountExcel } = await Promise.resolve().then(() => require("./excel-loader-BYtvEX7-.js"));
    const accountsData = parseAccountExcel(filePath);
    const addedAccounts = [];
    for (const acc of accountsData) {
      try {
        const newAccount = await this.addAccount(acc.email, acc.password);
        addedAccounts.push(newAccount);
      } catch (error) {
        if (error.message.includes("UNIQUE constraint failed")) {
          console.warn(`Account ${acc.email} already exists. Skipping.`);
        } else {
          console.error(`Failed to add account ${acc.email}:`, error);
        }
      }
    }
    return addedAccounts;
  }
  async deleteAccount(id) {
    await keytar.deletePassword(SERVICE_NAME, id);
    this.db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
    const userDataDir = path.join(electron.app.getPath("userData"), "profiles", id);
    try {
      await fs.rm(userDataDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to remove profile directory for ${id}:`, error);
    }
  }
}
const profileManager = new ProfileManager();
function findChromePath() {
  const platform = process.platform;
  if (platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  } else if (platform === "win32") {
    const paths = [
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    ];
    for (const p of paths) {
      if (require("node:fs").existsSync(p)) {
        return p;
      }
    }
  } else if (platform === "linux") {
    return "/usr/bin/google-chrome";
  }
  return void 0;
}
async function launchProfile(email) {
  const userDataDir = path.join(electron.app.getPath("userData"), "profiles", email);
  const port = await getPort();
  const chromePath = findChromePath();
  if (!chromePath) {
    throw new Error(
      "Chrome/Chromium executable not found. Please ensure Chrome is installed."
    );
  }
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    // Recommended for Electron/Puppeteer
    "--no-sandbox"
    // Required for Linux environments
  ];
  const chromeProcess = child_process.spawn(chromePath, args, {
    detached: true,
    stdio: "ignore"
  });
  let browser;
  for (let i = 0; i < 10; i++) {
    try {
      browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${port}`
      });
      break;
    } catch (e) {
      await new Promise((resolve) => setTimeout(resolve, 1e3));
    }
  }
  if (!browser) {
    throw new Error(`Could not connect to Puppeteer for profile ${email}`);
  }
  return { browser, port, chromeProcess };
}
async function closeProfile(browser, chromeProcess) {
  await browser.close();
  if (chromeProcess && !chromeProcess.killed) {
    chromeProcess.kill("SIGKILL");
  }
}
class TaskRunner {
  constructor() {
    this.activeTasks = /* @__PURE__ */ new Map();
    this.taskQueue = [];
    this.accountQueue = [];
    this.maxConcurrency = 3;
    this.runningConcurrency = 0;
    this.isRunning = false;
    this.downloadPath = path.join(
      electron.app.getPath("downloads"),
      "GridAutomationStudio"
    );
    fs.mkdir(this.downloadPath, { recursive: true }).catch(console.error);
  }
  setMaxConcurrency(concurrency) {
    this.maxConcurrency = concurrency;
  }
  setDownloadPath(path2) {
    this.downloadPath = path2;
    fs.mkdir(this.downloadPath, { recursive: true }).catch(console.error);
  }
  async startBatch(tasks, accountIds) {
    if (this.isRunning) {
      console.warn("Batch is already running.");
      return;
    }
    this.isRunning = true;
    this.taskQueue = tasks;
    this.accountQueue = accountIds;
    this.runningConcurrency = 0;
    this.processQueue();
  }
  pauseBatch() {
    this.isRunning = false;
    console.log("Batch paused.");
  }
  resumeBatch() {
    if (this.isRunning) {
      console.warn("Batch is already running.");
      return;
    }
    this.isRunning = true;
    this.processQueue();
    console.log("Batch resumed.");
  }
  stopBatch() {
    this.isRunning = false;
    this.taskQueue = [];
    this.accountQueue = [];
    this.activeTasks.forEach(async ({ browser, chromeProcess }) => {
      await closeProfile(browser, chromeProcess);
    });
    this.activeTasks.clear();
    this.runningConcurrency = 0;
    console.log("Batch stopped and all browsers closed.");
  }
  async processQueue() {
    if (!this.isRunning) return;
    while (this.runningConcurrency < this.maxConcurrency && this.accountQueue.length > 0) {
      const accountId = this.accountQueue.shift();
      if (accountId) {
        this.runningConcurrency++;
        this.runAccountTasks(accountId).finally(() => {
          this.runningConcurrency--;
          this.processQueue();
        });
      }
    }
    if (this.runningConcurrency === 0 && this.accountQueue.length === 0 && this.taskQueue.length === 0) {
      console.log("Batch completed!");
      notifier.notify({
        title: "GridAutomation Studio",
        message: "Batch automation completed!",
        sound: true
      });
      this.isRunning = false;
    }
  }
  async runAccountTasks(accountId) {
    const account = profileManager.getAccounts().find((acc) => acc.id === accountId);
    if (!account) {
      console.error(`Account with ID ${accountId} not found.`);
      return;
    }
    profileManager.updateAccountStatus(accountId, "Running");
    let browser;
    let chromeProcess;
    try {
      const password = await profileManager.getAccountPassword(accountId);
      if (!password) {
        throw new Error(`Password not found for account ${account.email}`);
      }
      ({ browser, chromeProcess } = await launchProfile(account.email));
      this.activeTasks.set(accountId, { browser, chromeProcess });
      const accountTasks = this.taskQueue.filter(
        (task) => task.accountId === accountId && task.status === "pending"
      );
      for (const task of accountTasks) {
        if (!this.isRunning) {
          profileManager.updateAccountStatus(accountId, "Paused");
          return;
        }
        task.status = "running";
        console.log(
          `Running task ${task.id} for account ${account.email}: ${task.content}`
        );
        await new Promise(
          (resolve) => setTimeout(resolve, Math.random() * 5e3 + 2e3)
        );
        if (Math.random() > 0.2) {
          task.status = "completed";
          task.outputPath = path.join(this.downloadPath, `${task.id}.mp4`);
          console.log(`Task ${task.id} completed for ${account.email}`);
        } else {
          task.status = "failed";
          task.error = "Simulated error during generation.";
          console.error(`Task ${task.id} failed for ${account.email}`);
        }
      }
      profileManager.updateAccountStatus(accountId, "Ready");
      profileManager.updateAccountLastLogin(accountId);
    } catch (error) {
      console.error(`Error running tasks for account ${account.email}:`, error);
      profileManager.updateAccountStatus(accountId, "Failed");
      notifier.notify({
        title: "GridAutomation Studio - Error",
        message: `Automation failed for ${account.email}: ${error.message}`,
        sound: true
      });
    } finally {
      if (browser && chromeProcess) {
        await closeProfile(browser, chromeProcess);
        this.activeTasks.delete(accountId);
      }
    }
  }
}
const taskRunner = new TaskRunner();
process.env.DIST_ELECTRON = node_path.join(__dirname, "../");
process.env.DIST = node_path.join(process.env.DIST_ELECTRON, "../dist");
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL ? node_path.join(process.env.DIST_ELECTRON, "../public") : node_path.join(process.env.DIST_ELECTRON, "../dist");
if (node_os.release().startsWith("6.1")) electron.app.disableHardwareAcceleration();
if (process.platform === "win32") electron.app.setAppUserModelId(electron.app.getName());
if (!electron.app.requestSingleInstanceLock()) {
  electron.app.quit();
  process.exit(0);
}
let win = null;
const remoteDebuggingPort = 9222;
function sendLogToRenderer(message) {
  win?.webContents.send(
    "log-message",
    `[${(/* @__PURE__ */ new Date()).toLocaleString()}] ${message}`
  );
}
const settingsPath = node_path.join(electron.app.getPath("userData"), "settings.json");
let appSettings = {
  downloadPath: node_path.join(electron.app.getPath("downloads"), "GridAutomationStudio"),
  maxConcurrency: 3,
  uiTheme: "dark"
  // Add other settings as needed
};
async function loadSettings() {
  try {
    const data = await fs$1.readFile(settingsPath, "utf-8");
    appSettings = { ...appSettings, ...JSON.parse(data) };
    taskRunner.setMaxConcurrency(appSettings.maxConcurrency);
    taskRunner.setDownloadPath(appSettings.downloadPath);
  } catch (error) {
    console.log("No settings file found, using defaults.");
    await saveSettings(appSettings);
  }
}
async function saveSettings(settings) {
  appSettings = { ...appSettings, ...settings };
  await fs$1.writeFile(settingsPath, JSON.stringify(appSettings, null, 2));
  taskRunner.setMaxConcurrency(appSettings.maxConcurrency);
  taskRunner.setDownloadPath(appSettings.downloadPath);
  return appSettings;
}
const url = process.env.VITE_DEV_SERVER_URL;
const indexHtml = node_path.join(process.env.DIST, "index.html");
async function createWindow() {
  win = new electron.BrowserWindow({
    title: "GridAutomation Studio",
    icon: node_path.join(process.env.VITE_PUBLIC, "favicon.ico"),
    width: 1200,
    height: 800,
    minWidth: 1e3,
    minHeight: 600,
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      // Temporarily disable for local development with Puppeteer
      devTools: true,
      // Enable dev tools for debugging
      additionalArguments: [`--remote-debugging-port=${remoteDebuggingPort}`]
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(url);
    win.webContents.openDevTools();
  } else {
    win.loadFile(indexHtml);
  }
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
    win?.webContents.send("update-accounts", profileManager.getAccounts());
  });
  win.webContents.setWindowOpenHandler(({ url: url2 }) => {
    if (url2.startsWith("https:")) electron.shell.openExternal(url2);
    return { action: "deny" };
  });
}
electron.app.whenReady().then(createWindow);
electron.app.on("window-all-closed", () => {
  win = null;
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
electron.app.on("activate", () => {
  const allWindows = electron.BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});
electron.ipcMain.on("message", (event, message) => {
  console.log("Message from renderer:", message);
  sendLogToRenderer(`Renderer message: ${message}`);
});
electron.ipcMain.handle("import-accounts", async (event, filePath) => {
  try {
    const newAccounts = await profileManager.importAccountsFromExcel(filePath);
    win?.webContents.send("update-accounts", profileManager.getAccounts());
    sendLogToRenderer(
      `Imported ${newAccounts.length} accounts from ${filePath}`
    );
    return newAccounts;
  } catch (error) {
    console.error("Failed to import accounts:", error);
    sendLogToRenderer(`ERROR: Failed to import accounts: ${error.message}`);
    throw error;
  }
});
electron.ipcMain.handle("get-accounts", () => {
  return profileManager.getAccounts();
});
electron.ipcMain.handle("delete-account", async (event, id) => {
  try {
    await profileManager.deleteAccount(id);
    win?.webContents.send("update-accounts", profileManager.getAccounts());
    sendLogToRenderer(`Deleted account with ID: ${id}`);
  } catch (error) {
    console.error(`Failed to delete account ${id}:`, error);
    sendLogToRenderer(
      `ERROR: Failed to delete account ${id}: ${error.message}`
    );
    throw error;
  }
});
electron.ipcMain.handle("open-profile-window", async (event, email) => {
  try {
    const { browser, chromeProcess } = await launchProfile(email);
    const profileWindow = new electron.BrowserWindow({
      width: 1e3,
      height: 800,
      title: `Profile: ${email}`,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false
        // Important for Puppeteer to control it
      }
    });
    profileWindow.loadURL("about:blank");
    const page = (await browser.pages())[0];
    if (page) {
      profileWindow.loadURL("https://accounts.google.com/");
    }
    profileWindow.on("closed", async () => {
      console.log(`Profile window for ${email} closed.`);
    });
    sendLogToRenderer(`Opened manual intervention window for ${email}`);
  } catch (error) {
    console.error(`Failed to open profile window for ${email}:`, error);
    sendLogToRenderer(
      `ERROR: Failed to open profile window for ${email}: ${error.message}`
    );
    throw error;
  }
});
electron.ipcMain.handle(
  "start-batch",
  async (event, tasks, accountIds) => {
    try {
      await taskRunner.startBatch(tasks, accountIds);
      sendLogToRenderer("Batch automation started.");
    } catch (error) {
      console.error("Failed to start batch:", error);
      sendLogToRenderer(`ERROR: Failed to start batch: ${error.message}`);
      throw error;
    }
  }
);
electron.ipcMain.handle("pause-batch", async () => {
  taskRunner.pauseBatch();
  sendLogToRenderer("Batch automation paused.");
});
electron.ipcMain.handle("resume-batch", async () => {
  taskRunner.resumeBatch();
  sendLogToRenderer("Batch automation resumed.");
});
electron.ipcMain.handle("stop-batch", async () => {
  taskRunner.stopBatch();
  sendLogToRenderer("Batch automation stopped.");
});
electron.ipcMain.handle("set-max-concurrency", async (event, concurrency) => {
  taskRunner.setMaxConcurrency(concurrency);
  await saveSettings({ maxConcurrency: concurrency });
  sendLogToRenderer(`Max concurrency set to ${concurrency}`);
});
electron.ipcMain.handle("set-download-path", async (event, path2) => {
  taskRunner.setDownloadPath(path2);
  await saveSettings({ downloadPath: path2 });
  sendLogToRenderer(`Download path set to ${path2}`);
});
electron.ipcMain.handle("select-images", async () => {
  const { canceled, filePaths } = await electron.dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "gif"] }]
  });
  if (!canceled) {
    sendLogToRenderer(`Selected ${filePaths.length} images.`);
    return filePaths;
  }
  return [];
});
electron.ipcMain.handle("get-prompts", () => {
  return ["Prompt 1", "Prompt 2", "Prompt 3"];
});
electron.ipcMain.handle("save-prompts", async (event, prompts) => {
  sendLogToRenderer(`Saved ${prompts.length} prompts.`);
});
electron.ipcMain.handle("get-settings", () => {
  return appSettings;
});
electron.ipcMain.handle("save-settings", async (event, settings) => {
  const updatedSettings = await saveSettings(settings);
  sendLogToRenderer("Settings saved.");
  return updatedSettings;
});
electron.app.whenReady().then(loadSettings);
