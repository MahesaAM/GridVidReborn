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
        allowpopups?: boolean;
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
    addEventListener(type: "ipc-message", listener: (event: any) => void): void;
    removeEventListener(
      type: "ipc-message",
      listener: (event: any) => void
    ): void;
  }

  interface Window {
    electron: {
      sendMessage: (message: string) => void;
      onUpdateAccounts: (callback: (accounts: any[]) => void) => () => void;
      onUpdateTasks: (callback: (tasks: any[]) => void) => () => void;
      onLogMessage: (callback: (log: string) => void) => () => void;
      onNotification: (callback: (options: any) => void) => () => void;

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
        callback: (event: any, message: string) => void
      ) => () => void;
      testBrowserControl: () => Promise<{ success: boolean; message: string }>;
      getWebviewPreloadPath: () => Promise<string>;
    };
  }
}
