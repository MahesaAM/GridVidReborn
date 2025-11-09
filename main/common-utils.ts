// Common utilities for login and generation scripts

const path = require("path");
const fs = require("fs");

// Sanitize email to use as folder name
function sanitize(email: string): string {
  return email.replace(/[@.]/g, "_");
}

// Clear existing value and type text quickly
async function clearAndType(
  page: any,
  selector: string,
  text: string,
  timeout = 5000
): Promise<void> {
  // Special handling for password fields with retry
  if (selector.includes("password") || selector.includes("Passwd")) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      // Reduced retries
      try {
        await page.waitForSelector(selector, { visible: true, timeout });
        const el = await page.$(selector);
        await page.waitForFunction((el: any) => !el.disabled, {}, el);
        await el.click({ clickCount: 3 });
        await page.keyboard.press("Backspace");
        await el.type(text, { delay: 0 }); // Faster typing
        return;
      } catch (err) {
        if (attempt === 2) throw err;
      }
    }
  } else {
    await page.waitForSelector(selector, { visible: true, timeout });
    const el = await page.$(selector);
    await el.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await el.type(text, { delay: 0 });
  }
}

async function waitAndClick(
  page: any,
  selector: string,
  opts: any = {}
): Promise<void> {
  const timeout = opts.timeout || 5000; // Reduced default
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.click(selector);
}

// Click element as fast as possible
async function clickFast(
  page: any,
  selector: string,
  timeout = 5000
): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.$eval(selector, (el: any) => el.click());
}

async function checkQuota(page: any, timeout = 5000): Promise<number | null> {
  try {
    await page.waitForSelector(".remaining-quota", { timeout });
    const quotaText = await page.evaluate(() => {
      const el = document.querySelector(".remaining-quota");
      if (el) {
        const parent = el.parentElement;
        return parent ? parent.textContent.trim() : null;
      }
      return null;
    });
    if (quotaText) {
      const match = quotaText.match(/(\d+)\s*\/\s*\d+/);
      if (match) {
        return parseInt(match[1]);
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

async function handleSplash(page: any): Promise<boolean> {
  try {
    await page.waitForSelector("mat-dialog-container", { timeout: 3000 });
    const [btn] = await page.$x(
      "//button[contains(., 'Try Gemini') or contains(., 'Use Google AI Studio')]"
    );
    if (btn) {
      await btn.click();
      await page.waitForSelector("mat-dialog-container", {
        hidden: true,
        timeout: 3000,
      });
      return true;
    }
  } catch {}
  return false;
}

async function handleTOS(page: any): Promise<void> {
  try {
    await page.waitForSelector("#mat-mdc-checkbox-0-input", { timeout: 3000 });
    await page.click("#mat-mdc-checkbox-0-input");
    if (await page.$("#mat-mdc-checkbox-1-input")) {
      await page.click("#mat-mdc-checkbox-1-input");
    }
    await waitAndClick(page, 'button[aria-label="Accept terms of service"]', {
      timeout: 5000,
    });
    await page.waitForSelector("#mat-mdc-checkbox-0-input", {
      hidden: true,
      timeout: 5000,
    });
  } catch {}
}

async function handleAutoSaveModal(page: any): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        const modalText = document.body.textContent || "";
        return (
          modalText.includes("Auto-save is now enabled by default") &&
          modalText.includes("Got it")
        );
      },
      { timeout: 3000 }
    );

    const [gotItButton] = await page.$x(
      "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'got it')]"
    );
    if (gotItButton) {
      await gotItButton.click();
      return true;
    } else {
      const cssButton = await page.$("button.ms-button-primary");
      if (cssButton) {
        const buttonText = await page.evaluate(
          (el: any) => el.textContent.trim(),
          cssButton
        );
        if (buttonText.toLowerCase().includes("got it")) {
          await cssButton.click();
          return true;
        }
      }
    }
  } catch (err) {}
  return false;
}

async function handleDriveAccess(page: any, email: string): Promise<void> {
  let btn;
  try {
    btn = await page.waitForSelector("button.enable-drive-button", {
      visible: true,
      timeout: 3000,
    });
  } catch {
    const [xpathBtn] = await page.$x(
      '//button[contains(text(), "Enable saving")]'
    );
    btn = xpathBtn;
  }
  if (!btn) return;

  const popupPromise = new Promise<any>((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new Error("Popup timeout")),
      10000
    ); // Reduced
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

  try {
    await btn.click();
  } catch (err) {
    await page.evaluate((el: any) => el.click(), btn);
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    // Reduced retries
    try {
      const confirmBtn = await page.waitForSelector(
        "button[matdialogclose], button.confirm-button",
        { visible: true, timeout: 2000 }
      );
      await confirmBtn.click();
      await page.waitForSelector("button[matdialogclose]", {
        hidden: true,
        timeout: 3000,
      });
      break;
    } catch (err) {
      if (attempt === 2) console.warn("No confirmation dialog found");
    }
  }

  let popup;
  try {
    popup = await popupPromise;
  } catch (err) {
    return;
  }

  try {
    const ulHandle = await popup.$("ul");
    if (!ulHandle) return;
    const liHandle = await ulHandle.$("li");
    if (!liHandle) return;

    try {
      await liHandle.click();
    } catch {
      await popup.evaluate((el: any) => el.click(), liHandle);
    }

    await Promise.race([
      popup.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }),
      popup.waitForNavigation({ waitUntil: "load", timeout: 30000 }),
    ]);
  } catch (err) {
  } finally {
    if (popup && !popup.isClosed()) {
      await popup.close();
    }
  }

  try {
    await page.waitForFunction(
      () => {
        const buttons = Array.from(document.querySelectorAll("button"));
        return !buttons.some(
          (btn: any) =>
            btn.textContent.includes("Enable saving") &&
            btn.offsetParent !== null
        );
      },
      { timeout: 10000 }
    );
  } catch (err) {}
}

export {
  sanitize,
  clearAndType,
  waitAndClick,
  clickFast,
  checkQuota,
  handleSplash,
  handleTOS,
  handleAutoSaveModal,
  handleDriveAccess,
};
