import { IpcRenderer } from "electron";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src: string;
        partition?: string;
        webpreferences?: string;
        allowpopups?: string;
        nodeintegration?: boolean;
        websecurity?: boolean;
        plugins?: boolean;
        preload?: string;
        onDomReady?: () => void;
      };
    }
  }

  interface HTMLWebViewElement extends HTMLElement {
    src: string;
    reload(): void;
    loadURL(url: string): void;
    getURL(): string;
    goBack(): void;
    goForward(): void;
    canGoBack(): boolean;
    canGoForward(): boolean;
    executeJavaScript(code: string): Promise<any>;
    onDomReady?: () => void;
    addEventListener(
      type: "ipc-message" | "dom-ready",
      listener: (event: any) => void
    ): void;
    removeEventListener(
      type: "ipc-message" | "dom-ready",
      listener: (event: any) => void
    ): void;
  }

  interface Window {
    chrome: {
      runtime: {};
      csi: () => void;
      loadTimes: () => void;
      app: { isInstalled: boolean };
    };
    clickAllowButton: () => Promise<boolean>;
    autoDetectAllowPopup: () => void;
    electron: {
      sendMessage: (message: string) => void;
      onUpdateAccounts: (
        callback: (
          event: import("electron").IpcRendererEvent,
          accounts: any[]
        ) => void
      ) => () => void;
      onUpdateTasks: (
        callback: (
          event: import("electron").IpcRendererEvent,
          tasks: any[]
        ) => void
      ) => () => void;
      onLogMessage: (
        callback: (
          event: import("electron").IpcRendererEvent,
          log: string
        ) => void
      ) => () => void;
      onNotification: (
        callback: (
          event: import("electron").IpcRendererEvent,
          options: any
        ) => void
      ) => () => void;

      selectExcelFile: () => Promise<{
        canceled: boolean;
        filePaths: string[];
      }>;
      importAccounts: (filePath: string) => Promise<any[]>;
      getAccounts: () => Promise<any[]>;
      getFirstAccount: () => Promise<{ email: string; password: string }>;
      getAccountPassword: (id: string) => Promise<string>;
      addAccount: (email: string, password: string) => Promise<void>;
      deleteAccount: (id: string) => Promise<void>;
      openProfileWindow: (email: string) => Promise<void>;

      startBatch: (tasks: any[], accountIds: string[]) => Promise<void>;
      pauseBatch: () => Promise<void>;
      resumeBatch: () => Promise<void>;
      stopBatch: () => Promise<void>;
      setMaxConcurrency: (concurrency: number) => Promise<void>;
      setDownloadPath: (path: string) => Promise<void>;

      selectImages: () => Promise<{ canceled: boolean; filePaths: string[] }>;
      getPrompts: () => Promise<string[]>;
      savePrompts: (prompts: string[]) => Promise<void>;

      getSettings: () => Promise<any>;
      saveSettings: (settings: any) => Promise<void>;

      startVideoGeneration: (options: {
        prompts: string[];
        savePath: string;
        aspectRatio: string;
        duration: string;
        accountIds: string[];
      }) => Promise<void>;
      stopVideoGeneration: () => Promise<void>;
      onTextToVideoLog: (
        callback: (
          event: import("electron").IpcRendererEvent,
          message: string
        ) => void
      ) => () => void;
      testBrowserControl: () => Promise<{ success: boolean; message: string }>;
      getWebviewPreloadPath: () => Promise<string>;
      createPopupWindow: (options: {
        url: string;
        width?: number;
        height?: number;
        title?: string;
      }) => Promise<{ success: boolean; windowId?: number; error?: string }>;
      getPopupPreloadPath: () => Promise<string>;
      onPopupActionSuccess: (callback: () => void) => () => void;
      onPopupActionFailed: (callback: () => void) => () => void;
      clickAllowButton: (email: string) => Promise<any>;
    };
  }
}
