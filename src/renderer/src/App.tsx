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
            <img src="/vite.svg" alt="Logo" className="h-8 w-8 mr-3" />
            <h1 className="text-2xl font-bold text-white">GridAutomation</h1>
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
                    className="w-full h-full bg-white rounded-lg border border-white/20 overflow-hidden"
                  >
                    {/* URL Bar */}
                    <div className="flex items-center p-3 bg-gray-100 border-b border-gray-300">
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
                      className="w-full h-full border-0"
                      partition="persist:main"
                      webpreferences="webSecurity=no,nodeIntegration=no,contextIsolation=yes,allowRunningInsecureContent=yes,enableRemoteModule=no,experimentalFeatures=no,userAgent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36,disableHtmlFullscreenWindowResize=true,plugins=true,javascript=true,images=true,css=true,java=true,webgl=true,webaudio=true,autoplay=true"
                      allowpopups
                      onDomReady={() => {
                        // Enhanced anti-detection measures
                        webviewRef.current?.executeJavaScript(`
                          (function() {
                            // Remove webdriver property
                            Object.defineProperty(navigator, 'webdriver', {
                              get: () => undefined,
                            });

                            // Mock realistic browser properties
                            Object.defineProperty(navigator, 'languages', {
                              get: () => ['en-US', 'en', 'id', 'fr', 'de'].sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 3) + 1),
                            });

                            Object.defineProperty(navigator, 'platform', {
                              get: () => 'MacIntel', // Keep consistent with userAgent
                            });

                            Object.defineProperty(navigator, 'hardwareConcurrency', {
                              get: () => Math.floor(Math.random() * (16 - 4 + 1)) + 4, // Random between 4 and 16
                            });

                            Object.defineProperty(navigator, 'deviceMemory', {
                              get: () => [4, 8, 16][Math.floor(Math.random() * 3)], // Random 4, 8, or 16 GB
                            });

                            // Mock plugins
                            const mockPlugins = [
                              { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
                              { name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                              { name: 'Native Client', description: '', filename: 'internal-nacl-plugin' }
                            ];

                            Object.defineProperty(navigator, 'plugins', {
                              get: () => mockPlugins,
                            });

                            // Mock permissions
                            const originalQuery = window.navigator.permissions.query;
                            window.navigator.permissions.query = (parameters) => (
                              parameters.name === 'notifications' ?
                                Promise.resolve({ state: 'granted' }) :
                                parameters.name === 'geolocation' ?
                                  Promise.resolve({ state: 'prompt' }) :
                                  originalQuery(parameters)
                            );

                            // Mock chrome runtime and other chrome APIs
                            window.chrome = {
                              runtime: {
                                onConnect: undefined,
                                onMessage: undefined,
                                connect: function() { return {}; },
                                sendMessage: function() {}
                              },
                              csi: function() { return {}; },
                              loadTimes: function() {
                                return {
                                  requestTime: Date.now() / 1000,
                                  startLoadTime: Date.now() / 1000,
                                  commitLoadTime: Date.now() / 1000,
                                  finishDocumentLoadTime: Date.now() / 1000,
                                  finishLoadTime: Date.now() / 1000,
                                  firstPaintTime: Date.now() / 1000,
                                  firstPaintAfterLoadTime: 0,
                                  navigationType: 'Other'
                                };
                              },
                              app: {
                                isInstalled: false
                              }
                            };

                            // Mock webkit properties
                            window.webkit = {
                              messageHandlers: {},
                              IndexedDB: window.indexedDB,
                              IDBFactory: window.IDBFactory,
                              IDBKeyRange: window.IDBKeyRange,
                              IDBOpenDBRequest: window.IDBOpenDBRequest,
                              IDBTransaction: window.IDBTransaction,
                              IDBVersionChangeEvent: window.IDBVersionChangeEvent
                            };

                            // Mock chrome runtime ID
                            if (window.chrome && window.chrome.runtime) {
                              Object.defineProperty(window.chrome.runtime, 'id', {
                                get: () => 'abcdefghijklmnopqrstuvwxyzabcdef', // A typical extension ID format
                              });
                            }

                            // Mock navigator.vendor
                            Object.defineProperty(navigator, 'vendor', {
                              get: () => 'Google Inc.',
                            });

                            // Mock navigator.maxTouchPoints
                            Object.defineProperty(navigator, 'maxTouchPoints', {
                              get: () => 0, // For desktop browsers
                            });

                            // Mock navigator.doNotTrack
                            Object.defineProperty(navigator, 'doNotTrack', {
                              get: () => null, // Or '1' for enabled, '0' for disabled
                            });

                            // Mock navigator.userAgentData (newer API)
                            Object.defineProperty(navigator, 'userAgentData', {
                              get: () => ({
                                brands: [
                                  { brand: 'Chromium', version: '120' },
                                  { brand: 'Google Chrome', version: '120' },
                                  { brand: 'Not-A.Brand', version: '24' }
                                ],
                                mobile: false,
                                platform: 'macOS',
                                getHighEntropyValues: async (hints) => {
                                  const values: { [key: string]: any } = {
                                    architecture: 'arm',
                                    bitness: '64',
                                    model: '',
                                    platformVersion: '14.2.1', // Example macOS version
                                    uaFullVersion: '120.0.0.0',
                                    fullVersionList: [
                                      { brand: 'Chromium', version: '120.0.0.0' },
                                      { brand: 'Google Chrome', version: '120.0.0.0' },
                                      { brand: 'Not-A.Brand', version: '24.0.0.0' }
                                    ],
                                    wow64: false,
                                  };
                                  if (hints.includes('fullVersionList')) {
                                    values.fullVersionList = [
                                      { brand: 'Chromium', version: '120.0.6167.85' },
                                      { brand: 'Google Chrome', version: '120.0.6167.85' },
                                      { brand: 'Not-A.Brand', version: '24.0.0.0' }
                                    ];
                                  }
                                  return values;
                                },
                                toJSON: () => ({
                                  brands: [
                                    { brand: 'Chromium', version: '120' },
                                    { brand: 'Google Chrome', version: '120' },
                                    { brand: 'Not-A.Brand', version: '24' }
                                  ],
                                  mobile: false,
                                  platform: 'macOS',
                                }),
                              }),
                            });

                            // Remove automation indicators
                            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
                            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
                            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
                            delete window.cdc_adoQpoasnfa76pfcZLmcfl_JSON;
                            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Object;
                            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Proxy;

                            // Mock screen properties
                            const screenWidth = Math.floor(Math.random() * (1920 - 1280 + 1)) + 1280; // e.g., 1280-1920
                            const screenHeight = Math.floor(Math.random() * (1080 - 720 + 1)) + 720;   // e.g., 720-1080
                            const availWidth = screenWidth - Math.floor(Math.random() * 100);
                            const availHeight = screenHeight - Math.floor(Math.random() * 100);

                            Object.defineProperty(screen, 'availTop', { get: () => 0 });
                            Object.defineProperty(screen, 'availLeft', { get: () => 0 });
                            Object.defineProperty(screen, 'availHeight', { get: () => availHeight });
                            Object.defineProperty(screen, 'availWidth', { get: () => availWidth });
                            Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
                            Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
                            Object.defineProperty(screen, 'height', { get: () => screenHeight });
                            Object.defineProperty(screen, 'width', { get: () => screenWidth });

                            // Mock window dimensions to match screen
                            Object.defineProperty(window, 'outerWidth', { get: () => screenWidth });
                            Object.defineProperty(window, 'outerHeight', { get: () => screenHeight });

                            // Mock battery API
                            navigator.getBattery = function() {
                              return Promise.resolve({
                                charging: true,
                                chargingTime: Infinity,
                                dischargingTime: Infinity,
                                level: 1
                              });
                            };

                            // Mock connection API
                            navigator.connection = {
                              effectiveType: '4g',
                              rtt: 50,
                              downlink: 2,
                              saveData: false
                            };

                            // Mock geolocation
                            navigator.geolocation = {
                              getCurrentPosition: function(success, error) {
                                success({
                                  coords: {
                                    latitude: 37.7749,
                                    longitude: -122.4194,
                                    accuracy: 100,
                                    altitude: null,
                                    altitudeAccuracy: null,
                                    heading: null,
                                    speed: null
                                  },
                                  timestamp: Date.now()
                                });
                              },
                              watchPosition: function() { return 0; },
                              clearWatch: function() {}
                            };

                            // Override iframe contentWindow
                            const originalCreateElement = document.createElement;
                            document.createElement = function(tagName) {
                              const element = originalCreateElement.call(this, tagName);
                              if (tagName.toLowerCase() === 'iframe') {
                                Object.defineProperty(element, 'contentWindow', {
                                  get: function() {
                                    return window;
                                  }
                                });
                              }
                              return element;
                            };

                            // Mock WebGL
                            const getParameter = WebGLRenderingContext.prototype.getParameter;
                            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                              if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
                                const vendors = ['Intel Inc.', 'Google Inc.', 'NVIDIA Corporation', 'ATI Technologies Inc.'];
                                return vendors[Math.floor(Math.random() * vendors.length)];
                              }
                              if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
                                const renderers = ['Intel(R) Iris(TM) Graphics 6100', 'ANGLE (Intel, Intel(R) Iris(TM) Graphics 6100 Direct3D11 vs_5_0 ps_5_0)', 'NVIDIA GeForce GTX 1060', 'AMD Radeon Pro 560'];
                                return renderers[Math.floor(Math.random() * renderers.length)];
                              }
                              return getParameter.call(this, parameter);
                            };

                            // Mock canvas fingerprinting
                            const toDataURL = HTMLCanvasElement.prototype.toDataURL;
                            HTMLCanvasElement.prototype.toDataURL = function() {
                              const result = toDataURL.apply(this, arguments);
                              // Add subtle, consistent noise to canvas fingerprint
                              const ctx = this.getContext('2d');
                              if (ctx) {
                                const imageData = ctx.getImageData(0, 0, 1, 1);
                                imageData.data[0] = (imageData.data[0] + Math.floor(Math.random() * 5)) % 256; // Add slight noise to red channel
                                ctx.putImageData(imageData, 0, 0);
                              }
                              return toDataURL.apply(this, arguments);
                            };

                            // Mock timezone
                            Object.defineProperty(Intl, 'DateTimeFormat', {
                              value: class extends Intl.DateTimeFormat {
                                resolvedOptions() {
                                  const options = super.resolvedOptions();
                                  options.timeZone = 'America/Los_Angeles';
                                  return options;
                                }
                              }
                            });

                            // Mock notification API
                            window.Notification = class extends EventTarget {
                              constructor(title, options = {}) {
                                super();
                                this.title = title;
                                this.body = options.body || '';
                                this.icon = options.icon || '';
                                this.tag = options.tag || '';
                              }

                              static permission = 'granted';
                              static requestPermission = () => Promise.resolve('granted');
                            };

                            // Mock speech synthesis
                            window.speechSynthesis = {
                              getVoices: () => [],
                              speak: () => {},
                              cancel: () => {},
                              pause: () => {},
                              resume: () => {},
                              paused: false,
                              pending: false,
                              speaking: false
                            };

                            // Mock media devices
                            navigator.mediaDevices = {
                              enumerateDevices: () => Promise.resolve([
                                { deviceId: 'default', kind: 'audioinput', label: 'Default - Microphone' },
                                { deviceId: 'default', kind: 'audiooutput', label: 'Default - Speaker' }
                              ]),
                              getUserMedia: () => Promise.reject(new Error('Not allowed')),
                              getDisplayMedia: () => Promise.reject(new Error('Not allowed'))
                            };

                            // Mock vibration API
                            navigator.vibrate = function() { return true; };

                            // Mock wake lock
                            navigator.wakeLock = {
                              request: () => Promise.resolve({
                                released: false,
                                release: () => { this.released = true; }
                              })
                            };

                            // Mock presentation API
                            navigator.presentation = {
                              defaultRequest: null,
                              receiver: null
                            };

                            // Mock XR
                            navigator.xr = {
                              isSessionSupported: () => Promise.resolve(false),
                              requestSession: () => Promise.reject(new Error('Not supported'))
                            };

                            // Mock USB
                            navigator.usb = {
                              getDevices: () => Promise.resolve([]),
                              requestDevice: () => Promise.reject(new Error('Not allowed'))
                            };

                            // Mock HID
                            navigator.hid = {
                              getDevices: () => Promise.resolve([]),
                              requestDevice: () => Promise.reject(new Error('Not allowed'))
                            };

                            // Mock serial
                            navigator.serial = {
                              getPorts: () => Promise.resolve([]),
                              requestPort: () => Promise.reject(new Error('Not allowed'))
                            };

                            // Mock Bluetooth
                            navigator.bluetooth = {
                              getAvailability: () => Promise.resolve(false),
                              requestDevice: () => Promise.reject(new Error('Not allowed'))
                            };

                            // Mock NFC
                            navigator.nfc = undefined;

                            // Mock credentials
                            navigator.credentials = {
                              create: () => Promise.reject(new Error('Not supported')),
                              get: () => Promise.reject(new Error('Not supported')),
                              preventSilentAccess: () => Promise.resolve(),
                              store: () => Promise.reject(new Error('Not supported'))
                            };

                            // Mock service worker
                            navigator.serviceWorker = {
                              controller: null,
                              ready: Promise.resolve({
                                active: null,
                                controller: null,
                                installing: null,
                                waiting: null
                              }),
                              getRegistration: () => Promise.resolve(null),
                              getRegistrations: () => Promise.resolve([]),
                              register: () => Promise.reject(new Error('Not allowed')),
                              startMessages: () => {}
                            };

                            // Mock storage
                            Object.defineProperty(navigator, 'storage', {
                              get: () => ({
                                estimate: () => Promise.resolve({
                                  quota: 1000000000,
                                  usage: 1000000,
                                  usageDetails: { indexedDB: 1000000 }
                                }),
                                persist: () => Promise.resolve(false),
                                persisted: () => Promise.resolve(false)
                              })
                            });

                            // Mock scheduling
                            navigator.scheduling = {
                              isInputPending: () => false
                            };

                            // Mock user activation
                            navigator.userActivation = {
                              hasBeenActive: true,
                              isActive: true
                            };

                            // Mock managed
                            navigator.managed = {
                              getManagedConfiguration: () => Promise.resolve({})
                            };

                            // Mock ink
                            navigator.ink = {
                              requestPresenter: () => Promise.reject(new Error('Not supported'))
                            };

                            // Mock locks
                            navigator.locks = {
                              query: () => Promise.resolve({ held: [], pending: [] }),
                              request: () => Promise.reject(new Error('Not supported'))
                            };

                            // Mock share
                            navigator.share = function() {
                              return Promise.reject(new Error('Not supported'));
                            };

                            navigator.canShare = function() {
                              return false;
                            };

                            // Mock keyboard
                            navigator.keyboard = {
                              getLayoutMap: () => Promise.resolve(new Map()),
                              lock: () => Promise.reject(new Error('Not supported')),
                              unlock: () => {}
                            };

                            // Mock virtual keyboard
                            navigator.virtualKeyboard = {
                              boundingRect: new DOMRect(),
                              overlaysContent: false,
                              show: () => {},
                              hide: () => {}
                            };

                            // Mock device posture
                            navigator.devicePosture = {
                              type: 'continuous'
                            };

                            // Mock font access
                            document.fonts = {
                              ready: Promise.resolve(),
                              check: () => true,
                              load: () => Promise.resolve([])
                            };

                            // Mock eye dropper
                            window.EyeDropper = class {
                              open() {
                                return Promise.reject(new Error('Not supported'));
                              }
                            };

                            // Mock web share
                            navigator.share = function(data) {
                              return Promise.reject(new Error('Not supported'));
                            };

                            navigator.canShare = function(data) {
                              return false;
                            };

                            // Mock web app manifest
                            document.getManifest = function() {
                              return Promise.resolve({});
                            };

                            // Mock pointer events
                            window.PointerEvent = window.PointerEvent || class extends MouseEvent {};

                            // Mock touch events
                            window.TouchEvent = window.TouchEvent || class extends UIEvent {};

                            // Mock gamepad
                            navigator.getGamepads = function() {
                              return [];
                            };

                            // Mock memory
                            if ('memory' in performance) {
                              Object.defineProperty(performance, 'memory', {
                                get: () => ({
                                  usedJSHeapSize: 10000000,
                                  totalJSHeapSize: 20000000,
                                  jsHeapSizeLimit: 2172649472
                                })
                              });
                            }

                            // Mock timing
                            const originalGetEntries = performance.getEntries;
                            performance.getEntries = function() {
                              const entries = originalGetEntries.apply(this, arguments);
                              // Filter out automation-related entries
                              return entries.filter(entry => !entry.name.includes('webdriver'));
                            };

                            // Mock resource timing
                            const originalGetEntriesByType = performance.getEntriesByType;
                            performance.getEntriesByType = function(type) {
                              const entries = originalGetEntriesByType.call(this, type);
                              return entries.filter(entry => !entry.name.includes('webdriver'));
                            };

                            // Mock navigation timing
                            Object.defineProperty(performance, 'timing', {
                              get: () => ({
                                navigationStart: Date.now() - 1000,
                                unloadEventStart: 0,
                                unloadEventEnd: 0,
                                redirectStart: 0,
                                redirectEnd: 0,
                                fetchStart: Date.now() - 1000,
                                domainLookupStart: Date.now() - 900,
                                domainLookupEnd: Date.now() - 800,
                                connectStart: Date.now() - 800,
                                connectEnd: Date.now() - 700,
                                secureConnectionStart: Date.now() - 700,
                                requestStart: Date.now() - 600,
                                responseStart: Date.now() - 500,
                                responseEnd: Date.now() - 400,
                                domLoading: Date.now() - 300,
                                domInteractive: Date.now() - 200,
                                domContentLoadedEventStart: Date.now() - 150,
                                domContentLoadedEventEnd: Date.now() - 100,
                                domComplete: Date.now() - 50,
                                loadEventStart: Date.now() - 25,
                                loadEventEnd: Date.now()
                              })
                            });

                            // Mock event timing
                            if ('eventCounts' in performance) {
                              Object.defineProperty(performance, 'eventCounts', {
                                get: () => new Map()
                              });
                            }

                            // Mock element timing
                            if ('elementTiming' in performance) {
                              Object.defineProperty(performance, 'elementTiming', {
                                get: () => []
                              });
                            }

                            // Mock largest contentful paint
                            if ('lcp' in performance) {
                              Object.defineProperty(performance, 'lcp', {
                                get: () => ({
                                  value: 1000,
                                  entries: []
                                })
                              });
                            }

                            // Mock first input
                            if ('fid' in performance) {
                              Object.defineProperty(performance, 'fid', {
                                get: () => ({
                                  value: 10,
                                  entries: []
                                })
                              });
                            }

                            // Mock cumulative layout shift
                            if ('cls' in performance) {
                              Object.defineProperty(performance, 'cls', {
                                get: () => ({
                                  value: 0,
                                  entries: []
                                })
                              });
                            }

                            // Mock interaction to next paint
                            if ('inp' in performance) {
                              Object.defineProperty(performance, 'inp', {
                                get: () => ({
                                  value: 50,
                                  entries: []
                                })
                              });
                            }

                            // Mock long animation frame timing
                            if ('longAnimationFrame' in performance) {
                              Object.defineProperty(performance, 'longAnimationFrame', {
                                get: () => []
                              });
                            }

                            // Mock long task timing
                            if ('longtask' in performance) {
                              Object.defineProperty(performance, 'longtask', {
                                get: () => []
                              });
                            }

                            // Mock navigation timing level 2
                            if ('navigation' in performance) {
                              Object.defineProperty(performance, 'navigation', {
                                get: () => ({
                                  type: 'navigate',
                                  redirectCount: 0
                                })
                              });
                            }

                            // Mock paint timing
                            if ('paint' in performance) {
                              Object.defineProperty(performance, 'paint', {
                                get: () => []
                              });
                            }

                            // Mock server timing
                            if ('serverTiming' in performance) {
                              Object.defineProperty(performance, 'serverTiming', {
                                get: () => []
                              });
                            }

                            console.log('Anti-detection measures applied successfully');
                          })()
                        `);
                      }}
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
