// preload-webview.js

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

(function () {
  "use strict";
  console.log("Anti-detection script injected.");

  // 1. Hapus properti 'webdriver'
  Object.defineProperty(navigator, "webdriver", {
    get: () => undefined,
  });

  // 2. Hapus variabel spesifik ChromeDriver
  delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
  delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
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
        getHighEntropyValues: async (hints) => ({
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
  HTMLCanvasElement.prototype.toDataURL = function () {
    const ctx = this.getContext("2d");
    if (ctx) {
      // Tambahkan noise yang halus dan konsisten
      const imageData = ctx.getImageData(0, 0, this.width, this.height);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = imageData.data[i] + 1; // Ubah sedikit nilai piksel
      }
      ctx.putImageData(imageData, 0, 0);
    }
    return toDataURL.apply(this, arguments);
  };

  // 10. Palsukan `window.chrome`
  window.chrome = {
    runtime: {},
    csi: function () {},
    loadTimes: function () {},
    app: { isInstalled: false },
  };
})();
