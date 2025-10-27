/// <reference types="electron" />
// preload-webview.ts
import { contextBridge, ipcRenderer } from "electron";

// --- Konfigurasi Profil yang Konsisten ---
// Buat satu profil yang koheren untuk seluruh sesi. Hindari randomisasi di setiap pemanggilan.
const PROFILE = {
  // Persona: Pengguna Chrome 120 di macOS Sonoma (Intel) dari Amerika
  USER_AGENT:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6167.85 Safari/537.36",
  PLATFORM: "MacIntel",
  VENDOR: "Google Inc.",
  LANGUAGES: ["en-US", "en"],
  TIMEZONE: "America/New_York",
  HARDWARE_CONCURRENCY: 8, // Nilai yang wajar
  DEVICE_MEMORY: 16, // Nilai yang wajar
  WEBGL_VENDOR: "Intel Inc.",
  WEBGL_RENDERER: "Intel(R) Iris(TM) Plus Graphics 640",
  SCREEN: {
    width: 1920,
    height: 1080,
    availWidth: 1920,
    availHeight: 1040, // Sisakan ruang untuk menu bar
    colorDepth: 24,
    pixelDepth: 24,
  },
};

// Declare window.chrome to avoid TypeScript errors in preload
declare global {
  interface Window {
    chrome: {
      runtime: {};
      csi: () => void;
      loadTimes: () => void;
      app: { isInstalled: boolean };
    };
    clickAllowButton: () => Promise<boolean>;
    autoDetectAllowPopup: () => void;
  }
}

(function () {
  "use strict";
  console.log("Anti-detection script injected.");

  // 1. Hapus properti 'webdriver'
  Object.defineProperty(navigator, "webdriver", {
    get: () => undefined,
  });

  // 2. Hapus variabel spesifik ChromeDriver
  delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Array;
  delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Promise;
  // ...dan properti sejenis lainnya

  // 3. Palsukan Properti Navigator yang Konsisten
  Object.defineProperties(navigator, {
    languages: { get: () => PROFILE.LANGUAGES },
    platform: { get: () => PROFILE.PLATFORM },
    hardwareConcurrency: { get: () => PROFILE.HARDWARE_CONCURRENCY },
    deviceMemory: { get: () => PROFILE.DEVICE_MEMORY },
    vendor: { get: () => PROFILE.VENDOR },
    maxTouchPoints: { get: () => 0 },
    doNotTrack: { get: () => null },
  });

  // 4. Palsukan `userAgentData` (Client Hints) agar konsisten dengan User-Agent
  if (navigator.userAgentData) {
    Object.defineProperty(navigator, "userAgentData", {
      get: () => ({
        brands: [
          { brand: "Not/A)Brand", version: "8" },
          { brand: "Chromium", version: "120" },
          { brand: "Google Chrome", version: "120" },
        ],
        mobile: false,
        platform: "macOS",
        getHighEntropyValues: async (hints: string[]) => ({
          architecture: "x86", // Konsisten dengan Intel Mac
          bitness: "64",
          model: "",
          platformVersion: "10.15.7", // Konsisten dengan User-Agent
          uaFullVersion: "120.0.6167.85",
        }),
      }),
    });
  }

  // 5. Palsukan Plugin
  const mockPlugins = Object.freeze([
    {
      name: "Chrome PDF Plugin",
      description: "Portable Document Format",
      filename: "internal-pdf-viewer",
    },
    {
      name: "Chrome PDF Viewer",
      description: "",
      filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
    },
    {
      name: "Native Client",
      description: "",
      filename: "internal-nacl-plugin",
    },
  ]);
  Object.defineProperty(navigator, "plugins", { get: () => mockPlugins });

  // 6. Palsukan Properti Layar (Screen)
  Object.defineProperties(screen, {
    width: { get: () => PROFILE.SCREEN.width },
    height: { get: () => PROFILE.SCREEN.height },
    availWidth: { get: () => PROFILE.SCREEN.availWidth },
    availHeight: { get: () => PROFILE.SCREEN.availHeight },
    colorDepth: { get: () => PROFILE.SCREEN.colorDepth },
    pixelDepth: { get: () => PROFILE.SCREEN.pixelDepth },
  });

  // 7. Palsukan Timezone
  Object.defineProperty(Intl.DateTimeFormat.prototype, "resolvedOptions", {
    value: function () {
      const originalOptions =
        Intl.DateTimeFormat.prototype.resolvedOptions.call(this);
      return { ...originalOptions, timeZone: PROFILE.TIMEZONE };
    },
  });

  // 8. Palsukan WebGL
  try {
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter) {
      if (parameter === 37445) return PROFILE.WEBGL_VENDOR; // UNMASKED_VENDOR_WEBGL
      if (parameter === 37446) return PROFILE.WEBGL_RENDERER; // UNMASKED_RENDERER_WEBGL
      return getParameter.call(this, parameter);
    };
  } catch (e) {
    console.error("WebGL spoofing failed:", e);
  }

  // 9. Palsukan Canvas Fingerprinting (Canvas Poisoning)
  const toDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...args: any[]) {
    const ctx = this.getContext("2d");
    if (ctx) {
      // Tambahkan noise yang halus dan konsisten
      const imageData = ctx.getImageData(0, 0, this.width, this.height);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = imageData.data[i] + 1; // Ubah sedikit nilai piksel
      }
      ctx.putImageData(imageData, 0, 0);
    }
    return toDataURL.apply(this, args as any);
  };

  // 10. Palsukan `window.chrome`
  // This is now handled by the declare global block

  // 11. Fungsi khusus untuk tombol Allow dengan ID spesifik
  window.clickAllowButton = async () => {
    console.log("Mencari tombol Allow dengan ID submit_approve_access...");

    // Strategy 1: Cari langsung dengan ID
    const allowButton = document.getElementById(
      "submit_approve_access"
    ) as HTMLButtonElement | null;
    if (allowButton) {
      console.log("Tombol Allow ditemukan dengan ID submit_approve_access");

      // Pastikan tombol bisa diklik
      if (!allowButton.disabled && allowButton.offsetParent !== null) {
        allowButton.click();
        ipcRenderer.sendToHost("allow-button-clicked");
        return true;
      } else {
        console.log(
          "Tombol ditemukan tapi tidak bisa diklik (disabled/hidden)"
        );
      }
    }

    // Strategy 2: Cari dengan class yang spesifik
    const allowByClass = document.querySelector(
      ".JIE42b"
    ) as HTMLButtonElement | null;
    if (allowByClass) {
      console.log("Tombol Allow ditemukan dengan class JIE42b");
      allowByClass.click();
      ipcRenderer.sendToHost("allow-button-clicked");
      return true;
    }

    // Strategy 3: Cari dengan kombinasi type="submit" dan teks "Allow"
    const buttons = Array.from(
      document.querySelectorAll('button, input[type="submit"]')
    );
    const allowByText = buttons.find((button) => {
      const text = button.textContent?.trim();
      return text === "Allow" || text === "Izinkan";
    }) as HTMLButtonElement | HTMLInputElement | undefined;

    if (allowByText) {
      console.log("Tombol Allow ditemukan berdasarkan teks");
      allowByText.click();
      ipcRenderer.sendToHost("allow-button-clicked");
      return true;
    }

    console.log("Tombol Allow tidak ditemukan");
    ipcRenderer.sendToHost("allow-button-not-found");
    return false;
  };

  // Auto-detect untuk popup Allow
  window.autoDetectAllowPopup = () => {
    // Cek setiap 2 detik apakah tombol Allow muncul
    const checkInterval = setInterval(() => {
      const allowButton = document.getElementById(
        "submit_approve_access"
      ) as HTMLButtonElement | null;
      if (
        allowButton &&
        !allowButton.disabled &&
        allowButton.offsetParent !== null
      ) {
        console.log("Auto-detected Allow button, clicking...");
        allowButton.click();
        ipcRenderer.sendToHost("auto-allow-clicked");
        clearInterval(checkInterval);
      }
    }, 2000);

    // Hentikan setelah 30 detik
    setTimeout(() => {
      clearInterval(checkInterval);
      console.log("Auto-detect Allow button timeout");
    }, 30000);
  };

  // Jalankan auto-detect saat halaman load
  document.addEventListener("DOMContentLoaded", () => {
    if (window.location.href.includes("accounts.google.com")) {
      setTimeout(() => {
        window.autoDetectAllowPopup();
      }, 1000);
    }
  });
})();

// Expose Electron API to the webview renderer process
contextBridge.exposeInMainWorld("electronWebview", {
  clickAllowButton: () => ipcRenderer.sendToHost("click-allow-button"),
  onAllowButtonClicked: (callback: () => void) => {
    ipcRenderer.on("allow-button-clicked", callback);
    return () => ipcRenderer.removeListener("allow-button-clicked", callback);
  },
  onAutoAllowClicked: (callback: () => void) => {
    ipcRenderer.on("auto-allow-clicked", callback);
    return () => ipcRenderer.removeListener("auto-allow-clicked", callback);
  },
  onAllowButtonNotFound: (callback: () => void) => {
    ipcRenderer.on("allow-button-not-found", callback);
    return () => ipcRenderer.removeListener("allow-button-not-found", callback);
  },
});
