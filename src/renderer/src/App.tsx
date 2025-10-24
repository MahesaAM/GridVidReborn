import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  HashRouter as Router,
  Routes,
  Route,
  Link,
  useNavigate,
} from "react-router-dom";
import {
  Home,
  Users,
  FileText,
  Play,
  ScrollText,
  Settings,
  Type,
  Image,
  RotateCcw,
} from "lucide-react";

import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import Prompts from "./pages/Prompts";
import Runner from "./pages/Runner";
import Logs from "./pages/Logs";
import SettingsPage from "./pages/Settings";

const navItems = [];

function App() {
  const [activeItem, setActiveItem] = useState("Dashboard");
  const [mode, setMode] = useState<"text-to-video" | "image-to-video">(
    "text-to-video"
  );
  const [currentView, setCurrentView] = useState<"main" | "settings">("main");
  const [currentUrl, setCurrentUrl] = useState(
    "https://aistudio.google.com/prompts/new_video?model=veo-2.0-generate-001"
  );
  const webviewRef = useRef<HTMLWebViewElement>(null);
  const [preloadPath, setPreloadPath] = useState("");

  // Video generation state
  const [prompts, setPrompts] = useState<string>("");
  const [savePath, setSavePath] = useState<string>("");
  const [aspectRatio, setAspectRatio] = useState<string>("16:9");
  const [duration, setDuration] = useState<string>("5");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setStats] = useState({ total: 0, success: 0, failed: 0 });

  // Refs
  const promptsTextareaRef = useRef<HTMLTextAreaElement>(null);
  const savePathInputRef = useRef<HTMLInputElement>(null);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.electron.getSettings();
        setSavePath(settings.downloadPath || "");
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    };
    loadSettings();
  }, []);

  // Get webview preload path on mount
  useEffect(() => {
    window.electron.getWebviewPreloadPath().then((path) => {
      setPreloadPath(`file://${path}`);
    });
  }, []);

  // Log listener
  useEffect(() => {
    const unsubscribe = window.electron.onTextToVideoLog((event, message) => {
      setLogs((prev) => [...prev, message]);
    });

    return unsubscribe;
  }, []);

  // Test webview navigation listener
  useEffect(() => {
    const handleTestNavigation = (
      event: any,
      data: { url: string; searchTerm: string }
    ) => {
      if (webviewRef.current) {
        webviewRef.current.src = data.url;
        // Wait for page to load, then perform search
        setTimeout(() => {
          if (webviewRef.current) {
            webviewRef.current.executeJavaScript(`
              // Wait for search box and type the search term
              setTimeout(() => {
                const searchBox = document.querySelector('textarea[name="q"]');
                if (searchBox) {
                  searchBox.value = "${data.searchTerm}";
                  searchBox.dispatchEvent(new Event('input', { bubbles: true }));
                  searchBox.dispatchEvent(new Event('change', { bubbles: true }));
                  // Submit search
                  const form = searchBox.closest('form');
                  if (form) form.submit();
                }
              }, 2000);
            `);
          }
        }, 3000);
      }
    };

    // Listen for test navigation messages from main process
    const handleTestMessage = (event: any) => {
      const data = (event as CustomEvent).detail;
      if (data && data.url && data.searchTerm) {
        // Update the URL state to trigger React re-render
        setCurrentUrl(data.url);

        // Wait for page to load, then perform search
        setTimeout(() => {
          if (webviewRef.current) {
            webviewRef.current.executeJavaScript(`
              // Wait for search box and type the search term
              setTimeout(() => {
                const searchBox = document.querySelector('textarea[name="q"]');
                if (searchBox) {
                  searchBox.value = "${data.searchTerm}";
                  searchBox.dispatchEvent(new Event('input', { bubbles: true }));
                  searchBox.dispatchEvent(new Event('change', { bubbles: true }));
                  // Submit search
                  const form = searchBox.closest('form');
                  if (form) form.submit();
                }
              }, 2000);
            `);
          }
        }, 3000);
      }
    };

    // Add event listener for test-webview-navigation
    window.addEventListener("test-webview-navigation", handleTestMessage);

    return () => {
      window.removeEventListener("test-webview-navigation", handleTestMessage);
    };
  }, []);

  // Webview popup handling
  useEffect(() => {
    if (webviewRef.current) {
      const webview = webviewRef.current;

      // Handle new window events (popups)
      const handleNewWindow = (event: any) => {
        // Allow popups to open - they will be handled by main process setWindowOpenHandler
        console.log("Popup requested:", event.url);
      };

      webview.addEventListener("new-window", handleNewWindow);

      return () => {
        webview.removeEventListener("new-window", handleNewWindow);
      };
    }
  }, [webviewRef]);

  const handleTestBrowser = async () => {
    try {
      const result = await window.electron.testBrowserControl();
      if (result.success) {
      } else {
        alert(`Webview control test failed: ${result.message}`);
      }
    } catch (error: any) {
      console.error("Test failed:", error);
      alert(`Test failed: ${error.message}`);
    }
  };

  const handleGenerate = async () => {
    if (isGenerating) return;

    const promptList =
      mode === "text-to-video"
        ? prompts.split("\n").filter((p) => p.trim())
        : [prompts]; // For image-to-video, use single prompt

    if (promptList.length === 0) {
      alert("Please enter at least one prompt");
      return;
    }

    if (!savePath) {
      alert("Please select a save path");
      return;
    }

    try {
      setIsGenerating(true);
      setLogs([]);
      setStats({ total: promptList.length, success: 0, failed: 0 });

      // Get all accounts
      const allAccounts = await window.electron.getAccounts();
      if (allAccounts.length === 0) {
        alert("No accounts available. Please add accounts in settings.");
        return;
      }

      let promptIndex = 0;
      let accountIndex = 0;
      const exhaustedAccounts = new Set();

      // Function to login with current account
      const loginWithAccount = async (account: any) => {
        const password = await window.electron.getAccountPassword(account.id);

        // Navigate to Google sign-in page using the working URL structure
        const signinUrl =
          "https://accounts.google.com/v3/signin/identifier?authuser=0" +
          "&continue=https%3A%2F%2Fmyaccount.google.com%2Fgeneral-light" +
          "&ec=GAlAwAE&hl=in&service=accountsettings" +
          "&flowName=GlifWebSignIn&flowEntry=AddSession";

        setCurrentUrl(signinUrl);

        // Wait for page to load, then fill email
        await new Promise((resolve) => setTimeout(resolve, 3000));

        if (webviewRef.current) {
          // Focus on email input first, then type email with subtle human-like behavior
          const emailScript = `
            (function() {
              const focusAndTypeEmail = (selector, text) => {
                return new Promise((resolve) => {
                  const check = () => {
                    const el = document.querySelector(selector);
                    if (el) {
                      // Simple focus and click
                      el.focus();
                      el.click();

                      // Brief pause before typing
                      setTimeout(() => {
                        // Clear existing value
                        el.value = '';
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));

                        // Type email character by character with natural timing
                        let i = 0;
                        const typeChar = () => {
                          if (i < text.length) {
                            el.value += text[i];
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            i++;

                            // Natural typing rhythm: slightly faster than before
                            let delay = 100 + Math.random() * 50; // 100-150ms
                            if (text[i-1] === '@' || text[i-1] === '.') {
                              delay = 200 + Math.random() * 100; // Slightly longer pause for special chars
                            }

                            setTimeout(typeChar, delay);
                          } else {
                            // Email typing complete
                            setTimeout(() => {
                              resolve();
                            }, 500 + Math.random() * 500);
                          }
                        };

                        setTimeout(typeChar, 150);
                      }, 200);
                    } else {
                      setTimeout(check, 200);
                    }
                  };
                  check();
                });
              };

              return focusAndTypeEmail('input[type="email"], #identifierId', '${account.email}').then(() => {
                return new Promise((resolve) => {
                  // Wait for Next button to appear and be clickable
                  setTimeout(() => {
                    // Try multiple selector strategies for the Next button
                    let clicked = false;

                    // Strategy 1: Primary selectors
                    const primarySelectors = ['#identifierNext', 'button[jsname="LgbsSe"]', '[data-primary-action-label="Next"]', '[data-primary-action-label="Selanjutnya"]'];
                    for (const selector of primarySelectors) {
                      const btn = document.querySelector(selector);
                      if (btn && btn instanceof HTMLElement && !btn.disabled) {
                        setTimeout(() => {
                          btn.click();
                          resolve('clicked primary: ' + selector);
                        }, 300 + Math.random() * 200);
                        clicked = true;
                        break;
                      }
                    }

                    if (!clicked) {
                      // Strategy 2: Find button by text content
                      const buttons = Array.from(document.querySelectorAll('button'));
                      for (const btn of buttons) {
                        const text = btn.textContent?.trim();
                        if (text === 'Next' || text === 'Selanjutnya' || text === 'Berikutnya') {
                          setTimeout(() => {
                            btn.click();
                            resolve('clicked by text: ' + text);
                          }, 300 + Math.random() * 200);
                          clicked = true;
                          break;
                        }
                      }
                    }

                    if (!clicked) {
                      // Strategy 3: Find span with text inside button
                      const spans = Array.from(document.querySelectorAll('button span'));
                      for (const span of spans) {
                        const text = span.textContent?.trim();
                        if (text === 'Next' || text === 'Selanjutnya' || text === 'Berikutnya') {
                          const button = span.closest('button');
                          if (button && !button.disabled) {
                            setTimeout(() => {
                              button.click();
                              resolve('clicked span in button: ' + text);
                            }, 300 + Math.random() * 200);
                            clicked = true;
                            break;
                          }
                        }
                      }
                    }

                    if (!clicked) {
                      // Strategy 4: Click any visible button that might be the next button
                      const allButtons = Array.from(document.querySelectorAll('button:not([disabled]):not([aria-hidden="true"])'));
                      for (const btn of allButtons) {
                        const rect = btn.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0 && rect.top > 0) {
                          // Check if button is likely the Next button by position and content
                          const text = btn.textContent?.toLowerCase() || '';
                          if (text.includes('next') || text.includes('lanjut') || text.includes('continue')) {
                            setTimeout(() => {
                              btn.click();
                              resolve('clicked likely next button: ' + text);
                            }, 300 + Math.random() * 200);
                            clicked = true;
                            break;
                          }
                        }
                      }
                    }

                    if (!clicked) {
                      resolve('no button found');
                    }
                  }, 2000 + Math.random() * 1000); // Consistent wait time
                });
              });
            })()
          `;
          await webviewRef.current.executeJavaScript(emailScript);

          // Wait for password page and fill password
          await new Promise((resolve) => setTimeout(resolve, 5000));

          const passwordScript = `
            (function() {
              const clearAndType = (selector, text) => {
                return new Promise((resolve) => {
                  const check = () => {
                    const el = document.querySelector(selector);
                    if (el) {
                      el.click();
                      el.value = '';
                      el.dispatchEvent(new Event('input', { bubbles: true }));
                      el.dispatchEvent(new Event('change', { bubbles: true }));

                      let i = 0;
                      const typeChar = () => {
                        if (i < text.length) {
                          el.value += text[i];
                          el.dispatchEvent(new Event('input', { bubbles: true }));
                          el.dispatchEvent(new Event('change', { bubbles: true }));
                          i++;

                          // Natural typing rhythm for password
                          let delay = 120 + Math.random() * 80; // 120-200ms (slightly slower for password)
                          setTimeout(typeChar, delay);
                        } else {
                          resolve();
                        }
                      };
                      setTimeout(typeChar, 200);
                    } else {
                      setTimeout(check, 500);
                    }
                  };
                  check();
                });
              };

              return clearAndType('input[type="password"], input[name="Passwd"]', '${password}').then(() => {
                return new Promise((resolve) => {
                  setTimeout(() => {
                    // Try multiple selector strategies for the Next button
                    let clicked = false;

                    // Strategy 1: Primary selectors
                    const primarySelectors = ['#passwordNext', 'button[jsname="LgbsSe"]', '[data-primary-action-label="Next"]', '[data-primary-action-label="Selanjutnya"]'];
                    for (const selector of primarySelectors) {
                      const btn = document.querySelector(selector);
                      if (btn && btn instanceof HTMLElement) {
                        setTimeout(() => {
                          btn.click();
                          resolve('clicked primary: ' + selector);
                        }, 300 + Math.random() * 200);
                        clicked = true;
                        break;
                      }
                    }

                    if (!clicked) {
                      // Strategy 2: Find button by text content
                      const buttons = Array.from(document.querySelectorAll('button'));
                      for (const btn of buttons) {
                        const text = btn.textContent?.trim();
                        if (text === 'Next' || text === 'Selanjutnya' || text === 'Berikutnya') {
                          setTimeout(() => {
                            btn.click();
                            resolve('clicked by text: ' + text);
                          }, 300 + Math.random() * 200);
                          clicked = true;
                          break;
                        }
                      }
                    }

                    if (!clicked) {
                      // Strategy 3: Find span with text inside button
                      const spans = Array.from(document.querySelectorAll('button span'));
                      for (const span of spans) {
                        const text = span.textContent?.trim();
                        if (text === 'Next' || text === 'Selanjutnya' || text === 'Berikutnya') {
                          const button = span.closest('button');
                          if (button) {
                            setTimeout(() => {
                              button.click();
                              resolve('clicked span in button: ' + text);
                            }, 300 + Math.random() * 200);
                            clicked = true;
                            break;
                          }
                        }
                      }
                    }

                    if (!clicked) {
                      // Strategy 4: Click any visible button that might be the next button
                      const allButtons = Array.from(document.querySelectorAll('button:not([disabled]):not([aria-hidden="true"])'));
                      for (const btn of allButtons) {
                        const rect = btn.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0 && rect.top > 0) {
                          // Check if button is likely the Next button by position and content
                          const text = btn.textContent?.toLowerCase() || '';
                          if (text.includes('next') || text.includes('lanjut') || text.includes('continue')) {
                            setTimeout(() => {
                              btn.click();
                              resolve('clicked likely next button: ' + text);
                            }, 300 + Math.random() * 200);
                            clicked = true;
                            break;
                          }
                        }
                      }
                    }

                    if (!clicked) {
                      resolve('no button found');
                    }
                  }, 2000 + Math.random() * 1000); // Consistent wait time
                });
              });
            })()
          `;
          await webviewRef.current.executeJavaScript(passwordScript);

          // Wait for login to complete
          await new Promise((resolve) => setTimeout(resolve, 15000));

          // Check current URL and handle various scenarios
          const currentUrl = await webviewRef.current.executeJavaScript(
            `window.location.href`
          );

          // Handle device verification
          if (
            currentUrl.includes("/signin/challenge") ||
            (await webviewRef.current.executeJavaScript(
              `!!document.querySelector('div[data-challenge="phone"]')`
            ))
          ) {
            setLogs((prev) => [
              ...prev,
              `Device verification required for ${account.email}. Please complete manually.`,
            ]);
            // Wait for manual verification (up to 2 minutes)
            await new Promise((resolve) => setTimeout(resolve, 120000));
          }

          // Handle speedbump
          if (currentUrl.includes("/speedbump/")) {
            await webviewRef.current.executeJavaScript(`
              const confirmBtn = document.querySelector('input#confirm, input[jsname="M2UYVd"]');
              if (confirmBtn) {
                confirmBtn.click();
              }
            `);
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }

          // Navigate to AI Studio video generation page with better URL
          setCurrentUrl(
            "https://aistudio.google.com/u/0/generate-video?pli=1&authuser=0"
          );
          await new Promise((resolve) => setTimeout(resolve, 5000));

          // Handle splash dialog
          await webviewRef.current.executeJavaScript(`
            const splashDialog = document.querySelector('mat-dialog-container');
            if (splashDialog) {
              const buttons = Array.from(document.querySelectorAll('button'));
              const tryBtn = buttons.find(btn => btn.textContent.includes('Try Gemini') || btn.textContent.includes('Use Google AI Studio'));
              if (tryBtn) {
                tryBtn.click();
              }
            }
          `);

          // Handle Terms of Service
          await new Promise((resolve) => setTimeout(resolve, 3000));
          await webviewRef.current.executeJavaScript(`
            const tosCheckbox1 = document.querySelector('#mat-mdc-checkbox-0-input');
            const tosCheckbox2 = document.querySelector('#mat-mdc-checkbox-1-input');
            const acceptBtn = document.querySelector('button[aria-label="Accept terms of service"]');

            if (tosCheckbox1) {
              tosCheckbox1.click();
              if (tosCheckbox2) tosCheckbox2.click();
              if (acceptBtn) {
                setTimeout(() => acceptBtn.click(), 1000);
              }
            }
          `);

          // Wait for TOS acceptance
          await new Promise((resolve) => setTimeout(resolve, 10000));

          // Navigate to the specific video generation page
          setCurrentUrl(
            "https://aistudio.google.com/prompts/new_video?model=veo-2.0-generate-001"
          );
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      };

      // Function to generate video with current prompt
      const generateVideo = async (prompt: string) => {
        if (!webviewRef.current) return false;

        try {
          // Navigate to new video page if not already there
          const currentUrl = await webviewRef.current.executeJavaScript(
            `window.location.href`
          );
          if (!currentUrl.includes("new_video")) {
            setCurrentUrl(
              "https://aistudio.google.com/prompts/new_video?model=veo-2.0-generate-001"
            );
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }

          // Set prompt
          await webviewRef.current.executeJavaScript(`
            const textarea = document.querySelector('textarea[placeholder="Describe your video"]');
            if (textarea) {
              textarea.value = "${prompt.replace(/"/g, '\\"')}";
              textarea.dispatchEvent(new Event('input', { bubbles: true }));
              textarea.dispatchEvent(new Event('change', { bubbles: true }));
            }
          `);

          // Set aspect ratio
          await webviewRef.current.executeJavaScript(`
            const aspectButtons = document.querySelectorAll('ms-aspect-ratio-radio-button button');
            aspectButtons.forEach(btn => {
              const text = btn.querySelector('.aspect-ratio-text')?.textContent;
              if (text && text.trim() === '${aspectRatio}') {
                btn.click();
              }
            });
          `);

          // Set duration
          await webviewRef.current.executeJavaScript(`
            const durationSelect = document.querySelector('mat-select[id="duration-selector"]');
            if (durationSelect) {
              durationSelect.click();
              setTimeout(() => {
                const options = document.querySelectorAll('mat-option');
                options.forEach(option => {
                  if (option.textContent && option.textContent.includes('${duration}s')) {
                    option.click();
                  }
                });
              }, 1000);
            }
          `);

          // Click generate button
          await webviewRef.current.executeJavaScript(`
            const runBtn = document.querySelector('run-button button:not([disabled])');
            if (runBtn) {
              runBtn.click();
            }
          `);

          // Wait for generation to complete or fail
          let attempts = 0;
          while (attempts < 120) {
            // 10 minutes max
            await new Promise((resolve) => setTimeout(resolve, 5000));
            attempts++;

            const pageContent = await webviewRef.current.executeJavaScript(
              `document.body.innerText`
            );

            if (
              pageContent.includes("Failed to generate video, quota exceeded")
            ) {
              setLogs((prev) => [
                ...prev,
                `Account ${allAccounts[accountIndex].email} quota exceeded`,
              ]);
              return "quota_exceeded";
            }

            if (pageContent.includes("Failed to generate video.")) {
              setLogs((prev) => [
                ...prev,
                `Video generation failed for prompt: ${prompt}`,
              ]);
              return "failed";
            }

            if (document.querySelectorAll("video").length > 0) {
              // Video generated successfully
              const videoUrl = await webviewRef.current.executeJavaScript(`
                const videos = document.querySelectorAll("video");
                return videos[videos.length - 1]?.src;
              `);

              // Download video (simplified - in real implementation would handle blob URLs)
              setLogs((prev) => [
                ...prev,
                `Video generated successfully: ${videoUrl}`,
              ]);
              setStats((prev) => ({ ...prev, success: prev.success + 1 }));
              return "success";
            }
          }

          return "timeout";
        } catch (error) {
          console.error("Generation error:", error);
          return "error";
        }
      };

      // Main generation loop
      while (
        promptIndex < promptList.length &&
        accountIndex < allAccounts.length
      ) {
        const currentAccount = allAccounts[accountIndex];

        if (exhaustedAccounts.has(accountIndex)) {
          accountIndex++;
          continue;
        }

        setLogs((prev) => [...prev, `Using account: ${currentAccount.email}`]);

        // Login with current account
        await loginWithAccount(currentAccount);

        // Try to generate videos with this account
        let accountQuotaExceeded = false;

        while (promptIndex < promptList.length && !accountQuotaExceeded) {
          const result = await generateVideo(promptList[promptIndex]);

          if (result === "success") {
            promptIndex++;
          } else if (result === "quota_exceeded") {
            exhaustedAccounts.add(accountIndex);
            accountQuotaExceeded = true;
            setLogs((prev) => [
              ...prev,
              `Switching to next account due to quota exhaustion`,
            ]);
          } else {
            // Failed or timeout - mark as failed and continue
            setStats((prev) => ({ ...prev, failed: prev.failed + 1 }));
            promptIndex++;
          }
        }

        if (!accountQuotaExceeded) {
          accountIndex++;
        }
      }

      if (promptIndex < promptList.length) {
        setLogs((prev) => [
          ...prev,
          `Generation completed. ${promptIndex}/${promptList.length} prompts processed.`,
        ]);
      } else {
        setLogs((prev) => [
          ...prev,
          `All ${promptList.length} prompts generated successfully!`,
        ]);
      }
    } catch (error: any) {
      console.error("Failed to start video generation:", error);
      alert(`Failed to start video generation: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStopGenerate = async () => {
    try {
      await window.electron.stopVideoGeneration();
      setIsGenerating(false);
    } catch (error: any) {
      console.error("Failed to stop video generation:", error);
    }
  };

  const handleLoadFromTxt = () => {
    // TODO: Implement file picker for .txt files
    alert("Load from .txt file functionality not implemented yet");
  };

  const handleSelectImages = async () => {
    try {
      const result = await window.electron.selectImages();
      if (!result.canceled && result.filePaths.length > 0) {
        // TODO: Handle selected images
        alert(`Selected ${result.filePaths.length} images`);
      }
    } catch (error: any) {
      console.error("Failed to select images:", error);
    }
  };

  const handleBrowseSavePath = async () => {
    // TODO: Implement directory picker
    alert("Browse save path functionality not implemented yet");
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentUrl(e.target.value);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (webviewRef.current) {
      webviewRef.current.src = currentUrl;
    }
  };

  const handleReload = () => {
    if (webviewRef.current) {
      webviewRef.current.reload();
    }
  };

  return (
    <Router>
      <div className="flex h-screen bg-gradient-to-br from-[#1B1B2F] via-[#162447] to-[#1F4068] text-white">
        {/* Sidebar */}
        <motion.div
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="w-80 p-6 flex flex-col border-r border-white/10 overflow-y-auto"
        >
          <div className="flex items-center mb-10">
            {/* <img src="/vite.svg" alt="Logo" className="h-8 w-8 mr-3" /> */}
            <h1 className="text-2xl font-bold text-white">GridVid</h1>
          </div>

          {/* Mode Toggle */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-white/70 mb-3">Mode</h3>
            <div className="flex space-x-2">
              <button
                onClick={() => setMode("text-to-video")}
                className={`flex items-center px-4 py-2 rounded-lg transition-all duration-200 ${
                  mode === "text-to-video"
                    ? "bg-purple-600 text-white"
                    : "bg-white/10 text-white/70 hover:bg-white/20"
                }`}
              >
                <Type className="w-4 h-4 mr-2" />
                Text to Video
              </button>
              <button
                onClick={() => setMode("image-to-video")}
                className={`flex items-center px-4 py-2 rounded-lg transition-all duration-200 ${
                  mode === "image-to-video"
                    ? "bg-purple-600 text-white"
                    : "bg-white/10 text-white/70 hover:bg-white/20"
                }`}
              >
                <Image className="w-4 h-4 mr-2" />
                Image to Video
              </button>
            </div>
          </div>

          {/* Mode-specific Controls */}
          <div className="mb-6">
            {mode === "text-to-video" ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    Prompts Input
                  </label>
                  <textarea
                    ref={promptsTextareaRef}
                    value={prompts}
                    onChange={(e) => setPrompts(e.target.value)}
                    placeholder="Enter prompts (one per line)"
                    className="w-full h-32 p-3 bg-white/5 rounded-lg border border-white/10 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  />
                  <button
                    onClick={handleLoadFromTxt}
                    className="mt-2 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors duration-200"
                  >
                    Load from .txt File
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    Images
                  </label>
                  <button
                    onClick={handleSelectImages}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors duration-200"
                  >
                    Select Images
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    General Prompt
                  </label>
                  <textarea
                    value={prompts}
                    onChange={(e) => setPrompts(e.target.value)}
                    placeholder="Enter general prompt for all images"
                    className="w-full h-20 p-3 bg-white/5 rounded-lg border border-white/10 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Common Controls */}
          <div className="mb-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Save Path
              </label>
              <input
                ref={savePathInputRef}
                type="text"
                value={savePath}
                onChange={(e) => setSavePath(e.target.value)}
                placeholder="Select save directory"
                className="w-full p-3 bg-white/5 rounded-lg border border-white/10 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                onClick={handleBrowseSavePath}
                className="mt-2 w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold transition-colors duration-200"
              >
                Browse
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Aspect Ratio
              </label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="w-full p-3 bg-white/5 rounded-lg border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Duration
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full p-3 bg-white/5 rounded-lg border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="5">5 seconds</option>
                <option value="6">6 seconds</option>
                <option value="7">7 seconds</option>
                <option value="8">8 seconds</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mb-6 space-y-2">
            <button
              onClick={handleTestBrowser}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors duration-200"
            >
              Test Browser Control
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className={`w-full px-4 py-3 rounded-lg font-semibold transition-colors duration-200 ${
                isGenerating
                  ? "bg-gray-600 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {isGenerating ? "Generating..." : "Generate"}
            </button>
            <button
              onClick={handleStopGenerate}
              disabled={!isGenerating}
              className={`w-full px-4 py-3 rounded-lg font-semibold transition-colors duration-200 ${
                !isGenerating
                  ? "bg-gray-600 cursor-not-allowed"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              Stop Generate
            </button>
          </div>

          <nav className="flex-grow">
            {/* Navigation removed as requested */}
          </nav>
        </motion.div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {currentView === "main" ? (
            <>
              {/* Stats Bar */}
              <div className="p-4 bg-white/5 border-b border-white/10">
                <div className="flex justify-between items-center">
                  <div className="flex space-x-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-400">
                        {stats.total}
                      </div>
                      <div className="text-sm text-white/70">
                        Total Prompts/Images
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-400">
                        {stats.success}
                      </div>
                      <div className="text-sm text-white/70">Success</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-400">
                        {stats.failed}
                      </div>
                      <div className="text-sm text-white/70">Failed</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setCurrentView("settings")}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Settings
                  </button>
                </div>
              </div>

              {/* Browser View and Logs */}
              <div className="flex-1 flex flex-col p-4 relative">
                {/* Browser View */}
                <div className="flex-1 mb-4">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="w-full h-full bg-white rounded-lg border border-white/20 overflow-auto flex flex-col"
                  >
                    {/* URL Bar */}
                    <div className="flex items-center p-3 bg-gray-100 border-b border-gray-300 flex-shrink-0">
                      <form
                        onSubmit={handleUrlSubmit}
                        className="flex-1 flex items-center space-x-2"
                      >
                        <input
                          type="text"
                          value={currentUrl}
                          onChange={handleUrlChange}
                          placeholder="Enter URL"
                          className="flex-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                        />
                        <button
                          type="submit"
                          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                        >
                          Go
                        </button>
                      </form>
                      <button
                        onClick={handleReload}
                        className="ml-2 p-2 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
                        title="Reload"
                      >
                        <RotateCcw className="w-4 h-4 text-gray-700" />
                      </button>
                    </div>
                    <webview
                      ref={webviewRef}
                      src={currentUrl}
                      className="w-full flex-1 border-0"
                      partition="persist:main"
                      preload={preloadPath}
                      allowpopups="true"
                      webpreferences="contextIsolation=no,nodeIntegration=no"
                    />
                  </motion.div>
                </div>

                {/* Logs */}
                <div className="h-48 bg-black rounded-lg border border-white/20 overflow-hidden">
                  <div className="p-3 border-b border-white/10">
                    <h3 className="text-sm font-semibold text-white">Logs</h3>
                  </div>
                  <div className="p-3 h-32 overflow-y-auto text-xs text-white/70 font-mono">
                    {logs.length === 0 ? (
                      <div className="text-white/50">No logs yet...</div>
                    ) : (
                      logs.map((log, index) => (
                        <div key={index} className="mb-1">
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Settings View */
            <div className="flex-1 p-8 overflow-auto relative">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <SettingsPage />
              </motion.div>

              {/* Back Button */}
              <button
                onClick={() => setCurrentView("main")}
                className="absolute top-6 left-6 p-3 bg-white/10 hover:bg-white/20 rounded-lg border border-white/20 transition-colors duration-200"
                title="Back to Main"
              >
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>
    </Router>
  );
}

export default App;
