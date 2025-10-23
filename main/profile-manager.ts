import { app } from "electron";
import path from "path";
import fs from "fs/promises";
import Database from "better-sqlite3";
import keytar from "keytar";
import { v4 as uuidv4 } from "uuid";

const DB_PATH = path.join(app.getPath("userData"), "database.sqlite");
const SERVICE_NAME = "GridAutomationStudio";

// Profile root configuration - use app's user data directory for cross-platform compatibility
const CUSTOM_ROOT =
  process.platform === "win32"
    ? "C:/profiles"
    : `/Users/${process.env.USER || "pttas"}`;
const ROOT = CUSTOM_ROOT || app.getPath("userData");
const PROFILES_ROOT = path.resolve(ROOT, "profiles");
const ERRORS_ROOT = path.resolve(ROOT, "errors");

// Create root folders if they don't exist
import fsSync from "fs";
for (const dir of [PROFILES_ROOT, ERRORS_ROOT]) {
  if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true });
}

// Sanitize email to use as folder name
function sanitize(email: string): string {
  return email.replace(/[@.]/g, "_");
}

export interface Account {
  id: string;
  email: string;
  lastLogin?: string;
  status?: string;
}

class ProfileManager {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.initDb();
  }

  private initDb() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        lastLogin TEXT,
        status TEXT DEFAULT 'Ready'
      );
    `);
  }

  async addAccount(email: string, password: string): Promise<Account> {
    const id = uuidv4();
    await keytar.setPassword(SERVICE_NAME, id, password);
    this.db
      .prepare("INSERT INTO accounts (id, email) VALUES (?, ?)")
      .run(id, email);
    return { id, email, status: "Ready" };
  }

  async getAccountPassword(id: string): Promise<string | null> {
    return await keytar.getPassword(SERVICE_NAME, id);
  }

  getAccounts(): Account[] {
    return this.db
      .prepare("SELECT id, email, lastLogin, status FROM accounts")
      .all() as Account[];
  }

  updateAccountStatus(id: string, status: string): void {
    this.db
      .prepare("UPDATE accounts SET status = ? WHERE id = ?")
      .run(status, id);
  }

  updateAccountLastLogin(id: string): void {
    this.db
      .prepare("UPDATE accounts SET lastLogin = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  async importAccountsFromExcel(filePath: string): Promise<Account[]> {
    try {
      const { parseAccountExcel } = await import("./excel-loader");
      const accountsData = parseAccountExcel(filePath);

      if (!Array.isArray(accountsData)) {
        throw new Error("Invalid data format returned from Excel parser");
      }

      const addedAccounts: Account[] = [];

      for (const acc of accountsData) {
        try {
          if (!acc.email || !acc.password) {
            console.warn(
              `Skipping account with missing email or password: ${JSON.stringify(
                acc
              )}`
            );
            continue;
          }

          const newAccount = await this.addAccount(
            acc.email.trim(),
            acc.password.trim()
          );
          addedAccounts.push(newAccount);
        } catch (error: any) {
          if (error.message.includes("UNIQUE constraint failed")) {
            console.warn(`Account ${acc.email} already exists. Skipping.`);
          } else {
            console.error(`Failed to add account ${acc.email}:`, error);
          }
        }
      }

      return addedAccounts;
    } catch (error: any) {
      console.error("Error in importAccountsFromExcel:", error);
      throw new Error(`Failed to import accounts: ${error.message}`);
    }
  }

  async deleteAccount(id: string): Promise<void> {
    await keytar.deletePassword(SERVICE_NAME, id);
    this.db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
    // Optionally, clean up user data directory
    const userDataDir = path.join(PROFILES_ROOT, id); // Using account ID as folder name
    try {
      await fs.rm(userDataDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to remove profile directory for ${id}:`, error);
    }
  }
}

export const profileManager = new ProfileManager();
