import { app } from "electron";
import puppeteer from "puppeteer-extra";
import { getChromiumPath } from "./chromium-utils";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AnonymizeUA from "puppeteer-extra-plugin-anonymize-ua";
import path from "path";
import fs from "fs";
import {
  sanitize,
  clearAndType,
  waitAndClick,
  checkQuota,
  handleAutoSaveModal,
} from "./common-utils";

puppeteer.use(StealthPlugin());
puppeteer.use(AnonymizeUA());

// ——— Configuration ———
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

// Wait for device verification with timeout
async function waitForVerification(page: any, timeout = 20000): Promise<void> {
  try {
    await Promise.race([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout }),
      page.waitForFunction(
        () => {
          return (
            !document.location.href.includes("/signin/challenge") &&
            !document.querySelector("div[data-challenge]")
          );
        },
        { timeout, polling: 200 }
      ), // Faster polling
      new Promise((resolve) => setTimeout(resolve, timeout)).then(() => {
        throw new Error("Verification timeout");
      }),
    ]);
  } catch (err: any) {
    if (err.message === "Verification timeout") {
      throw err;
    }
    throw err;
  }
}

async function waitForCaptcha(page: any, timeout = 30000): Promise<void> {
  try {
    await Promise.race([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout }),
      page.waitForFunction(
        () => {
          return (
            !document.querySelector('iframe[src*="recaptcha"]') &&
            !document.querySelector("div#recaptcha") &&
            !document.location.href.includes("/signin/captcha")
          );
        },
        { timeout, polling: 200 }
      ),
      new Promise((resolve) => setTimeout(resolve, timeout)).then(() => {
        throw new Error("Captcha timeout");
      }),
    ]);
  } catch (err: any) {
    if (err.message === "Captcha timeout") {
      throw err;
    }
    throw err;
  }
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

// Handle one account's login flow
async function handleSplash(page: any): Promise<void> {
  try {
    await page.waitForSelector("mat-dialog-container", { timeout: 7000 });
    const splashButton = await page.$(
      'button[aria-label*="Gemini"], button[aria-label*="Studio"]'
    );
    if (splashButton) {
      await splashButton.click();
      await page.waitForSelector("mat-dialog-container", {
        hidden: true,
        timeout: 10000,
      });
    }
  } catch (err) {}
}

async function handleTOS(page: any): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.waitForSelector('mat-checkbox[id*="mat-mdc-checkbox"]', {
        timeout: 7000,
      });
      const checkboxes = await page.$$('mat-checkbox[id*="mat-mdc-checkbox"]');
      for (const checkbox of checkboxes) {
        await checkbox.click();
      }
      await waitAndClick(page, 'button[aria-label*="Accept"]');
      await page.waitForSelector('mat-checkbox[id*="mat-mdc-checkbox"]', {
        hidden: true,
        timeout: 30000,
      });
      return;
    } catch (err) {
      if (attempt === 3) {
      }
    }
  }
}

async function handleDriveAccess(
  page: any,
  email: string,
  logCallback: (msg: string) => void
): Promise<void> {
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
        logCallback(`⚠️ Drive button not found after ${attempt} attempts`);
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
      if (attempt === 3) logCallback("⚠️ No confirmation dialog found");
    }
  }

  // 5. Enhanced popup handling with timeout
  let popup;
  try {
    popup = await popupPromise;
    await (popup as any).setDefaultTimeout(60000);
    await (popup as any).bringToFront();
  } catch (err: any) {
    logCallback("⚠️ Failed to handle popup: " + err.message);
    return;
  }

  // 6. Improved account selection
  try {
    const accountSelector = `div[data-identifier="${email}"]`;

    // Wait for the selector to appear in the popup or one of its frames
    await (popup as any).waitForFunction(
      (selector: string) => {
        const frames = Array.from(document.querySelectorAll("iframe"));
        if (document.querySelector(selector)) return true;
        for (const frame of frames) {
          if (frame.contentDocument?.querySelector(selector)) return true;
        }
        return false;
      },
      { timeout: 60000 },
      accountSelector
    );

    let handle = await (popup as any).$(accountSelector);
    let targetFrame = null;

    if (!handle) {
      const frames = (popup as any).frames();
      for (const frame of frames) {
        handle = await frame.$(accountSelector);
        if (handle) {
          targetFrame = frame;
          break;
        }
      }
    }

    if (!handle) {
      logCallback(`❌ Account ${email} not found in popup after waiting.`);
      return;
    }

    await handle.evaluate((el: Element) =>
      el.scrollIntoView({ block: "center", behavior: "smooth" })
    );

    const targetContext = targetFrame || popup;
    await (targetContext as any).waitForTimeout(500); // Wait for scroll animation

    // More robust click
    await handle.click({ delay: 100 + Math.random() * 100 });

    // 8. Enhanced navigation waiting
    await (popup as any).waitForNavigation({
      waitUntil: "networkidle0",
      timeout: 120000,
    });
  } catch (err: any) {
    logCallback("⚠️ Error during account selection: " + err.message);
    const screenshotPath = path.join(
      ERRORS_ROOT,
      `account-selection-error-${sanitize(email)}.png`
    );
    try {
      await (popup as any).screenshot({ path: screenshotPath });
      logCallback(`📷 Screenshot saved to: ${screenshotPath}`);
    } catch (ssError: any) {
      logCallback(`⚠️ Could not take screenshot: ${ssError.message}`);
    }
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
  } catch (err) {
    logCallback("⚠️ Drive button still visible after process");
  }
}

async function handleEnableSaving(
  page: any,
  email: string,
  logCallback: (msg: string) => void
): Promise<void> {
  try {
    logCallback(
      "⏳ Langkah 1: Mencari tombol 'Enable saving' di halaman utama..."
    );

    // Selector yang spesifik dan andal untuk tombol "Enable saving"
    const enableSavingButtonSelector = "button.enable-drive-button";
    const enableBtn = await page.waitForSelector(enableSavingButtonSelector, {
      visible: true,
      timeout: 15000, // Waktu tunggu 15 detik
    });

    // -------------------------------------------------------------------

    logCallback(
      "⏳ Langkah 2: Menyiapkan 'pendengar' untuk popup yang akan muncul..."
    );
    // Buat sebuah Promise yang akan selesai HANYA JIKA popup terdeteksi.
    // Ini adalah cara paling andal untuk menangani popup.
    const popupPromise = new Promise<any>((resolve, reject) => {
      // Set timeout manual jika popup tidak muncul sama sekali
      const timeoutId = setTimeout(
        () =>
          reject(new Error("Timeout: Popup tidak muncul setelah 30 detik.")),
        30000
      );

      // 'targetcreated' adalah event saat tab/popup baru dibuat.
      page.browser().once("targetcreated", async (target: any) => {
        // Filter untuk memastikan itu adalah popup yang benar
        if (
          target.type() === "page" &&
          target.url().includes("oauthchooseaccount")
        ) {
          clearTimeout(timeoutId); // Batalkan timeout jika popup ditemukan
          const newPopupPage = await target.page();
          if (newPopupPage) {
            resolve(newPopupPage); // Kirim halaman popup yang baru
          } else {
            reject(
              new Error("Popup terdeteksi tetapi gagal mendapatkan halamannya.")
            );
          }
        }
      });
    });

    // -------------------------------------------------------------------

    logCallback(
      "🖱️ Langkah 3: Mengklik tombol 'Enable saving' untuk memicu popup..."
    );
    await enableBtn.click();

    // -------------------------------------------------------------------

    let popup: any;
    try {
      logCallback(
        "⏳ Langkah 4: Menunggu 'pendengar' menangkap halaman popup..."
      );
      popup = await popupPromise; // Tunggu hingga Promise di atas selesai
      await popup.bringToFront(); // Bawa popup ke depan untuk visual
    } catch (err: any) {
      logCallback("⚠️ Gagal menangani kemunculan popup: " + err.message);
      return; // Hentikan fungsi jika popup gagal muncul
    }

    // -------------------------------------------------------------------

    // MULAI DARI SINI, SEMUA PERINTAH DIJALANKAN DI DALAM 'popup', BUKAN 'page'

    try {
      // Ini adalah selector yang paling TEPAT dan STABIL berdasarkan HTML Anda
      const accountSelector = `div[data-identifier="${email}"]`;

      logCallback(
        `⏳ Langkah 5: Mencari elemen akun dengan selector: ${accountSelector}`
      );

      // Tunggu hingga elemen akun muncul DI DALAM POPUP
      const accountElement = await popup.waitForSelector(accountSelector, {
        visible: true,
        timeout: 30000, // Beri waktu 30 detik untuk muncul
      });

      // Klik elemen dengan jeda acak untuk simulasi perilaku manusia
      await accountElement.click({ delay: 200 + Math.random() * 100 });

      // Setelah diklik, biasanya popup akan memproses atau bernavigasi
      logCallback(
        "⏳ Langkah 6: Menunggu proses otorisasi setelah akun diklik..."
      );
      await popup.waitForNavigation({
        waitUntil: "networkidle0",
        timeout: 60000,
      });
    } catch (err: any) {
      logCallback(
        "⚠️ Gagal menemukan atau mengklik akun di dalam popup: " + err.message
      );
      // Ambil screenshot popup untuk debugging jika terjadi error
      const screenshotPath = path.join(
        ERRORS_ROOT,
        `popup-error-${sanitize(email)}.png`
      );
      await popup.screenshot({ path: screenshotPath, fullPage: true });
      logCallback(
        `📷 Screenshot popup yang gagal disimpan di: ${screenshotPath}`
      );
    } finally {
      // Apapun yang terjadi (berhasil atau gagal), tutup popup jika masih ada
      if (popup && !popup.isClosed()) {
        await popup.close();
      }
    }

    // -------------------------------------------------------------------

    // Tunggu hingga tombol "Enable saving" menghilang sebagai konfirmasi
    await page.waitForSelector(enableSavingButtonSelector, {
      hidden: true,
      timeout: 20000,
    });
  } catch (err: any) {
    // Menangkap error dari seluruh proses di fungsi ini
    logCallback(
      "❌ Terjadi error fatal di fungsi handleEnableSaving: " + err.message
    );
  }
}

async function handleOne(
  page: any,
  { email, password }: { email: string; password: string },
  logCallback: (msg: string) => void
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

    await handleDriveAccess(page, email, logCallback);
    await handleEnableSaving(page, email, logCallback);
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

    // Always delete existing profile directory to clear cache
    if (fs.existsSync(profDir)) {
      fs.rmSync(profDir, { recursive: true, force: true });
    }

    fs.mkdirSync(profDir, { recursive: true });

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

      await handleOne(page, acc, logCallback);

      // Close browser after login
      await browser.close();

      // Reopen browser with the created profile
      const browser2 = await puppeteer.launch({
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

      const page2 = await browser2.newPage();

      // Set realistic viewport and user agent
      await page2.setViewport({
        width: 1366 + Math.floor(Math.random() * 200),
        height: 768 + Math.floor(Math.random() * 200),
        deviceScaleFactor: 1,
        hasTouch: false,
        isLandscape: true,
        isMobile: false,
      });

      // Override navigator properties to avoid detection
      await page2.evaluateOnNewDocument(() => {
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

      // Navigate to AI Studio with profile
      await page2.goto("https://aistudio.google.com/u/0/generate-video?pli=1", {
        waitUntil: "domcontentloaded",
      });

      // Wait for profile to load and check if correct account is logged in
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds for profile to load

      // Check if the correct email is logged in by looking for account switcher or profile info
      try {
        const accountInfo = await page2.$eval(
          '[data-testid="account-info"], .account-info, [aria-label*="Account"], .profile-button',
          (el) => el.textContent || el.getAttribute("aria-label")
        );
        if (!accountInfo || !accountInfo.includes(acc.email)) {
          throw new Error(
            `Account mismatch: found ${accountInfo}, expected ${acc.email}`
          );
        }
      } catch (err) {
        throw err;
      }

      // Additional wait to ensure everything is loaded
      await new Promise((resolve) => setTimeout(resolve, 5000));

      await browser2.close();

      results.push({ email: acc.email, success: true });
    } catch (err: any) {
      results.push({ email: acc.email, success: false, error: err.message });
    }
  }

  logCallback("✅ All done.");
  return results;
}

let stopRequested = false;

async function stopLogin() {
  stopRequested = true;
}

export { stopLogin };
