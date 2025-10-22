import puppeteer from "puppeteer-extra";
import { Browser, Page, ElementHandle } from "puppeteer";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AnonymizeUA from "puppeteer-extra-plugin-anonymize-ua";
import { app } from "electron";
import path from "path";
import fs from "fs";
import { getChromiumPath } from "./chromium-utils";

// Use plugins
puppeteer.use(StealthPlugin());
puppeteer.use(AnonymizeUA());

// Additional stealth configurations
puppeteer.use(require("puppeteer-extra-plugin-stealth/evasions/chrome.app")());
puppeteer.use(require("puppeteer-extra-plugin-stealth/evasions/chrome.csi")());
puppeteer.use(
  require("puppeteer-extra-plugin-stealth/evasions/chrome.loadTimes")()
);
puppeteer.use(
  require("puppeteer-extra-plugin-stealth/evasions/chrome.runtime")()
);
puppeteer.use(require("puppeteer-extra-plugin-stealth/evasions/defaultArgs")());
puppeteer.use(
  require("puppeteer-extra-plugin-stealth/evasions/iframe.contentWindow")()
);
puppeteer.use(
  require("puppeteer-extra-plugin-stealth/evasions/media.codecs")()
);
puppeteer.use(
  require("puppeteer-extra-plugin-stealth/evasions/navigator.hardwareConcurrency")()
);
puppeteer.use(
  require("puppeteer-extra-plugin-stealth/evasions/navigator.languages")()
);
puppeteer.use(
  require("puppeteer-extra-plugin-stealth/evasions/navigator.permissions")()
);
puppeteer.use(
  require("puppeteer-extra-plugin-stealth/evasions/navigator.plugins")()
);
puppeteer.use(
  require("puppeteer-extra-plugin-stealth/evasions/navigator.vendor")()
);
puppeteer.use(
  require("puppeteer-extra-plugin-stealth/evasions/navigator.webdriver")()
);
puppeteer.use(require("puppeteer-extra-plugin-stealth/evasions/sourceurl")());
puppeteer.use(
  require("puppeteer-extra-plugin-stealth/evasions/user-agent-override")()
);
puppeteer.use(
  require("puppeteer-extra-plugin-stealth/evasions/webgl.vendor")()
);
puppeteer.use(
  require("puppeteer-extra-plugin-stealth/evasions/window.outerdimensions")()
);

// Configuration
const BASE_SIGNIN_URL =
  "https://accounts.google.com/v3/signin/identifier?authuser=0" +
  "&continue=https%3A%2F%2Fmyaccount.google.com%2Fgeneral-light" +
  "&ec=GAlAwAE&hl=in&service=accountsettings" +
  "&flowName=GlifWebSignIn&flowEntry=AddSession";

// Customize this path to point to your desired location on disk C
const CUSTOM_ROOT = "C:/profiles"; // Shared profile directory for all features
const ROOT = CUSTOM_ROOT || app.getPath("userData");
const PROFILES_ROOT = path.resolve(ROOT, "profiles");
const ERRORS_ROOT = path.resolve(ROOT, "errors");

// Create root folders if they don't exist
for (const dir of [PROFILES_ROOT, ERRORS_ROOT]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Sanitize email to use as folder name
function sanitize(email: string): string {
  return email.replace(/[@.]/g, "_");
}

// Clear existing value and type text quickly
async function clearAndType(
  page: Page,
  selector: string,
  text: string
): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 10000 });
  const el = await page.$(selector);
  await el!.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  // Add human-like typing with random delays
  for (const char of text) {
    await el!.type(char, { delay: Math.random() * 100 + 50 });
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));
  }
}

async function waitAndClick(page: Page, selector: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 10000 });
  await page.click(selector);
}

// Click element as fast as possible
async function clickFast(page: Page, selector: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 10000 });
  await page.$eval(selector, (el: any) => el.click());
}

// Wait for device verification with timeout
async function waitForVerification(page: Page, timeout = 60000): Promise<void> {
  try {
    console.log("⏳ Waiting for manual verification...");
    await Promise.race([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout }),
      page.waitForFunction(
        () => {
          return (
            !document.location.href.includes("/signin/challenge") &&
            !document.querySelector("div[data-challenge]")
          );
        },
        { timeout }
      ),
      new Promise((resolve) => setTimeout(resolve, timeout)).then(() => {
        throw new Error("Verification timeout");
      }),
    ]);
    console.log("✅ Verification completed");
  } catch (err: any) {
    if (err.message === "Verification timeout") {
      console.log("⚠️ Verification timeout - skipping to next account");
      throw err;
    }
    throw err;
  }
}

// Handle one account's login flow
async function handleSplash(page: Page): Promise<void> {
  try {
    await page.waitForSelector("mat-dialog-container", { timeout: 7000 });
    const btn = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find(
        (btn) =>
          btn.textContent?.includes("Try Gemini") ||
          btn.textContent?.includes("Use Google AI Studio")
      );
    });
    if (btn) {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const targetBtn = buttons.find(
          (btn) =>
            btn.textContent?.includes("Try Gemini") ||
            btn.textContent?.includes("Use Google AI Studio")
        );
        if (targetBtn) (targetBtn as HTMLElement).click();
      });
      await page.waitForSelector("mat-dialog-container", {
        hidden: true,
        timeout: 10000,
      });
      console.log("✔️ Splash dialog closed");
    }
  } catch {}
}

async function handleTOS(page: Page): Promise<void> {
  try {
    await page.waitForSelector("#mat-mdc-checkbox-0-input", { timeout: 7000 });
    await page.click("#mat-mdc-checkbox-0-input");
    if (await page.$("#mat-mdc-checkbox-1-input")) {
      await page.click("#mat-mdc-checkbox-1-input");
    }
    await waitAndClick(page, 'button[aria-label="Accept terms of service"]');
    await page.waitForSelector("#mat-mdc-checkbox-0-input", {
      hidden: true,
      timeout: 30000,
    });
    console.log("✔️ Terms of Service accepted");
  } catch {}
}

async function handleDriveAccess(page: Page, email: string): Promise<void> {
  // 1. Add retry mechanism for initial button
  let btn;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      btn = await page.waitForSelector(
        'button.add-to-drive, .nav-item.add-to-drive, [aria-label*="drive"]',
        {
          visible: true,
          timeout: 15000,
        }
      );
      break;
    } catch (err) {
      if (attempt === 3) {
        console.warn(`⚠️ Drive button not found after ${attempt} attempts`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // 2. Enhanced popup handling
  const popupPromise = new Promise<Page>((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new Error("Popup timeout")),
      30000
    );
    page.browser().on("targetcreated", async (target) => {
      if (
        target.type() === "page" &&
        target.url().includes("accounts.google.com")
      ) {
        clearTimeout(timeoutId);
        const popupPage = await target.page();
        if (popupPage) {
          resolve(popupPage);
        }
      }
    });
  });

  // 3. Improved click handling
  try {
    await Promise.all([(btn as any).click(), page.waitForTimeout(1000)]);
  } catch (err) {
    // Fallback click methods
    try {
      await page.evaluate((el) => (el as HTMLElement).click(), btn);
    } catch {
      const box = await (btn as any).boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
  }

  // 4. Handle confirmation dialog with retry
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const confirmBtn = await page.waitForSelector(
        "button[matdialogclose], button.confirm-button",
        {
          visible: true,
          timeout: 5000,
        }
      );
      await (confirmBtn as any).click();
      await page.waitForSelector("button[matdialogclose]", {
        hidden: true,
        timeout: 10000,
      });
      break;
    } catch (err) {
      if (attempt === 3) console.warn("⚠️ No confirmation dialog found");
    }
  }

  // 5. Enhanced popup handling with timeout
  let popup: Page;
  try {
    popup = await popupPromise;
    await popup.setDefaultTimeout(60000);
  } catch (err) {
    console.error("⚠️ Failed to handle popup:", (err as Error).message);
    return;
  }

  // 6. Improved account selection
  try {
    await popup.waitForSelector('div[jsname="MBVUVe"]', {
      visible: true,
      timeout: 60000,
    });

    // Multiple selector strategies
    const selectors = [
      `div[jsname="MBVUVe"][data-identifier="${email}"]`,
      `div[data-identifier="${email}"]`,
      `div[jsname="MBVUVe"]:has(text("${email}"))`,
    ];

    let handle = null;
    for (const selector of selectors) {
      // Check in frames
      for (const frame of popup.frames()) {
        handle = await frame.$(selector);
        if (handle) break;
      }
      // Check in main page
      if (!handle) {
        handle = await popup.$(selector);
      }
      if (handle) break;
    }

    if (!handle) {
      console.warn(`⚠️ Account ${email} not found in popup`);
      return;
    }

    // 7. Improved click handling
    await handle.evaluate((el) =>
      (el as HTMLElement).scrollIntoView({
        block: "center",
        behavior: "smooth",
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
      await handle.click();
    } catch {
      try {
        await popup.evaluate((el) => (el as HTMLElement).click(), handle);
      } catch {
        const box = await handle.boundingBox();
        await popup.mouse.click(
          box!.x + box!.width / 2,
          box!.y + box!.height / 2
        );
      }
    }

    console.log(`✔️ Account ${email} selected successfully`);

    // 8. Enhanced navigation waiting
    await Promise.race([
      popup.waitForNavigation({ waitUntil: "networkidle0", timeout: 120000 }),
      popup.waitForNavigation({ waitUntil: "load", timeout: 120000 }),
    ]);
  } catch (err) {
    console.error("⚠️ Error during account selection:", (err as Error).message);
  } finally {
    if (popup && !popup.isClosed()) {
      await popup.close();
    }
  }

  // 9. Final verification
  try {
    await page.waitForSelector("button.add-to-drive, .nav-item.add-to-drive", {
      hidden: true,
      timeout: 30000,
    });
    console.log("✔️ Drive access completed successfully");
  } catch (err) {
    console.warn("⚠️ Drive button still visible after process");
  }
}

async function handleOne(
  page: Page,
  { email, password }: { email: string; password: string }
): Promise<void> {
  const domain = email.split("@")[1];
  const signinUrl = domain.toLowerCase().endsWith("gmail.com")
    ? BASE_SIGNIN_URL
    : BASE_SIGNIN_URL + `&hd=${encodeURIComponent(domain)}`;

  // 1) Go to sign-in page
  await page.goto(signinUrl, { waitUntil: "domcontentloaded" });

  // 2) Enter email and proceed
  await clearAndType(page, "input[type=email], #identifierId", email);
  await Promise.all([
    clickFast(page, "#identifierNext"),
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
  ]);

  // 3) Enter password and proceed
  await clearAndType(
    page,
    "input[type=password], input[name=Passwd]",
    password
  );
  await Promise.all([
    clickFast(page, "#passwordNext"),
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
  ]);

  // Check for device verification page
  const isVerificationPage =
    (await page.$('div[data-challenge="phone"]')) ||
    (await page.$("div#phoneNumberChallenged")) ||
    page.url().includes("/signin/challenge/dp");

  if (isVerificationPage) {
    console.log(`ℹ️ Device verification required for ${email}`);
    try {
      await waitForVerification(page);
      // After verification, check if we're at the expected destination
      if (
        !page.url().startsWith("https://myaccount.google.com/general-light")
      ) {
        await page.goto("https://myaccount.google.com/general-light", {
          waitUntil: "domcontentloaded",
        });
      }
    } catch {
      // Timeout occurred - skip this account
      await page.close();
      return;
    }
  }

  // 4) Handle speedbump if present
  if (page.url().includes("/speedbump/")) {
    await clickFast(page, 'input#confirm, input[jsname="M2UYVd"]');
    await page.waitForNavigation({ waitUntil: "domcontentloaded" });
  }

  // 5) Handle redirection to gds.google.com
  if (page.url().startsWith("https://gds.google.com/web/landing")) {
    await waitAndClick(page, 'button[jsname="ZUkOIc"]'); // Click "Lewati"
    await waitAndClick(page, 'button[jsname="bySMBb"]'); // Click "Lain kali"
    await page.waitForNavigation({ waitUntil: "domcontentloaded" });
  }

  // 6) Once at general-light, redirect to aistudio page and handle splash, tos, drive access
  if (page.url().startsWith("https://myaccount.google.com/general-light")) {
    await page.goto("https://aistudio.google.com/u/0/generate-video?pli=1", {
      waitUntil: "domcontentloaded",
    });
    await handleSplash(page);
    await handleTOS(page);

    const enableSavingButton = await page.$("button.nav-item.add-to-drive");
    if (enableSavingButton) {
      await handleDriveAccess(page, email);
    } else {
      console.log(
        `Button "Enable saving" not found for ${email}, closing page and continuing to next account.`
      );
      await page.close();
      return;
    }
    return;
  }

  // 7) Fallback "Saya mengerti"
  if (await page.$("input#confirm")) {
    await clickFast(page, 'input#confirm, input[jsname="M2UYVd"]');
  }
}

export async function runLoginAll(
  accounts: Array<{ email: string; password: string }>,
  logCallback = console.log
): Promise<Array<{ email: string; success: boolean; error?: string }>> {
  const chromiumPath = await getChromiumPath({
    customPaths: [
      // Primary: Chrome for Testing
      "C:\\Program Files\\GridVid\\resources\\chrome-for-testing\\chrome.exe",
      "C:\\Program Files\\GridVid\\resources\\app.asar.unpacked\\chrome-for-testing\\chrome.exe",
      path.join(__dirname, "..", "chrome-for-testing", "chrome.exe"), // Windows
      path.join(__dirname, "..", "chrome-for-testing", "chrome"), // Linux/Mac
      path.join(
        __dirname,
        "..",
        "chrome-for-testing",
        "Chromium.app",
        "Contents",
        "MacOS",
        "Chromium"
      ), // Mac App
      // Fallback: puppeteer-chromium
      "C:\\Program Files\\GridVid\\resources\\puppeteer-chromium\\chrome.exe",
      "C:\\Program Files\\GridVid\\resources\\app.asar.unpacked\\puppeteer-chromium\\chrome.exe",
      path.join(__dirname, "..", "puppeteer-chromium", "chrome.exe"), // Windows
      path.join(__dirname, "..", "puppeteer-chromium", "chrome"), // Linux/Mac
      path.join(
        __dirname,
        "..",
        "puppeteer-chromium",
        "Chromium.app",
        "Contents",
        "MacOS",
        "Chromium"
      ), // Mac App
    ],
  });

  logCallback(
    `Using Chromium: ${chromiumPath.path} (v${chromiumPath.version})`
  );

  const results: Array<{ email: string; success: boolean; error?: string }> =
    [];

  for (const acc of accounts) {
    const profDir = path.resolve(PROFILES_ROOT, sanitize(acc.email));

    if (!fs.existsSync(profDir)) {
      fs.mkdirSync(profDir, { recursive: true });
    }

    fs.writeFileSync(path.join(profDir, "email.txt"), acc.email, "utf8");

    logCallback(`→ [${acc.email}] profile dir: ${profDir}`);

    try {
      const browser: Browser = await puppeteer.launch({
        headless: false,
        executablePath: chromiumPath.path,
        userDataDir: profDir,
        args: [
          `--user-data-dir=${profDir}`,
          "--no-sandbox",
          "--disable-blink-features=AutomationControlled",
          "--disable-web-security",
          "--disable-features=VizDisplayCompositor",
          "--disable-ipc-flooding-protection",
          "--disable-dev-shm-usage",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-field-trial-config",
          "--disable-back-forward-cache",
          "--disable-hang-monitor",
          "--disable-ipc-flooding-protection",
          "--disable-popup-blocking",
          "--disable-prompt-on-repost",
          "--force-color-profile=srgb",
          "--metrics-recording-only",
          "--no-first-run",
          "--enable-automation",
          "--password-store=basic",
          "--use-mock-keychain",
          "--no-default-browser-check",
          "--no-pings",
          "--no-zygote",
          "--disable-gpu-sandbox",
          "--disable-software-rasterizer",
          "--disable-background-media-download",
          "--disable-features=TranslateUI",
          "--disable-features=BlinkGenPropertyTrees",
          "--no-crash-upload",
          "--disable-logging",
          "--disable-login-animations",
          "--disable-notifications",
          "--disable-permissions-api",
          "--disable-session-crashed-bubble",
          "--disable-infobars",
          "--lang=en-US",
          "--start-maximized",
        ],
        defaultViewport: null,
      });

      const page: Page = await browser.newPage();

      // Set realistic viewport
      await page.setViewport({ width: 1366, height: 768 });

      // Set realistic user agent
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // Add human-like behavior
      await page.evaluateOnNewDocument(() => {
        // Override webdriver property
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined,
        });

        // Mock languages and plugins
        Object.defineProperty(navigator, "languages", {
          get: () => ["en-US", "en"],
        });

        Object.defineProperty(navigator, "plugins", {
          get: () => [1, 2, 3, 4, 5],
        });

        // Mock permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) =>
          parameters.name === "notifications"
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters);
      });

      // Add random delays to simulate human behavior
      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * 2000 + 1000)
      );

      await handleOne(page, acc);

      results.push({ email: acc.email, success: true });
      await browser.close();
    } catch (err: any) {
      results.push({ email: acc.email, success: false, error: err.message });
    }
  }

  logCallback("✅ All done.");
  return results;
}

let stopRequested = false;

export function stopLogin(): void {
  stopRequested = true;
}
