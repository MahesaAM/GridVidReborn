import { app, BrowserWindow, shell, ipcMain, dialog, session } from "electron";
import { release } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url"; // Import pathToFileURL directly
import { profileManager } from "./profile-manager";
import { taskRunner, AutomationTask } from "./task-runner";
import { parseAccountExcel } from "./excel-loader";
import { launchProfile } from "./puppeteer-manager";
import { runLoginAll, stopLogin } from "./login-manager";
import notifier, { Notification } from "node-notifier";
import fs from "node:fs/promises";
import puppeteer from "puppeteer-core";
import path from "node:path";
import https from "node:https";
import { performance } from "node:perf_hooks";

// Contoh User-Agent dari Chrome 125 di Windows 10
const genuineChromeUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// Atur User-Agent secara global sebelum aplikasi siap
app.userAgentFallback = genuineChromeUserAgent;

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ ├─┬ preload
// │ │ └── index.js    > Preload-Scripts
// │ └─┬ renderer
// │   └── index.html  > Electron-Renderer
//
process.env.DIST_ELECTRON = join(__dirname, "../");
process.env.DIST = join(process.env.DIST_ELECTRON, "../dist");
process.env.VITE_PUBLIC = (import.meta.env as any).VITE_DEV_SERVER_URL
  ? join(process.env.DIST_ELECTRON, "../public")
  : join(process.env.DIST_ELECTRON, "../dist");

// Disable GPU Acceleration for Windows 7
if (release().startsWith("6.1")) app.disableHardwareAcceleration();

// Set application name for Windows 10
if (process.platform === "win32") app.setAppUserModelId(app.getName());

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Remove electron security warnings
// process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

// Disable Cross-Origin policies and third-party cookie blocking for Google OAuth
app.commandLine.appendSwitch("disable-features", "AutomationControlled");
app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");
app.commandLine.appendSwitch(
  "enable-features",
  "NetworkService,NetworkServiceInProcess"
);
app.commandLine.appendSwitch("disable-features", "CrossOriginOpenerPolicy");
app.commandLine.appendSwitch("disable-features", "CrossOriginEmbedderPolicy");
app.commandLine.appendSwitch(
  "disable-features",
  "SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure"
);

let win: BrowserWindow | null = null;
let popupWindow: BrowserWindow | null = null; // Declare popupWindow here
// Here you can define the specific port for remote debugging
const remoteDebuggingPort = 9222;

// Logger function to send messages to the renderer
function sendLogToRenderer(message: string) {
  win?.webContents.send(
    "log-message",
    `[${new Date().toLocaleString()}] ${message}`
  );
}

// Handle notifications from main process
function sendNotificationToRenderer(options: notifier.Notification) {
  win?.webContents.send("notification", options);
  notifier.notify(options);
}

// Settings storage (simple JSON for now)
const settingsPath = join(app.getPath("userData"), "settings.json");
let appSettings = {
  downloadPath: join(app.getPath("downloads"), "GridAutomationStudio"),
  maxConcurrency: 3,
  uiTheme: "dark",
  // Add other settings as needed
};

// Video generation configuration
const CUSTOM_ROOT =
  process.platform === "win32"
    ? "C:/profiles"
    : `/Users/${process.env.USER || "pttas"}`;
const ROOT = CUSTOM_ROOT;
const PROFILES_DIR = path.resolve(ROOT, "profiles");
const PROFILES_ROOT = PROFILES_DIR; // Alias for compatibility
const AI_STUDIO_URL =
  "https://aistudio.google.com/prompts/new_video?model=veo-2.0-generate-001";
let currentBrowser: any = null;
let stopSignal = { stop: false };

// Sanitize email to use as folder name
function sanitize(email: string): string {
  return email.replace(/[@.]/g, "_");
}

async function loadSettings() {
  try {
    const data = await fs.readFile(settingsPath, "utf-8");
    appSettings = { ...appSettings, ...JSON.parse(data) };
    taskRunner.setMaxConcurrency(appSettings.maxConcurrency);
    taskRunner.setDownloadPath(appSettings.downloadPath);
  } catch (error) {
    console.log("No settings file found, using defaults.");
    await saveSettings(appSettings); // Create default settings file
  }
}

async function saveSettings(settings: any) {
  appSettings = { ...appSettings, ...settings };
  await fs.writeFile(settingsPath, JSON.stringify(appSettings, null, 2));
  taskRunner.setMaxConcurrency(appSettings.maxConcurrency);
  taskRunner.setDownloadPath(appSettings.downloadPath);
  return appSettings;
}

const url = (import.meta.env as any).VITE_DEV_SERVER_URL;

async function createWindow() {
  win = new BrowserWindow({
    title: "GridVid",
    icon: join(process.env.VITE_PUBLIC!, "favicon.ico"),
    width: 1920,
    height: 1080,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      devTools: true, // Enable dev tools for debugging
      additionalArguments: [
        `--remote-debugging-port=${remoteDebuggingPort}`,
        // Remove restrictive flags that prevent normal browsing
        // "--disable-extensions-except=/dev/null",
        // "--disable-extensions",
        // "--disable-plugins",
        // "--disable-default-apps",
        // "--disable-sync",
        // "--disable-translate",
        // "--hide-scrollbars",
        // "--metrics-recording-only",
        // "--mute-audio",
        // "--no-crash-upload",
        // "--disable-logging",
        // "--disable-login-animations",
        // "--disable-notifications",
        // "--disable-permissions-api",
        // "--disable-session-crashed-bubble",
        // "--disable-infobars",
        // "--disable-component-extensions-with-background-pages",
        // "--disable-background-networking",
        // "--disable-component-update",
        // "--disable-domain-reliability",
        // "--disable-client-side-phishing-detection",
        // "--disable-field-trial-config",
        // "--disable-back-forward-cache",
        // "--disable-hang-monitor",
        // "--disable-prompt-on-repost",
        // "--force-color-profile=srgb",
        // "--disable-features=UserMediaScreenCapturing",
        // "--disable-popup-blocking",
        // "--disable-print-preview",
        // "--disable-background-timer-throttling",
        // "--disable-backgrounding-occluded-windows",
        // "--disable-renderer-backgrounding",
        // "--disable-ipc-flooding-protection",
      ],
      partition: "persist:main", // Use persistent session for cookies
      webviewTag: true, // Enable webview tag
    },
  });

  try {
    if ((import.meta.env as any).VITE_DEV_SERVER_URL) {
      // electron-vite-vue#298
      await win.loadURL(url!);
      // Open devTool if the app is not packaged
      // win.webContents.openDevTools();
    } else {
      win.loadFile(join(process.env.DIST!, "index.html"));
      // Open devTools in production for debugging
      // win.webContents.openDevTools();
    }
  } catch (error) {
    console.error("Failed to load window URL:", error);
    sendLogToRenderer(
      `ERROR: Failed to load window URL: ${(error as Error).message}`
    );
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
    // Send initial accounts and tasks to renderer
    win?.webContents.send("update-accounts", profileManager.getAccounts());
    // win?.webContents.send('update-tasks', taskRunner.getTasks()); // Assuming taskRunner has a getTasks method
  });

  // Handle popup windows from webview (Google OAuth)
  win!.webContents.setWindowOpenHandler(({ url }) => {
    // Check if it's a Google OAuth or accounts URL
    if (
      url.includes("accounts.google.com") ||
      url.includes("oauth2") ||
      url.includes("drive.google.com")
    ) {
      popupWindow = new BrowserWindow({
        // Assign to popupWindow
        width: 600,
        height: 700,
        parent: win!,
        modal: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          partition: "persist:main", // Use same partition for session persistence
          preload: join(__dirname, "../preload/preload-webview.js"), // Correct preload script
        },
      });

      popupWindow.loadURL(url);
      popupWindow.on("closed", () => {
        popupWindow = null; // Clear reference when closed
      });
      return { action: "deny" }; // Prevent default behavior
    }

    // For other external links, open in default browser
    if (url.startsWith("https:")) shell.openExternal(url);
    return { action: "deny" };
  });

  // Allow permissions for Google domains
  session.defaultSession.setPermissionRequestHandler(
    (
      webContents: any,
      permission: string,
      callback: (permissionGranted: boolean) => void
    ) => {
      if (["openExternal", "popup", "fullscreen"].includes(permission)) {
        callback(true);
      } else {
        callback(false);
      }
    }
  );

  // Optional: log every popup created
  win!.webContents.on("did-create-window", (child) => {
    console.log("Popup created:", child.webContents.getURL());
  });

  // win.webContents.on('will-navigate', (event, url) => { }) #344
}

// app.whenReady().then(createWindow); // Removed duplicate call

app.on("window-all-closed", () => {
  win = null;
  if (process.platform !== "darwin") app.quit();
});

app.on("second-instance", () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on("activate", () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});

// IPC Handlers
ipcMain.on("message", (event, message) => {
  console.log("Message from renderer:", message);
  sendLogToRenderer(`Renderer message: ${message}`);
});

ipcMain.handle("import-accounts", async (event, filePath: string) => {
  try {
    const newAccounts = await profileManager.importAccountsFromExcel(filePath);
    win?.webContents.send("update-accounts", profileManager.getAccounts());
    const importedCount = Array.isArray(newAccounts) ? newAccounts.length : 0;
    sendLogToRenderer(`Imported ${importedCount} accounts from ${filePath}`);
    return newAccounts;
  } catch (error: any) {
    console.error("Failed to import accounts:", error);
    sendLogToRenderer(`ERROR: Failed to import accounts: ${error.message}`);
    throw error;
  }
});

ipcMain.handle("get-accounts", () => {
  return profileManager.getAccounts();
});

ipcMain.handle("get-first-account", async () => {
  const accounts = profileManager.getAccounts();
  if (accounts.length === 0) {
    throw new Error("No accounts available");
  }
  const firstAccount = accounts[0];
  const password = await profileManager.getAccountPassword(firstAccount.id);
  return {
    email: firstAccount.email,
    password: password,
  };
});

ipcMain.handle("get-account-password", async (event, id: string) => {
  return await profileManager.getAccountPassword(id);
});

ipcMain.handle("delete-account", async (event, id: string) => {
  try {
    await profileManager.deleteAccount(id);
    win?.webContents.send("update-accounts", profileManager.getAccounts());
    sendLogToRenderer(`Deleted account with ID: ${id}`);
  } catch (error: any) {
    console.error(`Failed to delete account ${id}:`, error);
    sendLogToRenderer(
      `ERROR: Failed to delete account ${id}: ${error.message}`
    );
    throw error;
  }
});

ipcMain.handle("open-profile-window", async (event, email: string) => {
  try {
    const { browser, chromeProcess } = await launchProfile(email);
    // Create a new BrowserWindow to display the Puppeteer-controlled browser
    const profileWindow = new BrowserWindow({
      width: 1000,
      height: 800,
      title: `Profile: ${email}`,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false, // Important for Puppeteer to control it
      },
    });

    // Load a blank page initially, Puppeteer will navigate it
    try {
      await profileWindow.loadURL("about:blank");
    } catch (error) {
      console.error("Failed to load blank page in profile window:", error);
      sendLogToRenderer(
        `ERROR: Failed to load blank page in profile window: ${
          (error as Error).message
        }`
      );
    }

    // Attach Puppeteer to this window's webContents
    const page = (await browser.pages())[0]; // Get the first page
    if (page) {
      // This part is tricky: directly attaching Puppeteer to an existing BrowserWindow's webContents
      // is not straightforward. A common approach is to open a new window via Puppeteer
      // and then manage that window. For manual intervention, we might just open a new
      // Electron window and let the user interact with it, while Puppeteer is paused.
      // For now, we'll just open a new Electron window and let the user interact.
      // The Puppeteer instance launched by launchProfile is separate.
      // To truly control an Electron BrowserWindow with Puppeteer, you'd need to
      // use electron-puppeteer or similar, or ensure the BrowserWindow is launched
      // with remote debugging enabled and connect Puppeteer to it.
      // For manual intervention, we'll just open a new Electron window.
      try {
        await profileWindow.loadURL("https://accounts.google.com/"); // Example: open Google login
      } catch (error) {
        console.error(
          "Failed to load Google accounts in profile window:",
          error
        );
        sendLogToRenderer(
          `ERROR: Failed to load Google accounts in profile window: ${
            (error as Error).message
          }`
        );
      }
    }

    profileWindow.on("closed", async () => {
      console.log(`Profile window for ${email} closed.`);
      // Optionally close the Puppeteer browser if it was launched for this manual intervention
      // await closeProfile(browser, chromeProcess);
    });

    sendLogToRenderer(`Opened manual intervention window for ${email}`);
  } catch (error: any) {
    console.error(`Failed to open profile window for ${email}:`, error);
    sendLogToRenderer(
      `ERROR: Failed to open profile window for ${email}: ${error.message}`
    );
    throw error;
  }
});

ipcMain.handle(
  "start-batch",
  async (event, tasks: AutomationTask[], accountIds: string[]) => {
    try {
      await taskRunner.startBatch(tasks, accountIds);
      sendLogToRenderer("Batch automation started.");
    } catch (error: any) {
      console.error("Failed to start batch:", error);
      sendLogToRenderer(`ERROR: Failed to start batch: ${error.message}`);
      throw error;
    }
  }
);

ipcMain.handle("pause-batch", async () => {
  taskRunner.pauseBatch();
  sendLogToRenderer("Batch automation paused.");
});

ipcMain.handle("resume-batch", async () => {
  taskRunner.resumeBatch();
  sendLogToRenderer("Batch automation resumed.");
});

ipcMain.handle("stop-batch", async () => {
  taskRunner.stopBatch();
  sendLogToRenderer("Batch automation stopped.");
});

ipcMain.handle("set-max-concurrency", async (event, concurrency: number) => {
  taskRunner.setMaxConcurrency(concurrency);
  await saveSettings({ maxConcurrency: concurrency });
  sendLogToRenderer(`Max concurrency set to ${concurrency}`);
});

ipcMain.handle("set-download-path", async (event, path: string) => {
  taskRunner.setDownloadPath(path);
  await saveSettings({ downloadPath: path });
  sendLogToRenderer(`Download path set to ${path}`);
});

ipcMain.handle("select-images", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "gif"] }],
  });
  if (!canceled) {
    sendLogToRenderer(`Selected ${filePaths.length} images.`);
    return filePaths;
  }
  return [];
});

ipcMain.handle("select-excel-file", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    properties: ["openFile"],
    filters: [{ name: "Excel Files", extensions: ["xlsx", "xls"] }],
  });
  if (!canceled) {
    sendLogToRenderer(`Selected Excel file: ${filePaths[0]}`);
  }
  return { canceled, filePaths };
});

ipcMain.handle("get-prompts", () => {
  // TODO: Implement actual prompt loading/storage
  return ["Prompt 1", "Prompt 2", "Prompt 3"];
});

ipcMain.handle("save-prompts", async (event, prompts: string[]) => {
  // TODO: Implement actual prompt saving
  sendLogToRenderer(`Saved ${prompts.length} prompts.`);
});

ipcMain.handle("get-settings", () => {
  return appSettings;
});

ipcMain.handle("save-settings", async (event, settings: any) => {
  const updatedSettings = await saveSettings(settings);
  sendLogToRenderer("Settings saved.");
  return updatedSettings;
});

ipcMain.handle(
  "login-single-account",
  async (event, account: { email: string; password: string }) => {
    try {
      const results = await runLoginAll([account], sendLogToRenderer);
      const result = results[0];
      if (result.success) {
        sendLogToRenderer(`Login successful for ${account.email}`);
        // Return the profile directory for the logged-in account
        const profileDir = path.resolve(PROFILES_ROOT, sanitize(account.email));
        return { success: true, profileDir };
      } else {
        sendLogToRenderer(`Login failed for ${account.email}: ${result.error}`);
        return { success: false, error: result.error };
      }
    } catch (error: any) {
      console.error("Login error:", error);
      sendLogToRenderer(`Login error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
);

// Helper functions for video generation
async function ensureDir(dir: string) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function waitAndClick(page: any, selector: string, opts: any = {}) {
  const timeout = opts.timeout || 30000;
  const retry = opts.retry || 3;
  for (let i = 0; i < retry; i++) {
    try {
      await page.waitForSelector(selector, { visible: true, timeout });
      await page.click(selector);
      return;
    } catch (e: any) {
      if (i === retry - 1) throw e;
      await page.waitForTimeout(200 * (i + 1));
    }
  }
}

async function setPromptValue(page: any, text: string) {
  await page.evaluate((t: string) => {
    const ta = document.querySelector(
      'textarea[placeholder="Describe your video"]'
    );
    if (!ta) throw new Error("Prompt textarea not found");
    (ta as HTMLTextAreaElement).value = t;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
  }, text);
}

async function handleSplash(page: any) {
  try {
    await page.waitForSelector("mat-dialog-container", { timeout: 5000 });
    const [btn] = await page.$x(
      "//button[contains(., 'Try Gemini') or contains(., 'Use Google AI Studio')]"
    );
    if (btn) {
      await btn.click();
      await page.waitForSelector("mat-dialog-container", {
        hidden: true,
        timeout: 10000,
      });
    }
  } catch {}
}

async function handleTOS(page: any) {
  try {
    await page.waitForSelector("#mat-mdc-checkbox-0-input", { timeout: 5000 });
    await page.click("#mat-mdc-checkbox-0-input");
    if (await page.$("#mat-mdc-checkbox-1-input")) {
      await page.click("#mat-mdc-checkbox-1-input");
    }
    await waitAndClick(page, 'button[aria-label="Accept terms of service"]');
    await page.waitForSelector("#mat-mdc-checkbox-0-input", {
      hidden: true,
      timeout: 30000,
    });
  } catch {}
}

async function handleAccountChooser(page: any, email: string) {
  try {
    await page.waitForSelector('div[role="button"]', {
      visible: true,
      timeout: 10000,
    });
    const buttons = await page.$$('div[role="button"]');
    for (const btn of buttons) {
      const text = await btn.evaluate((el: any) => el.innerText);
      if (text.includes(email)) {
        await btn.click();
        await page.waitForNavigation({
          waitUntil: "networkidle0",
          timeout: 30000,
        });
        return true;
      }
    }
    const [other] = await page.$x("//div[text()='Use another account']");
    if (other) {
      await other.click();
      await page.waitForNavigation({
        waitUntil: "networkidle0",
        timeout: 30000,
      });
      return true;
    }
  } catch (e: any) {
    console.warn("Account chooser failed:", e.message);
  }
  return false;
}

async function generateAndDownload(
  page: any,
  promptText: string,
  idx: number,
  logCallback: (msg: string) => void,
  savePath: string,
  duration: string,
  aspectRatio: string
) {
  const textareaSel = 'textarea[placeholder="Describe your video"]';
  await page.waitForSelector(textareaSel, { visible: true, timeout: 10000 });
  await setPromptValue(page, promptText);

  // Set duration
  try {
    await page.click('mat-select[id="duration-selector"]');
    await page.waitForTimeout(1000);
    const durationOptionXPath = `//mat-option//span[contains(text(), '${duration}s')]`;
    const [durationOption] = await page.$x(durationOptionXPath);
    await page.waitForTimeout(1000);
    if (durationOption) {
      await durationOption.click();
      logCallback(`Duration set to ${duration}s`);
    }
  } catch (err) {
    logCallback(`Failed to set duration: ${(err as Error).message}`);
  }

  // Set aspect ratio
  try {
    const normalizedAspectRatio = aspectRatio.trim();
    const aspectRatioXPath =
      normalizedAspectRatio === "16:9"
        ? "//ms-aspect-ratio-radio-button//button[.//div[contains(@class, 'aspect-ratio-text') and normalize-space(text())='16:9']]"
        : "//ms-aspect-ratio-radio-button//button[.//div[contains(@class, 'aspect-ratio-text') and normalize-space(text())='9:16']]";
    await page.waitForTimeout(1000);
    const [aspectRatioButton] = await page.$x(aspectRatioXPath);
    await page.waitForTimeout(1000);
    if (aspectRatioButton) {
      await aspectRatioButton.click();
      logCallback(`Aspect ratio set to ${aspectRatio}`);
    }
  } catch (err) {
    logCallback(`Failed to set aspect ratio: ${(err as Error).message}`);
  }

  await page.click(textareaSel);
  try {
    const [promptConfirmBtn] = await page.$x(
      "//button[.//span[text()='Confirm']]"
    );
    if (promptConfirmBtn) await promptConfirmBtn.click();
  } catch {}

  const runBtn = await page.waitForSelector(
    "run-button button:not([disabled])",
    { visible: true, timeout: 60000 }
  );

  const start = performance.now();
  let lastProgress = 0;

  let timer: NodeJS.Timeout;
  timer = setInterval(() => {
    const elapsed = ((performance.now() - start) / 1000).toFixed(2);
    const progress = Math.min(lastProgress + 1, 95);
    lastProgress = progress;
    const remaining =
      progress > 0 ? (parseFloat(elapsed) / progress) * (100 - progress) : 0;
    logCallback(
      `Generating video ${idx + 1}... Progress: ${Math.floor(
        progress
      )}% - Elapsed: ${elapsed}s - Remaining: ${remaining.toFixed(2)}s`
    );
  }, 1000);

  await runBtn.click();
  logCallback(`Prompt #${idx + 1} generating...`);

  const result = await Promise.race([
    (async () => {
      const status = await page.waitForFunction(
        () => (document.querySelectorAll("video").length > 0 ? "video" : null),
        { polling: 500, timeout: 300000 }
      );
      return status === "video" ? "video" : null;
    })(),
    new Promise((_, reject) =>
      setTimeout(() => {
        clearInterval(timer);
        reject(new Error("GenerationTimeout"));
      }, 80000)
    ),
    page
      .waitForFunction(
        (msgs: string[]) =>
          msgs.some((m) => document.body.innerText.includes(m)),
        { polling: 500, timeout: 300000 },
        [
          "quota exceeded",
          "user has exceeded quota",
          "permission denied",
          "access denied",
        ]
      )
      .then(() => {
        if (page.url().includes("accounts.google.com")) return "permission";
        if (document.body.innerText.includes("quota exceeded")) return "quota";
        if (document.body.innerText.includes("user has exceeded quota"))
          return "quota";
        return "permission";
      }),
    page
      .waitForFunction(
        () => document.body.innerText.includes("Failed to generate video."),
        { polling: 500, timeout: 300000 }
      )
      .then(() => "failed"),
    page
      .waitForFunction(
        () =>
          document.body.innerText.includes(
            "Failed to generate video, quota exceeded: free Veo generations are in high demand. AI Studio is currently at its free tier capacity. We're working to process requests, please try yours again in a few moments.. Please try again later."
          ),
        { polling: 500, timeout: 300000 }
      )
      .then(() => {
        clearInterval(timer);
        logCallback(
          `Limit reached: Free tier capacity exceeded at prompt #${idx + 1}`
        );
        throw new Error("LimitReached");
      }),
    page
      .waitForFunction(
        () =>
          document.body.innerText.includes(
            "Failed to generate a video. Your prompt was blocked due to safety reasons."
          ),
        { polling: 500, timeout: 300000 }
      )
      .then(() => {
        clearInterval(timer);
        logCallback(
          `Prompt #${idx + 1} blocked due to safety reasons. Skipping...`
        );
        throw new Error("PromptBlocked");
      }),
    // Check for quota in the UI
    page
      .waitForFunction(
        () => {
          const quotaElements = Array.from(
            document.querySelectorAll(".remaining-quota")
          );
          for (const el of quotaElements) {
            const text = el.textContent || "";
            if (
              text.includes("/10 generations") &&
              text.trim().startsWith("0/")
            ) {
              return "quota_exhausted";
            }
          }
          return null;
        },
        { polling: 1000, timeout: 300000 }
      )
      .then(() => {
        clearInterval(timer);
        logCallback(`Quota exhausted (0/10 generations remaining)`);
        throw new Error("QuotaExhausted");
      }),
  ]);

  if (result === "quota" || result === "quota_exhausted") {
    clearInterval(timer);
    logCallback(`Quota exceeded at prompt #${idx + 1}`);
    throw new Error("QuotaExceeded");
  }
  if (result === "permission") {
    clearInterval(timer);
    logCallback(`Permission denied at prompt #${idx + 1} - switching profile`);
    throw new Error("PermissionDenied");
  }
  if (result === "failed") {
    clearInterval(timer);
    logCallback(`Failed to generate video at prompt #${idx + 1}`);
    throw new Error("VideoGenerationFailed");
  }

  const total = ((performance.now() - start) / 1000).toFixed(2);
  logCallback(`Video #${idx + 1} generated successfully in ${total}s`);

  const videoUrl = await page.evaluate(() => {
    const vids = Array.from(document.querySelectorAll("video"));
    return vids.pop()?.src;
  });
  logCallback(`URL: ${videoUrl}`);

  let buffer: Buffer;
  if (videoUrl.startsWith("blob:")) {
    const dataUrl = await page.evaluate(async (url: string) => {
      const r = await fetch(url);
      const b = await r.blob();
      return new Promise((res) => {
        const fr = new FileReader();
        fr.onloadend = () => res(fr.result);
        fr.readAsDataURL(b);
      });
    }, videoUrl);
    buffer = Buffer.from(dataUrl.split(",")[1], "base64");
  } else {
    buffer = await new Promise((res, rej) => {
      https
        .get(videoUrl, (r) => {
          if (r.statusCode !== 200)
            return rej(new Error(`Download failed: ${r.statusCode}`));
          const chunks: Buffer[] = [];
          r.on("data", (c) => chunks.push(c));
          r.on("end", () => res(Buffer.concat(chunks)));
        })
        .on("error", rej);
    });
  }

  const dlDir =
    savePath || path.join(app.getPath("downloads"), "GridAutomationStudio");
  await ensureDir(dlDir);
  const safeName = promptText.slice(0, 50).replace(/[^a-z0-9]/gi, "_");
  const outPath = path.join(dlDir, `${safeName}_${idx + 1}.mp4`);
  try {
    await fs.access(outPath);
    await fs.unlink(outPath);
  } catch {}
  await fs.writeFile(outPath, buffer);
  logCallback(`Video #${idx + 1} saved to ${outPath}`);
}

// Video generation handler
ipcMain.handle(
  "start-video-generation",
  async (
    event,
    options: {
      prompts: string[];
      savePath: string;
      aspectRatio: string;
      duration: string;
      accountIds: string[];
    }
  ) => {
    try {
      stopSignal.stop = false;

      await ensureDir(PROFILES_DIR);
      const savePath =
        options.savePath ||
        path.join(app.getPath("downloads"), "GridAutomationStudio");
      await ensureDir(savePath);

      // Get accounts from profile manager
      const allAccounts = profileManager.getAccounts();
      const selectedAccounts =
        options.accountIds.length > 0
          ? allAccounts.filter((acc) => options.accountIds.includes(acc.id))
          : allAccounts;

      if (selectedAccounts.length === 0) {
        throw new Error("No accounts available for video generation");
      }

      let promptIndex = 0;
      let currentAccountIndex = 0;
      const exhaustedAccounts = new Set();

      // For single account mode, only use the first account
      if (selectedAccounts.length === 1) {
        currentAccountIndex = 0;
      }

      while (
        promptIndex < options.prompts.length &&
        exhaustedAccounts.size < selectedAccounts.length &&
        !stopSignal.stop
      ) {
        const acc = selectedAccounts[currentAccountIndex];

        // For single account mode, don't rotate accounts
        if (selectedAccounts.length > 1) {
          currentAccountIndex =
            (currentAccountIndex + 1) % selectedAccounts.length;
        }

        if (exhaustedAccounts.has(currentAccountIndex)) continue;

        sendLogToRenderer(
          `Using account ${acc.email} for prompt ${promptIndex + 1}`
        );

        const profileDir = path.join(PROFILES_DIR, sanitize(acc.email));

        try {
          const browser = await puppeteer.launch({
            headless: false,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            userDataDir: profileDir,
            args: [
              "--no-sandbox",
              // Remove restrictive flags that prevent normal browsing
              // "--disable-notifications",
              // "--disable-blink-features=AutomationControlled",
              "--lang=en-US",
              // Keep minimal stealth flags for anti-detection
              // "--disable-extensions-except=/dev/null",
              // "--disable-extensions",
              // "--disable-plugins",
              // "--disable-default-apps",
              // "--disable-sync",
              // "--disable-translate",
              // "--hide-scrollbars",
              // "--metrics-recording-only",
              // "--mute-audio",
              // "--no-crash-upload",
              // "--disable-logging",
              // "--disable-login-animations",
              // "--disable-permissions-api",
              // "--disable-session-crashed-bubble",
              // "--disable-infobars",
              // "--disable-component-extensions-with-background-pages",
              // "--disable-background-networking",
              // "--disable-component-update",
              // "--disable-domain-reliability",
              // "--disable-client-side-phishing-detection",
              // "--disable-field-trial-config",
              // "--disable-back-forward-cache",
              // "--disable-hang-monitor",
              // "--disable-prompt-on-repost",
              // "--force-color-profile=srgb",
              // "--disable-features=UserMediaScreenCapturing",
              // "--disable-popup-blocking",
              // "--disable-print-preview",
              // "--disable-background-timer-throttling",
              // "--disable-backgrounding-occluded-windows",
              // "--disable-renderer-backgrounding",
              // "--disable-ipc-flooding-protection",
            ],
            defaultViewport: null,
            ignoreDefaultArgs: ["--enable-automation"], // Remove automation indicators
          });
          currentBrowser = browser;

          const page = await browser.newPage();
          page.setDefaultNavigationTimeout(60000);

          // Set realistic viewport and user agent
          await page.setViewport({
            width: 1366 + Math.floor(Math.random() * 200),
            height: 768 + Math.floor(Math.random() * 200),
            deviceScaleFactor: 1,
            hasTouch: false,
            isLandscape: true,
            isMobile: false,
          });

          // Override navigator properties to avoid detection
          await page.evaluateOnNewDocument(() => {
            // Override webdriver property
            Object.defineProperty(navigator, "webdriver", {
              get: () => undefined,
            });

            // Override plugins to look more like a real browser
            Object.defineProperty(navigator, "plugins", {
              get: () => [
                {
                  0: {
                    type: "application/x-google-chrome-pdf",
                    suffixes: "pdf",
                    description: "Portable Document Format",
                    __pluginName: "Chrome PDF Plugin",
                  },
                  description: "Portable Document Format",
                  filename: "internal-pdf-viewer",
                  length: 1,
                  name: "Chrome PDF Plugin",
                },
                {
                  0: {
                    type: "application/pdf",
                    suffixes: "pdf",
                    description: "",
                    __pluginName: "Chrome PDF Viewer",
                  },
                  description: "",
                  filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
                  length: 1,
                  name: "Chrome PDF Viewer",
                },
                {
                  0: {
                    type: "application/x-nacl",
                    suffixes: "",
                    description: "Native Client Executable",
                    __pluginName: "Native Client",
                  },
                  description: "Native Client Executable",
                  filename: "internal-nacl-plugin",
                  length: 1,
                  name: "Native Client",
                },
                {
                  0: {
                    type: "application/x-pnacl",
                    suffixes: "",
                    description: "Portable Native Client Executable",
                    __pluginName: "Portable Native Client",
                  },
                  description: "Portable Native Client Executable",
                  filename: "internal-pnacl-plugin",
                  length: 1,
                  name: "Portable Native Client",
                },
              ],
            });

            // Override permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) =>
              parameters.name === "notifications"
                ? Promise.resolve({
                    state: Notification.permission,
                  } as PermissionStatus)
                : originalQuery(parameters);

            // Override languages
            Object.defineProperty(navigator, "languages", {
              get: () => ["en-US", "en"],
            });

            // Override platform
            Object.defineProperty(navigator, "platform", {
              get: () => "MacIntel",
            });
          });

          // Add random delays to simulate human behavior
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 1000 + 500)
          );

          // Navigate directly to AI Studio - assuming profile is already logged in
          await page.goto(AI_STUDIO_URL, { waitUntil: "networkidle0" });

          // Check if we're logged in by looking for authentication indicators
          const isLoggedIn = await page.evaluate(() => {
            // Check for common logged-in indicators
            const hasUserMenu =
              document.querySelector('[aria-label*="Account"]') ||
              document.querySelector(".user-menu") ||
              document.querySelector('[data-testid*="account"]');
            const hasProfilePic =
              document.querySelector('img[alt*="profile"]') ||
              document.querySelector('img[alt*="avatar"]');
            const noLoginButton =
              !document.querySelector('a[href*="signin"]') &&
              !document.querySelector('button:contains("Sign in")');

            return !!(hasUserMenu || hasProfilePic || noLoginButton);
          });

          if (!isLoggedIn) {
            sendLogToRenderer(
              `Account ${acc.email} not logged in, attempting login...`
            );

            // Navigate to Google sign-in page
            const signInUrl =
              "https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Faistudio.google.com%2F&dsh=S-1709684080%3A1761108691277369&flowEntry=ServiceLogin&flowName=GlifWebSignIn&ifkv=AfYwgwXX7JIEPrWn9WRo4MRS8bjkgUXmrcXBDaVU1fOAyDQIeA0I3tGCtHBotZG-cqU67l8phAGF4Q";
            await page.goto(signInUrl, { waitUntil: "domcontentloaded" });

            // Get password for the account
            const password = await profileManager.getAccountPassword(acc.id);
            if (!password) {
              throw new Error(`Password not found for account ${acc.email}`);
            }

            // Fill email
            await page.waitForSelector('input[type="email"]', {
              visible: true,
              timeout: 10000,
            });
            await page.type('input[type="email"]', acc.email);
            await page.click("#identifierNext");

            // Wait for password field
            await page.waitForSelector('input[type="password"]', {
              visible: true,
              timeout: 10000,
            });
            await page.type('input[type="password"]', password);
            await page.click("#passwordNext");

            // Wait for successful login or redirect
            await page.waitForNavigation({
              waitUntil: "networkidle0",
              timeout: 30000,
            });

            // Navigate to AI Studio if not already there
            if (!page.url().includes("aistudio.google.com")) {
              await page.goto(AI_STUDIO_URL, { waitUntil: "networkidle0" });
            }
          } else {
            sendLogToRenderer(
              `Account ${acc.email} already logged in, proceeding with generation...`
            );
          }

          await handleSplash(page);
          await handleTOS(page);

          // Generate video
          const text = options.prompts[promptIndex];
          await generateAndDownload(
            page,
            text,
            promptIndex,
            sendLogToRenderer,
            savePath,
            options.duration,
            options.aspectRatio
          );
          promptIndex++;

          await browser.close();
          currentBrowser = null;
        } catch (err: any) {
          if (err.message === "QuotaExceeded") {
            sendLogToRenderer(
              `Account ${acc.email} exhausted - adding to skip list`
            );
            exhaustedAccounts.add(currentAccountIndex - 1);
          } else if (
            err.message === "VideoGenerationFailed" ||
            err.message === "PermissionDenied" ||
            err.message === "GenerationTimeout"
          ) {
            sendLogToRenderer(
              `Account ${acc.email} ${
                err.message === "PermissionDenied"
                  ? "has permission issues"
                  : err.message === "GenerationTimeout"
                  ? "took too long to generate"
                  : "failed to generate video"
              } - trying next account`
            );
          } else if (err.message === "PromptBlocked") {
            sendLogToRenderer(
              `Prompt blocked due to safety reasons - skipping prompt #${
                promptIndex + 1
              }`
            );
            promptIndex++;
          }
        }
      }

      if (promptIndex < options.prompts.length) {
        sendLogToRenderer(
          `Stopped at prompt #${promptIndex + 1} - ${
            exhaustedAccounts.size === selectedAccounts.length
              ? "All accounts exhausted"
              : "Processing interrupted"
          }`
        );
      } else {
        sendLogToRenderer(
          `All ${options.prompts.length} prompts generated successfully`
        );
      }
    } catch (error: any) {
      console.error("Failed to start video generation:", error);
      sendLogToRenderer(
        `ERROR: Failed to start video generation: ${error.message}`
      );
      throw error;
    }
  }
);

ipcMain.handle("stop-video-generation", async () => {
  stopSignal.stop = true;
  sendLogToRenderer("Video generation stopped.");

  if (currentBrowser) {
    try {
      await currentBrowser.close();
      currentBrowser = null;
    } catch (err) {
      console.error("Error closing browser:", err);
    }
  }
});

// Test browser control handler - test controlling the webview in the renderer
ipcMain.handle("test-browser-control", async () => {
  try {
    sendLogToRenderer("Testing webview control...");

    // Send command to the renderer to navigate to Google and search for "video funny"
    win?.webContents.send("test-webview-navigation", {
      url: "https://www.google.com",
      searchTerm: "video funny",
    });

    // Also dispatch a custom event to the renderer
    win?.webContents.executeJavaScript(`
      window.dispatchEvent(new CustomEvent('test-webview-navigation', {
        detail: { url: 'https://www.google.com', searchTerm: 'video funny' }
      }));
    `);

    sendLogToRenderer(
      "Webview control test initiated - navigating to Google and searching"
    );
    return { success: true, message: "Webview control test initiated" };
  } catch (error: any) {
    console.error("Webview control test failed:", error);
    sendLogToRenderer(`Webview control test failed: ${error.message}`);
    return { success: false, message: error.message };
  }
});

// IPC handler to provide the preload script path for webviews
ipcMain.handle("get-webview-preload-path", () => {
  return pathToFileURL(
    join(__dirname, "../preload/preload-webview.js")
  ).toString();
});

// Popup window creation handler
ipcMain.handle(
  "create-popup-window",
  async (event, { url, width, height, title }) => {
    try {
      const popupWindow = new BrowserWindow({
        width: width || 800,
        height: height || 600,
        title: title || "Popup",
        parent: win!,
        modal: false,
        webPreferences: {
          preload: join(__dirname, "../preload/preload.js"),
          sandbox: false,
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
          webgl: true,
          enableWebSQL: true,
          partition: "persist:main", // Use same partition for session persistence
          additionalArguments: [
            `--webview-token=${Math.random().toString(36)}`,
          ],
        },
      });

      // Remove menu bar in popup
      popupWindow.setMenuBarVisibility(false);

      await popupWindow.loadURL(url);

      // Handle window closed
      popupWindow.on("closed", () => {
        // Cleanup if needed
      });

      return { success: true, windowId: popupWindow.id };
    } catch (error: any) {
      console.error("Failed to create popup window:", error);
      return { success: false, error: error.message };
    }
  }
);

// IPC handlers for webview messages
ipcMain.on("allow-button-clicked", (event) => {
  win?.webContents.send("allow-button-clicked");
});

ipcMain.on("auto-allow-clicked", (event) => {
  win?.webContents.send("auto-allow-clicked");
});

ipcMain.on("allow-button-not-found", (event) => {
  win?.webContents.send("allow-button-not-found");
});

ipcMain.on("click-allow-button", async () => {
  if (popupWindow) {
    try {
      // Execute JavaScript in the popup window to click the button
      const clickResult = await popupWindow.webContents.executeJavaScript(`
        new Promise((resolve) => {
          const interval = setInterval(() => {
            const accountList = document.querySelector('ul.Dl08I');
            if (accountList) {
              const firstAccount = accountList.querySelector('li');
              if (firstAccount) {
                const clickableElement = firstAccount.querySelector('div[role="link"]');
                if (clickableElement && clickableElement.offsetParent !== null) {
                  clearInterval(interval);
                  clickableElement.dispatchEvent(new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                  }));
                  resolve(true);
                }
              }
            }
          }, 200);
          setTimeout(() => {
            clearInterval(interval);
            resolve(false);
          }, 10000);
        });
      `);

      if (clickResult) {
        win?.webContents.send("allow-button-clicked");
        sendLogToRenderer("Allow button clicked in popup.");
      } else {
        win?.webContents.send("allow-button-not-found");
        sendLogToRenderer(
          "ERROR: Allow button not found or not visible in popup after waiting."
        );
      }
    } catch (error: any) {
      console.error("Error during popup button click execution:", error);
      win?.webContents.send("allow-button-not-found");
      sendLogToRenderer(
        `ERROR: Failed to execute click script in popup: ${error.message}`
      );
    }
  } else {
    win?.webContents.send("allow-button-not-found");
    sendLogToRenderer("ERROR: Popup window not found to click allow button.");
  }
});

// Initialize settings when the app is ready
app.whenReady().then(async () => {
  // Anda juga bisa mengaturnya per sesi untuk kontrol lebih
  session.defaultSession.setUserAgent(genuineChromeUserAgent);

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    // Pastikan User-Agent selalu konsisten
    details.requestHeaders["User-Agent"] = genuineChromeUserAgent;

    // Menambahkan header Client Hints yang cocok dengan User-Agent
    details.requestHeaders["sec-ch-ua"] =
      '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"';
    details.requestHeaders["sec-ch-ua-mobile"] = "?0"; // '?0' untuk desktop
    details.requestHeaders["sec-ch-ua-platform"] = '"macOS"'; // Sesuaikan dengan OS Anda ("Windows", "Linux", dll.)

    // Hapus header yang bisa mengidentifikasi Electron
    delete details.requestHeaders["X-Electron-Version"];

    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  await loadSettings();
  createWindow();
});
