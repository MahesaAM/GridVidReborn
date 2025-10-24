import { Browser, Page } from "puppeteer-core";
import { ChildProcess } from "child_process";
import { profileManager } from "./profile-manager";
import { launchProfile, closeProfile } from "./puppeteer-manager";
import { app } from "electron";
import path from "path";
import fs from "fs/promises";
import notifier from "node-notifier";

export interface AutomationTask {
  id: string;
  type: "text-to-video" | "image-to-video";
  content: string; // prompt text or image path
  status: "pending" | "running" | "completed" | "failed" | "paused";
  accountId: string;
  outputPath?: string;
  error?: string;
}

export interface AccountStatus {
  id: string;
  email: string;
  status: "Ready" | "Running" | "Paused" | "Failed" | "Captcha";
  currentTask?: string;
  progress?: string;
}

class TaskRunner {
  private activeTasks: Map<
    string,
    { browser: Browser; chromeProcess: ChildProcess }
  > = new Map();
  private taskQueue: AutomationTask[] = [];
  private accountQueue: string[] = []; // Queue of account IDs
  private maxConcurrency: number = 3;
  private runningConcurrency: number = 0;
  private isRunning: boolean = false;
  private downloadPath: string = path.join(
    app.getPath("downloads"),
    "GridAutomationStudio"
  );

  // Helper functions for automation (copied/adapted from login-manager.ts)
  private async handleSplash(page: Page): Promise<void> {
    try {
      await page.waitForSelector("mat-dialog-container", { timeout: 7000 });
      const btn = await page.evaluate(() => {
        const xpath =
          "//button[contains(., 'Try Gemini') or contains(., 'Use Google AI Studio')]";
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        return result.singleNodeValue;
      });
      if (btn) {
        await page.evaluate((el: any) => el.click(), btn);
        await page.waitForSelector("mat-dialog-container", {
          hidden: true,
          timeout: 10000,
        });
        console.log("✔️ Splash dialog closed");
      }
    } catch {}
  }

  private async handleTOS(page: Page): Promise<void> {
    try {
      await page.waitForSelector("#mat-mdc-checkbox-0-input", {
        timeout: 7000,
      });
      await page.click("#mat-mdc-checkbox-0-input");
      if (await page.$("#mat-mdc-checkbox-1-input")) {
        await page.click("#mat-mdc-checkbox-1-input");
      }
      await page.waitForSelector(
        'button[aria-label="Accept terms of service"]',
        { visible: true, timeout: 10000 }
      );
      await page.click('button[aria-label="Accept terms of service"]');
      await page.waitForSelector("#mat-mdc-checkbox-0-input", {
        hidden: true,
        timeout: 30000,
      });
      console.log("✔️ Terms of Service accepted");
    } catch {}
  }

  private async handleDriveAccess(page: Page, email: string): Promise<void> {
    try {
      // Check for "Enable saving" button
      const enableBtn = await page.waitForSelector(".enable-drive-button", {
        visible: true,
        timeout: 10000,
      });
      if (enableBtn) {
        await enableBtn.click();
      } else {
        throw new Error("Enable saving button not found");
      }

      // Wait for popup and click "Allow"
      const allowBtn = await page.evaluate(() => {
        const xpath = '//button[contains(text(), "Allow")]';
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        return result.singleNodeValue;
      });
      if (allowBtn) {
        await page.evaluate((el: any) => el.click(), allowBtn);
      } else {
        throw new Error("Allow button not found in popup");
      }

      // Wait for popup to close
      await page.waitForSelector(".enable-drive-button", {
        hidden: true,
        timeout: 10000,
      });
      console.log("✔️ Saving enabled");
    } catch (err) {
      console.warn("⚠️ Enable saving button not found or failed");
    }
  }

  private async checkQuota(page: Page): Promise<number> {
    try {
      await page.waitForSelector(".remaining-quota", {
        visible: true,
        timeout: 10000,
      });
      const quotaText = await page.$eval(
        ".remaining-quota",
        (el) => el.textContent?.trim() || ""
      );
      const match = quotaText.match(/(\d+)\//);
      const remaining = match ? parseInt(match[1], 10) : 0;
      console.log(`Quota remaining: ${remaining}`);
      return remaining;
    } catch (err) {
      console.warn("⚠️ Failed to check quota, assuming 0");
      return 0;
    }
  }

  private async inputPrompt(page: Page, prompt: string): Promise<void> {
    const textareaSel = 'textarea[placeholder="Describe your video"]';
    await page.waitForSelector(textareaSel, { visible: true, timeout: 10000 });
    // Use direct value setting to simulate input
    await page.evaluate((text) => {
      const ta = document.querySelector(
        'textarea[placeholder="Describe your video"]'
      ) as HTMLTextAreaElement;
      if (!ta) throw new Error("Prompt textarea not found");
      ta.value = text;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.dispatchEvent(new Event("change", { bubbles: true }));
    }, prompt);
  }

  private async uploadImage(page: Page, imagePath: string): Promise<void> {
    // Assuming the file input is for image upload; may need adjustment based on page
    const uploadSelector = "input[type='file']";
    const input = await page.$(uploadSelector);
    if (input) {
      await input.uploadFile(imagePath);
    } else {
      throw new Error("Image upload input not found");
    }
  }

  private async selectDuration(
    page: Page,
    duration: string = "5s"
  ): Promise<void> {
    // Click the duration selector
    await page.click('mat-select[id="duration-selector"]');
    await page.waitForTimeout(1000);
    // Select the option based on duration
    const optionSelector = `mat-option[value="${duration}"]`;
    await page.waitForSelector(optionSelector, {
      visible: true,
      timeout: 5000,
    });
    await page.click(optionSelector);
  }

  private async selectAspectRatio(
    page: Page,
    aspect: string = "16:9"
  ): Promise<void> {
    const normalizedAspect = aspect.trim();
    const aspectRatioXPath =
      normalizedAspect === "16:9"
        ? "//ms-aspect-ratio-radio-button//button[.//div[contains(@class, 'aspect-ratio-text') and normalize-space(text())='16:9']]"
        : "//ms-aspect-ratio-radio-button//button[.//div[contains(@class, 'aspect-ratio-text') and normalize-space(text())='9:16']]";
    await page.waitForTimeout(1000);
    const [aspectRatioButton] = await page.$x(aspectRatioXPath);
    if (aspectRatioButton) {
      await aspectRatioButton.click();
    } else {
      throw new Error(`Aspect ratio ${aspect} not found`);
    }
  }

  private async clickRun(page: Page): Promise<void> {
    // Assuming the run button is the submit button or has aria-label "Run"; adjust if needed
    const runSelector = 'button[type="submit"], button[aria-label="Run"]';
    await page.waitForSelector(runSelector, { visible: true, timeout: 10000 });
    await page.click(runSelector);
  }

  private async waitForGenerationComplete(page: Page): Promise<void> {
    // Wait for download button to appear
    await page.waitForSelector('button[aria-label="Download"]', {
      visible: true,
      timeout: 300000,
    }); // 5 min timeout
  }

  private async downloadVideo(page: Page, taskId: string): Promise<string> {
    const downloadSelector = 'button[aria-label="Download"]';
    await page.waitForSelector(downloadSelector, {
      visible: true,
      timeout: 10000,
    });
    const client = await page.target().createCDPSession();
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: this.downloadPath,
    });
    await page.click(downloadSelector);
    // Wait for download to complete (simplified)
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const fileName = `${taskId}.mp4`; // Assume mp4
    const filePath = path.join(this.downloadPath, fileName);
    return filePath;
  }

  constructor() {
    fs.mkdir(this.downloadPath, { recursive: true }).catch(console.error);
  }

  setMaxConcurrency(concurrency: number): void {
    this.maxConcurrency = concurrency;
  }

  setDownloadPath(path: string): void {
    this.downloadPath = path;
    fs.mkdir(this.downloadPath, { recursive: true }).catch(console.error);
  }

  async startBatch(
    tasks: AutomationTask[],
    accountIds: string[]
  ): Promise<void> {
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

  pauseBatch(): void {
    this.isRunning = false;
    console.log("Batch paused.");
  }

  resumeBatch(): void {
    if (this.isRunning) {
      console.warn("Batch is already running.");
      return;
    }
    this.isRunning = true;
    this.processQueue();
    console.log("Batch resumed.");
  }

  stopBatch(): void {
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

  private async processQueue(): Promise<void> {
    if (!this.isRunning) return;

    while (
      this.runningConcurrency < this.maxConcurrency &&
      this.accountQueue.length > 0
    ) {
      const accountId = this.accountQueue.shift();
      if (accountId) {
        this.runningConcurrency++;
        this.runAccountTasks(accountId).finally(() => {
          this.runningConcurrency--;
          this.processQueue(); // Try to pick up next task
        });
      }
    }

    if (
      this.runningConcurrency === 0 &&
      this.accountQueue.length === 0 &&
      this.taskQueue.length === 0
    ) {
      console.log("Batch completed!");
      notifier.notify({
        title: "GridAutomation Studio",
        message: "Batch automation completed!",
        sound: true,
      });
      this.isRunning = false;
    }
  }

  private async runAccountTasks(accountId: string): Promise<void> {
    const account = profileManager
      .getAccounts()
      .find((acc) => acc.id === accountId);
    if (!account) {
      console.error(`Account with ID ${accountId} not found.`);
      return;
    }

    profileManager.updateAccountStatus(accountId, "Running");
    let browser: Browser | undefined;
    let chromeProcess: ChildProcess | undefined;
    let page: Page | undefined;

    try {
      const password = await profileManager.getAccountPassword(accountId);
      if (!password) {
        throw new Error(`Password not found for account ${account.email}`);
      }

      ({ browser, chromeProcess } = await launchProfile(account.email));
      this.activeTasks.set(accountId, { browser, chromeProcess });
      page = await browser.newPage();
      await page.setViewport({ width: 1366, height: 768 });

      // Navigate to AI Studio generate video page
      await page.goto("https://aistudio.google.com/u/0/generate-video?pli=1", {
        waitUntil: "domcontentloaded",
      });

      // Handle splash if present
      await this.handleSplash(page);

      // Handle drive access if needed (check for "Enable saving" button)
      await this.handleDriveAccess(page, account.email);

      // Check quota
      const remainingQuota = await this.checkQuota(page);
      if (remainingQuota <= 0) {
        console.log(
          `No quota remaining for ${account.email}, skipping to next account.`
        );
        profileManager.updateAccountStatus(accountId, "Ready");
        return;
      }

      // Filter tasks for this account that are pending
      const accountTasks = this.taskQueue.filter(
        (task) => task.accountId === accountId && task.status === "pending"
      );

      for (const task of accountTasks) {
        if (!this.isRunning) {
          profileManager.updateAccountStatus(accountId, "Paused");
          return; // Stop if batch is paused
        }

        // Re-check quota before each task
        const currentQuota = await this.checkQuota(page);
        if (currentQuota <= 0) {
          console.log(
            `Quota exhausted for ${account.email} during task ${task.id}`
          );
          break;
        }

        task.status = "running";
        console.log(
          `Running task ${task.id} for account ${account.email}: ${task.content}`
        );

        try {
          // Handle TOS if present
          await this.handleTOS(page);

          // Input prompt or upload image
          if (task.type === "text-to-video") {
            await this.inputPrompt(page, task.content);
          } else if (task.type === "image-to-video") {
            await this.uploadImage(page, task.content);
          }

          // Select duration and aspect ratio (defaults)
          await this.selectDuration(page);
          await this.selectAspectRatio(page);

          // Click run
          await this.clickRun(page);

          // Wait for generation to complete
          await this.waitForGenerationComplete(page);

          // Download video
          const outputPath = await this.downloadVideo(page, task.id);
          task.outputPath = outputPath;
          task.status = "completed";
          console.log(`Task ${task.id} completed for ${account.email}`);
        } catch (taskError: any) {
          task.status = "failed";
          task.error = taskError.message;
          console.error(
            `Task ${task.id} failed for ${account.email}: ${taskError.message}`
          );
        }
      }

      profileManager.updateAccountStatus(accountId, "Ready");
      profileManager.updateAccountLastLogin(accountId);
    } catch (error: any) {
      console.error(`Error running tasks for account ${account.email}:`, error);
      profileManager.updateAccountStatus(accountId, "Failed");
      notifier.notify({
        title: "GridAutomation Studio - Error",
        message: `Automation failed for ${account.email}: ${error.message}`,
        sound: true,
      });
    } finally {
      if (page) await page.close();
      if (browser && chromeProcess) {
        await closeProfile(browser, chromeProcess);
        this.activeTasks.delete(accountId);
      }
    }
  }
}

export const taskRunner = new TaskRunner();
