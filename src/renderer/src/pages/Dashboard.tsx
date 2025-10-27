import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Account } from "@main/profile-manager";
import { AutomationTask } from "@main/task-runner";

const Dashboard: React.FC = () => {
  const [totalAccounts, setTotalAccounts] = useState(0);
  const [activeMode, setActiveMode] = useState("Text-to-Video"); // This will be dynamic later
  const [totalPromptsImages, setTotalPromptsImages] = useState(0);
  const [globalProgress, setGlobalProgress] = useState(0); // 0-100

  useEffect(() => {
    const fetchInitialData = async () => {
      const accounts = await window.electron.getAccounts();
      setTotalAccounts(accounts.length);
      // const tasks = await window.electron.getTasks(); // Assuming a getTasks method
      // setTotalPromptsImages(tasks.length);
    };

    fetchInitialData();

    const unsubscribeAccounts = window.electron.onUpdateAccounts(
      (_event, accounts: Account[]) => {
        setTotalAccounts(accounts.length);
      }
    );

    // const unsubscribeTasks = window.electron.onUpdateTasks((tasks: AutomationTask[]) => {
    //   setTotalPromptsImages(tasks.length);
    //   // Calculate global progress based on tasks
    //   const completedTasks = tasks.filter(task => task.status === 'completed').length;
    //   if (tasks.length > 0) {
    //     setGlobalProgress((completedTasks / tasks.length) * 100);
    //   } else {
    //     setGlobalProgress(0);
    //   }
    // });

    return () => {
      unsubscribeAccounts();
      // unsubscribeTasks();
    };
  }, []);

  const handleStartBatch = async () => {
    // For demonstration, we'll use dummy tasks and all registered accounts
    const accounts = await window.electron.getAccounts();
    if (accounts.length === 0) {
      alert("No accounts registered. Please import accounts first.");
      return;
    }

    const dummyTasks: AutomationTask[] = accounts.flatMap((account) => [
      {
        id: `task-${account.id}-1`,
        type: "text-to-video",
        content: "Generate a futuristic city video",
        status: "pending",
        accountId: account.id,
      },
      {
        id: `task-${account.id}-2`,
        type: "text-to-video",
        content: "Create a serene nature scene video",
        status: "pending",
        accountId: account.id,
      },
    ]);
    const accountIds = accounts.map((account) => account.id);

    try {
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

  const handleStopBatch = async () => {
    try {
      await window.electron.stopBatch();
      alert("Batch stopped!");
      setGlobalProgress(0); // Reset progress on stop
    } catch (error: any) {
      alert(`Failed to stop batch: ${error.message}`);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <h2 className="text-3xl font-bold text-white">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Total Accounts Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20"
        >
          <h3 className="text-lg font-semibold text-white/80 mb-2">
            Total Accounts
          </h3>
          <p className="text-4xl font-bold text-purple-400">{totalAccounts}</p>
        </motion.div>

        {/* Active Mode Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20"
        >
          <h3 className="text-lg font-semibold text-white/80 mb-2">
            Active Mode
          </h3>
          <p className="text-2xl font-bold text-green-400">{activeMode}</p>
        </motion.div>

        {/* Total Prompts/Images Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20"
        >
          <h3 className="text-lg font-semibold text-white/80 mb-2">
            Total Prompts/Images
          </h3>
          <p className="text-4xl font-bold text-blue-400">
            {totalPromptsImages}
          </p>
        </motion.div>
      </div>

      {/* Global Progress Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.3 }}
        className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20"
      >
        <h3 className="text-lg font-semibold text-white/80 mb-4">
          Global Progress
        </h3>
        <div className="w-full bg-gray-700 rounded-full h-4">
          <div
            className="bg-gradient-to-r from-purple-500 to-blue-500 h-4 rounded-full"
            style={{ width: `${globalProgress}%` }}
          ></div>
        </div>
        <p className="text-sm text-white/70 mt-2">
          {globalProgress.toFixed(2)}% Completed
        </p>
      </motion.div>

      {/* Action Buttons */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.3 }}
        className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20 flex space-x-4"
      >
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
          Pause
        </button>
        <button
          onClick={handleStopBatch}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors duration-200"
        >
          Stop
        </button>
      </motion.div>
    </motion.div>
  );
};

export default Dashboard;
