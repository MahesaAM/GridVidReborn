import puppeteer, { Browser } from "puppeteer-core";
import getPort from "get-port";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import { app } from "electron";

// This utility attempts to find the Chrome/Chromium executable path
// on various operating systems.
// For a real application, you might want to use a more robust solution
// or allow the user to configure the path.
function findChromePath(): string | undefined {
  const platform = process.platform;
  if (platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  } else if (platform === "win32") {
    const paths = [
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    ];
    for (const p of paths) {
      if (require("node:fs").existsSync(p)) {
        return p;
      }
    }
  } else if (platform === "linux") {
    return "/usr/bin/google-chrome";
  }
  return undefined;
}

export async function launchProfile(email: string): Promise<{
  browser: Browser;
  port: number;
  chromeProcess: ChildProcess;
}> {
  const userDataDir = path.join(app.getPath("userData"), "profiles", email);
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
    "--disable-gpu", // Recommended for Electron/Puppeteer
    "--no-sandbox", // Required for Linux environments
    "--disable-web-security",
    "--disable-features=VizDisplayCompositor",
    "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "--disable-blink-features=AutomationControlled",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--no-zygote",
    "--disable-gpu-sandbox",
    "--disable-software-rasterizer",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=TranslateUI",
    "--disable-ipc-flooding-protection",
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
