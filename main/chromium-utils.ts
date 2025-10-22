import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export interface ChromiumPathResult {
  path: string;
  version: string;
}

export async function getChromiumPath(
  options: {
    customPaths?: string[];
  } = {}
): Promise<ChromiumPathResult> {
  const { customPaths = [] } = options;

  // Check custom paths first
  for (const customPath of customPaths) {
    if (fs.existsSync(customPath)) {
      try {
        const version = execSync(`"${customPath}" --version`, {
          encoding: "utf8",
        }).trim();
        return { path: customPath, version };
      } catch (error) {
        // Continue to next path
      }
    }
  }

  // Check for chrome-for-testing in project directory
  const projectRoot = path.resolve(__dirname, "..", "..");
  const chromeForTestingPaths = [
    path.join(projectRoot, "chrome-for-testing", "chrome.exe"), // Windows
    path.join(projectRoot, "chrome-for-testing", "chrome"), // Linux/Mac
    path.join(
      projectRoot,
      "chrome-for-testing",
      "Chromium.app",
      "Contents",
      "MacOS",
      "Chromium"
    ), // Mac App
  ];

  for (const chromiumPath of chromeForTestingPaths) {
    if (fs.existsSync(chromiumPath)) {
      try {
        const version = execSync(`"${chromiumPath}" --version`, {
          encoding: "utf8",
        }).trim();
        return { path: chromiumPath, version };
      } catch (error) {
        // Continue to next path
      }
    }
  }

  // Fallback to puppeteer-chromium in project directory
  const puppeteerChromiumPaths = [
    path.join(projectRoot, "puppeteer-chromium", "chrome.exe"), // Windows
    path.join(projectRoot, "puppeteer-chromium", "chrome"), // Linux/Mac
    path.join(
      projectRoot,
      "puppeteer-chromium",
      "Chromium.app",
      "Contents",
      "MacOS",
      "Chromium"
    ), // Mac App
  ];

  for (const chromiumPath of puppeteerChromiumPaths) {
    if (fs.existsSync(chromiumPath)) {
      try {
        const version = execSync(`"${chromiumPath}" --version`, {
          encoding: "utf8",
        }).trim();
        return { path: chromiumPath, version };
      } catch (error) {
        // Continue to next path
      }
    }
  }

  // Try to find Chrome/Chromium in common locations
  const commonPaths = [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];

  for (const chromePath of commonPaths) {
    if (fs.existsSync(chromePath)) {
      try {
        const version = execSync(`"${chromePath}" --version`, {
          encoding: "utf8",
        }).trim();
        return { path: chromePath, version };
      } catch (error) {
        // Continue to next path
      }
    }
  }

  // Try to find via which command
  try {
    const whichResult = execSync(
      "which google-chrome || which chromium-browser || which chromium",
      { encoding: "utf8" }
    ).trim();
    if (whichResult) {
      const version = execSync(`"${whichResult}" --version`, {
        encoding: "utf8",
      }).trim();
      return { path: whichResult, version };
    }
  } catch (error) {
    // Continue
  }

  throw new Error(
    "Chromium/Chrome executable not found. Please install Chrome or Chromium, or specify a custom path."
  );
}
