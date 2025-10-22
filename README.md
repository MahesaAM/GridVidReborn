# GridAutomation Studio

## Electron Multi-Account AI Studio Automation System (Text-to-Video & Image-to-Video)

GridAutomation Studio is a cross-platform ElectronJS application designed to automate batch generation tasks on Google AI Studio using multiple accounts. It features an internal browser controlled by Puppeteer-core, allowing for efficient text-to-video and image-to-video generation.

## ✨ Features

- **Multi-Account Automation**: Manage and utilize multiple Google AI Studio accounts for batch processing.
- **Text-to-Video Generation**: Automate video creation from a list of text prompts.
- **Image-to-Video Generation**: Automate video creation from a selection of images.
- **Internal Browser Control**: Leverages Puppeteer-core to control an internal Chromium instance for each account profile.
- **Data Input**: Import accounts from Excel (.xlsx) files. Input prompts via CSV or directly in the UI, and select images via a file picker.
- **Batch Management**: Configure quota per account, delay between accounts, and maximum concurrency. Start, pause, resume, and stop batch operations.
- **Real-time Logging**: View live progress and detailed logs within the application, with an option to export logs to CSV.
- **Manual Intervention**: Pause accounts and open a dedicated browser window for manual CAPTCHA or 2FA resolution.
- **Modern UI**: Built with React, TailwindCSS, and Framer Motion, featuring a Neo Web3 / Modern AI Dashboard dark theme with smooth animations and glassmorphism effects.
- **Secure Credential Storage**: Passwords are encrypted using `keytar`.
- **Cross-Platform Builds**: Ready for macOS and Windows builds using `electron-builder`.

## ⚙️ Technologies Used

- **Electron v30+**: For building cross-platform desktop applications.
- **React + Vite**: For a fast and modern frontend development experience.
- **TailwindCSS + Framer Motion**: For a sleek, animated, and responsive user interface.
- **Puppeteer-core**: To control the internal Chromium browser for automation tasks.
- **xlsx**: For parsing Excel (.xlsx) files to import account data.
- **better-sqlite3**: For local storage of accounts, progress, and logs.
- **keytar**: For secure encryption and storage of user passwords.
- **electron-builder**: For packaging and building the application for different operating systems.
- **TypeScript**: For type-safe and robust code.
- **get-port**: To allocate unique ports for each browser profile.
- **node-notifier**: For desktop notifications.
- **uuid**: For generating unique IDs for accounts and jobs.

## 📂 Folder Structure

```
GridAutomationStudio/
├── main/
│   ├── main.ts             # Main Electron process setup and IPC handlers
│   ├── puppeteer-manager.ts  # Manages Puppeteer browser instances
│   ├── profile-manager.ts    # Handles account data, SQLite, and Keytar
│   ├── excel-loader.ts       # Parses Excel files for account import
│   ├── task-runner.ts        # Manages automation tasks and batch processing
│   └── preload.ts            # Exposes Electron APIs to the renderer
├── renderer/
│   ├── App.tsx             # Main React component and routing
│   ├── components/         # Reusable UI components
│   ├── pages/              # Individual page components (Dashboard, Accounts, etc.)
│   │   ├── Dashboard.tsx
│   │   ├── Accounts.tsx
│   │   ├── Prompts.tsx
│   │   ├── Runner.tsx
│   │   ├── Logs.tsx
│   │   └── Settings.tsx
│   └── styles/             # TailwindCSS base styles
├── assets/                 # Application icons and other static assets
├── profiles/               # Directory for Puppeteer user data profiles (created at runtime)
├── downloads/              # Default directory for generated video downloads (created at runtime)
├── package.json            # Project dependencies and build configurations
├── electron.vite.config.ts # Electron-Vite specific configuration
├── tailwind.config.js      # TailwindCSS configuration
├── postcss.config.js       # PostCSS configuration
├── tsconfig.json           # TypeScript configuration for renderer
├── tsconfig.node.json      # TypeScript configuration for main/preload
└── vite.config.ts          # Vite configuration for renderer
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- Google Chrome installed on your system (Puppeteer-core will use it)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/GridAutomationStudio.git
    cd GridAutomationStudio
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```
    _Note: During installation, `electron-builder install-app-deps` will rebuild native modules like `better-sqlite3` and `keytar` for your Electron version._

### Development

To run the application in development mode:

```bash
npm run start
# or
yarn start
```

This will open the Electron application and the developer tools.

### Building for Production

To build the application for macOS and Windows:

```bash
npm run build
npm run dist
# or
yarn build
yarn dist
```

The compiled applications will be found in the `release/` directory.

## 🖼️ Demo Screenshots

_(To be added after the application is runnable)_

## ⚠️ Security Notes

- **CAPTCHA / 2FA**: The application is designed to _not_ bypass CAPTCHA or 2FA. Manual intervention is required for these cases.
- **Password Encryption**: Passwords are encrypted using `keytar` and stored securely in your operating system's credential manager.
- **Account Export/Import**: Future versions may include encrypted export/import of account data using AES-256.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## 📄 License

This project is licensed under the MIT License.
