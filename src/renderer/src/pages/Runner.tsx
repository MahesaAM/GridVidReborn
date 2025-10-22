import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { AutomationTask, AccountStatus } from "@main/task-runner"; // Assuming these types are exported

const Runner: React.FC = () => {
  const [maxConcurrency, setMaxConcurrency] = useState(3);
  const [delayBetweenAccounts, setDelayBetweenAccounts] = useState(5000);
  const [quotaPerAccount, setQuotaPerAccount] = useState(5);
  const [liveTasks, setLiveTasks] = useState<AutomationTask[]>([]); // To display live progress

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await window.electron.getSettings();
      setMaxConcurrency(settings.maxConcurrency || 3);
      // setDelayBetweenAccounts(settings.delayBetweenAccounts || 5000); // Assuming this setting exists
      // setQuotaPerAccount(settings.quotaPerAccount || 5); // Assuming this setting exists
    };
    loadSettings();

    // Listen for task updates from the main process
    const unsubscribeTasks = window.electron.onUpdateTasks(
      (updatedTasks: AutomationTask[]) => {
        setLiveTasks(updatedTasks);
      }
    );

    return () => {
      unsubscribeTasks();
    };
  }, []);

  const handleStartBatch = async () => {
    // For demonstration, we'll use dummy tasks and all registered accounts
    const accounts = await window.electron.getAccounts();
    if (accounts.length === 0) {
      alert("No accounts registered. Please import accounts first.");
      return;
    }

    const dummyTasks: AutomationTask[] = accounts.flatMap((account) => {
      const tasksForAccount: AutomationTask[] = [];
      for (let i = 0; i < quotaPerAccount; i++) {
        tasksForAccount.push({
          id: `${account.id}-${i}`,
          type: "text-to-video", // Or 'image-to-video' based on UI mode
          content: `Generate video for prompt ${i + 1} for ${account.email}`,
          status: "pending",
          accountId: account.id,
        });
      }
      return tasksForAccount;
    });
    const accountIds = accounts.map((account) => account.id);

    try {
      await window.electron.setMaxConcurrency(maxConcurrency);
      // await window.electron.setDelayBetweenAccounts(delayBetweenAccounts); // Assuming this IPC exists
      await window.electron.startBatch(dummyTasks, accountIds);
      alert("Batch started!");
    } catch (error: any) {
      alert(`Failed to start batch: ${error.message}`);
    }
  };

  const handlePauseBatch = async () => {
    try {
      await window.electron.pauseBatch();
      alert("Batch paused!");
    } catch (error: any) {
      alert(`Failed to pause batch: ${error.message}`);
    }
  };

  const handleResumeBatch = async () => {
    try {
      await window.electron.resumeBatch();
      alert("Batch resumed!");
    } catch (error: any) {
      alert(`Failed to resume batch: ${error.message}`);
    }
  };

  const handleStopBatch = async () => {
    try {
      await window.electron.stopBatch();
      alert("Batch stopped!");
      setLiveTasks([]); // Clear live tasks on stop
    } catch (error: any) {
      alert(`Failed to stop batch: ${error.message}`);
    }
  };

  const handleConcurrencyChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = Number(e.target.value);
    setMaxConcurrency(value);
    await window.electron.setMaxConcurrency(value);
  };

  const handleDownloadPathChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    // setDownloadPath(value); // Assuming a state for downloadPath
    await window.electron.setDownloadPath(value);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <h2 className="text-3xl font-bold text-white">Batch Runner</h2>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20"
      >
        <h3 className="text-lg font-semibold text-white/80 mb-4">
          Batch Settings
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="quota"
              className="block text-sm font-medium text-white/70 mb-1"
            >
              Quota per Account
            </label>
            <input
              type="number"
              id="quota"
              className="w-full p-2 bg-white/5 rounded-lg border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              value={quotaPerAccount}
              onChange={(e) => setQuotaPerAccount(Number(e.target.value))}
            />
          </div>
          <div>
            <label
              htmlFor="delay"
              className="block text-sm font-medium text-white/70 mb-1"
            >
              Delay between Accounts (ms)
            </label>
            <input
              type="number"
              id="delay"
              className="w-full p-2 bg-white/5 rounded-lg border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              value={delayBetweenAccounts}
              onChange={(e) => setDelayBetweenAccounts(Number(e.target.value))}
            />
          </div>
          <div>
            <label
              htmlFor="concurrency"
              className="block text-sm font-medium text-white/70 mb-1"
            >
              Max Concurrency
            </label>
            <input
              type="number"
              id="concurrency"
              className="w-full p-2 bg-white/5 rounded-lg border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              value={maxConcurrency}
              onChange={handleConcurrencyChange}
            />
          </div>
        </div>
        <div className="flex space-x-4 mt-6">
          <button
            onClick={handleStartBatch}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors duration-200"
          >
            Start Batch
          </button>
          <button
            onClick={handlePauseBatch}
            className="px-6 py-3 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-semibold transition-colors duration-200"
          >
            Pause All
          </button>
          <button
            onClick={handleResumeBatch}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-colors duration-200"
          >
            Resume
          </button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20"
      >
        <h3 className="text-lg font-semibold text-white/80 mb-4">
          Live Progress
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/20">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                  Account
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                  Task
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                  Progress
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {liveTasks.length > 0 ? (
                liveTasks.map((task) => (
                  <motion.tr
                    key={task.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.3 }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      {task.accountId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white/70">
                      {task.content}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-400">
                      {task.status}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white/70">
                      {/* Progress can be more detailed if task-runner provides it */}
                      {task.status === "completed" ? "Done" : "In Progress"}
                    </td>
                  </motion.tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-4 text-center text-white/70"
                  >
                    No active tasks. Start a batch to see live progress.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Runner;
