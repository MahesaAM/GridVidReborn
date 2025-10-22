import { app } from "electron";
import puppeteer from "puppeteer-extra";
import { getChromiumPath } from "./chromium-utils";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AnonymizeUA from "puppeteer-extra-plugin-anonymize-ua";
import path from "path";
import fs from "fs";

puppeteer.use(StealthPlugin());
puppeteer.use(AnonymizeUA());

// ——— Configuration ———
const BASE_SIGNIN_URL =
  "https://accounts.google.com/v3/signin/identifier?authuser=0" +
  "&continue=https%3A%2F%2Fmyaccount.google.com%2Fgeneral-light" +
  "&ec=GAlAwAE&hl=in&service=accountsettings" +
  "&flowName=GlifWebSignIn&flowEntry=AddSession";

// Profile root configuration - consistent with other modules
const CUSTOM_ROOT =
  process.platform === "win32"
    ? "C:/profiles"
    : `/Users/${process.env.USER || "pttas"}`;
const ROOT = CUSTOM_ROOT;
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

// Clear existing value and type text with human-like delays
async function clearAndType(
  page: any,
  selector: string,
  text: string
): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 10000 });
  const el = await page.$(selector);
  await el.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");

  // Type with random human-like delays
  for (const char of text) {
    await el.type(char, { delay: Math.random() * 200 + 50 });
    // Occasionally add longer pauses to simulate thinking
    if (Math.random() < 0.1) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * 500 + 200)
      );
    }
  }
}

async function waitAndClick(page: any, selector: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 10000 });
  // Add random delay before clicking to simulate human behavior
  await new Promise((resolve) =>
    setTimeout(resolve, Math.random() * 500 + 200)
  );
  await page.click(selector);
}

// Click element with human-like timing
async function clickFast(page: any, selector: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 10000 });
  // Add random delay before clicking
  await new Promise((resolve) =>
    setTimeout(resolve, Math.random() * 300 + 100)
  );
  await page.$eval(selector, (el: any) => el.click());
}

// Wait for device verification with timeout
async function waitForVerification(page: any, timeout = 60000): Promise<void> {
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
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Verification timeout")), timeout)
      ),
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
async function handleSplash(page: any): Promise<void> {
  try {
    await page.waitForSelector("mat-dialog-container", { timeout: 7000 });
    const [btn] = await page.$x(
      "//button[contains(., 'Try Gemini') or contains(., 'Use Google AI Studio')]"
    );
    if (btn) {
      await btn.click();
      await page.waitForSelector("mat-dialog-container", {
        hidden: true,
        timeout: 10000,
      });
      console.log("✔️ Splash dialog closed");
    }
  } catch {}
}

async function handleTOS(page: any): Promise<void> {
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

async function handleDriveAccess(page: any, email: string): Promise<void> {
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
      await page.waitForTimeout(2000);
    }
  }

  // 2. Enhanced popup handling
  const popupPromise = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new Error("Popup timeout")),
      30000
    );
    page.browser().on("targetcreated", async (target: any) => {
      if (
        target.type() === "page" &&
        target.url().includes("accounts.google.com")
      ) {
        clearTimeout(timeoutId);
        resolve(await target.page());
      }
    });
  });

  // 3. Improved click handling
  try {
    await Promise.all([btn.click(), page.waitForTimeout(1000)]);
  } catch (err) {
    // Fallback click methods
    try {
      await page.evaluate((el: any) => el.click(), btn);
    } catch {
      const box = await btn.boundingBox();
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
      await confirmBtn.click();
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
  let popup;
  try {
    popup = await popupPromise;
    await (popup as any).setDefaultTimeout(60000);
  } catch (err: any) {
    console.error("⚠️ Failed to handle popup:", err.message);
    return;
  }

  // 6. Improved account selection
  try {
    await (popup as any).waitForSelector('div[jsname="MBVUVe"]', {
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
      for (const frame of (popup as any).frames()) {
        handle = await frame.$(selector);
        if (handle) break;
      }
      // Check in main page
      if (!handle) {
        handle = await (popup as any).$(selector);
      }
      if (handle) break;
    }

    if (!handle) {
      console.warn(`⚠️ Account ${email} not found in popup`);
      return;
    }

    // 7. Improved click handling
    await handle.evaluate((el: any) =>
      el.scrollIntoView({ block: "center", behavior: "smooth" })
    );
    await (popup as any).waitForTimeout(500);

    try {
      await handle.click();
    } catch {
      try {
        await (popup as any).evaluate((el: any) => el.click(), handle);
      } catch {
        const box = await handle.boundingBox();
        await (popup as any).mouse.click(
          box.x + box.width / 2,
          box.y + box.height / 2
        );
      }
    }

    console.log(`✔️ Account ${email} selected successfully`);

    // 8. Enhanced navigation waiting
    await Promise.race([
      (popup as any).waitForNavigation({
        waitUntil: "networkidle0",
        timeout: 120000,
      }),
      (popup as any).waitForNavigation({ waitUntil: "load", timeout: 120000 }),
    ]);
  } catch (err: any) {
    console.error("⚠️ Error during account selection:", err.message);
  } finally {
    if (popup && !(popup as any).isClosed()) {
      await (popup as any).close();
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
  page: any,
  { email, password }: { email: string; password: string }
): Promise<void> {
  const domain = email.split("@")[1];
  const signinUrl = domain.toLowerCase().endsWith("gmail.com")
    ? BASE_SIGNIN_URL
    : BASE_SIGNIN_URL + `&hd=${encodeURIComponent(domain)}`;

  // 1) Go to sign-in page with additional stealth
  await page.goto(signinUrl, { waitUntil: "domcontentloaded" });

  // Add random delay before interacting
  await new Promise((resolve) =>
    setTimeout(resolve, Math.random() * 2000 + 1000)
  );

  // Additional stealth: emulate human-like scrolling
  await page.evaluate(() => {
    window.scrollTo(0, Math.floor(Math.random() * 100));
  });
  await new Promise((resolve) =>
    setTimeout(resolve, Math.random() * 500 + 200)
  );

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
      "C:\\Program Files\\GridVid\\resources\\puppeteer-chromium\\chrome.exe",
      "C:\\Program Files\\GridVid\\resources\\app.asar.unpacked\\puppeteer-chromium\\chrome.exe",
      path.join(__dirname, "puppeteer-chromium", "chrome.exe"),
    ],
  });

  const results: Array<{ email: string; success: boolean; error?: string }> =
    [];

  for (const acc of accounts) {
    const profDir = path.resolve(PROFILES_ROOT, sanitize(acc.email));

    if (!fs.existsSync(profDir)) {
      fs.mkdirSync(profDir, { recursive: true });
      console.log(`Created profile directory: ${profDir}`);
    } else {
      console.log(`Using existing profile directory: ${profDir}`);
    }

    fs.writeFileSync(path.join(profDir, "email.txt"), acc.email, "utf8");

    logCallback(`→ [${acc.email}] profile dir: ${profDir}`);

    try {
      const browser = await puppeteer.launch({
        headless: false,
        executablePath: chromiumPath.path,
        userDataDir: profDir,
        args: [
          `--user-data-dir=${profDir}`,
          "--no-sandbox",
          "--disable-notifications",
          "--disable-blink-features=AutomationControlled",
          "--lang=in-ID",
          "--start-maximized",
          // Enhanced stealth flags
          "--disable-extensions-except=/dev/null",
          "--disable-extensions",
          "--disable-plugins",
          "--disable-default-apps",
          "--disable-sync",
          "--disable-translate",
          "--hide-scrollbars",
          "--metrics-recording-only",
          "--mute-audio",
          "--no-crash-upload",
          "--disable-logging",
          "--disable-login-animations",
          "--disable-permissions-api",
          "--disable-session-crashed-bubble",
          "--disable-infobars",
          "--disable-component-extensions-with-background-pages",
          "--disable-background-networking",
          "--disable-component-update",
          "--disable-domain-reliability",
          "--disable-client-side-phishing-detection",
          "--disable-field-trial-config",
          "--disable-back-forward-cache",
          "--disable-hang-monitor",
          "--disable-prompt-on-repost",
          "--force-color-profile=srgb",
          "--disable-features=UserMediaScreenCapturing",
          "--disable-popup-blocking",
          "--disable-print-preview",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-ipc-flooding-protection",
        ],
        defaultViewport: null,
        ignoreDefaultArgs: ["--enable-automation"], // Remove automation indicators
      });

      const page = await browser.newPage();

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

      await handleOne(page, acc);

      // Keep browser open for a moment to ensure profile is properly saved
      await new Promise((resolve) => setTimeout(resolve, 2000));

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
