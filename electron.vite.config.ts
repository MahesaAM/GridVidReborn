import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      "process.env.VITE_DEV_SERVER_URL": JSON.stringify(
        process.env.VITE_DEV_SERVER_URL
      ),
    },
    build: {
      outDir: "dist-electron/main",
      lib: {
        entry: resolve(__dirname, "main/main.ts"),
        formats: ["es"],
      },
      rollupOptions: {
        output: {
          entryFileNames: "index.js",
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist-electron/preload",
      rollupOptions: {
        input: {
          preload: resolve(__dirname, "preload/preload.ts"),
          "preload-webview": resolve(__dirname, "preload-webview.js"),
        },
        output: {
          dir: "dist-electron/preload",
          format: "cjs",
          entryFileNames: "[name].js",
        },
      },
    },
  },

  renderer: {
    root: ".", // Set the root to the project root where index.html is located
    plugins: [react()],
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "src/renderer/src"),
      },
    },
    build: {
      outDir: "dist",
      rollupOptions: {
        input: {
          index: resolve(__dirname, "index.html"),
        },
      },
    },
  },
});
