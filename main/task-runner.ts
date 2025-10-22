import { Browser } from "puppeteer-core";
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

    try {
      const password = await profileManager.getAccountPassword(accountId);
      if (!password) {
        throw new Error(`Password not found for account ${account.email}`);
      }

      ({ browser, chromeProcess } = await launchProfile(account.email));
      this.activeTasks.set(accountId, { browser, chromeProcess });

      // Filter tasks for this account that are pending
      const accountTasks = this.taskQueue.filter(
        (task) => task.accountId === accountId && task.status === "pending"
      );

      for (const task of accountTasks) {
        if (!this.isRunning) {
          profileManager.updateAccountStatus(accountId, "Paused");
          return; // Stop if batch is paused
        }

        task.status = "running";
        // TODO: Implement actual Puppeteer automation logic here
        console.log(
          `Running task ${task.id} for account ${account.email}: ${task.content}`
        );

        // Simulate automation
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * 5000 + 2000)
        );

        // Simulate success or failure
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
    } catch (error: any) {
      console.error(`Error running tasks for account ${account.email}:`, error);
      profileManager.updateAccountStatus(accountId, "Failed");
      notifier.notify({
        title: "GridAutomation Studio - Error",
        message: `Automation failed for ${account.email}: ${error.message}`,
        sound: true,
      });
    } finally {
      if (browser && chromeProcess) {
        await closeProfile(browser, chromeProcess);
        this.activeTasks.delete(accountId);
      }
    }
  }
}

export const taskRunner = new TaskRunner();
