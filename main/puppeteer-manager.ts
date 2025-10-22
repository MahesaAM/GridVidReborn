import puppeteer, { Browser } from "puppeteer-core";
import getPort from "get-port";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import { app } from "electron";

// Profile root configuration
const CUSTOM_ROOT =
  process.platform === "win32"
    ? "C:/profiles"
    : `/Users/${process.env.USER || "pttas"}`;
const ROOT = CUSTOM_ROOT;
const PROFILES_ROOT = path.resolve(ROOT, "profiles");

// Sanitize email to use as folder name
function sanitize(email: string): string {
  return email.replace(/[@.]/g, "_");
}

// This utility attempts to find the Chrome/Chromium executable path
// on various operating systems.
// For a real application, you might want to use a more robust solution
// or allow the user to configure the path.
function findChromePath(): string | undefined {
  const platform = process.platform;
  const fs = require("node:fs");
  const path = require("node:path");

  // Check for puppeteer-chromium in project directory first
  const projectRoot = path.resolve(__dirname, "..", "..");
  if (platform === "darwin") {
    const macPath = path.join(
      projectRoot,
      "puppeteer-chromium",
      "chrome.app",
      "Contents",
      "MacOS",
      "Google Chrome for Testing"
    );
    if (fs.existsSync(macPath)) {
      return macPath;
    }
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  } else if (platform === "win32") {
    const winPath = path.join(projectRoot, "puppeteer-chromium", "chrome.exe");
    if (fs.existsSync(winPath)) {
      return winPath;
    }
    const paths = [
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  } else if (platform === "linux") {
    const linuxPath = path.join(projectRoot, "puppeteer-chromium", "chrome");
    if (fs.existsSync(linuxPath)) {
      return linuxPath;
    }
    return "/usr/bin/google-chrome";
  }
  return undefined;
}

export async function launchProfile(email: string): Promise<{
  browser: Browser;
  port: number;
  chromeProcess: ChildProcess;
}> {
  const userDataDir = path.join(PROFILES_ROOT, sanitize(email));
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
    // Remove restrictive flags that prevent normal browsing
    // "--disable-gpu", // Recommended for Electron/Puppeteer
    "--no-sandbox", // Required for Linux environments
    // "--disable-web-security",
    // "--disable-features=VizDisplayCompositor",
    "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    // "--disable-blink-features=AutomationControlled",
    // "--disable-dev-shm-usage",
    // "--disable-accelerated-2d-canvas",
    // "--no-zygote",
    // "--disable-gpu-sandbox",
    // "--disable-software-rasterizer",
    // "--disable-background-timer-throttling",
    // "--disable-backgrounding-occluded-windows",
    // "--disable-renderer-backgrounding",
    // "--disable-features=TranslateUI",
    // "--disable-ipc-flooding-protection",
    // Enhanced stealth flags - keep minimal ones for stealth
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
  ];

  const chromeProcess = spawn(chromePath, args, {
    detached: true,
    stdio: "ignore",
  });

  // Wait for the browser to start and the remote debugging port to be available
  let browser: Browser | undefined;
  for (let i = 0; i < 10; i++) {
    try {
      browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${port}`,
      });
      break;
    } catch (e) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  if (!browser) {
    throw new Error(`Could not connect to Puppeteer for profile ${email}`);
  }

  return { browser, port, chromeProcess };
}

export async function closeProfile(
  browser: Browser,
  chromeProcess: ChildProcess
): Promise<void> {
  await browser.close();
  if (chromeProcess && !chromeProcess.killed) {
    chromeProcess.kill("SIGKILL"); // Ensure the spawned Chrome process is terminated
  }
}
