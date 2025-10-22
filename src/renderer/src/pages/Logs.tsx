import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Account } from "@main/profile-manager"; // Assuming Account type is needed for filter

const Logs: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [selectedDate, setSelectedDate] = useState("");
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch accounts for filter dropdown
    const fetchAccounts = async () => {
      const fetchedAccounts = await window.electron.getAccounts();
      setAccounts(fetchedAccounts);
    };
    fetchAccounts();

    // Subscribe to log messages
    const unsubscribeLog = window.electron.onLogMessage((message: string) => {
      setLogs((prevLogs) => [...prevLogs, message]);
    });

    // Scroll to bottom on new log
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }

    return () => {
      unsubscribeLog();
    };
  }, [logs]); // Depend on logs to trigger scroll

  const handleExportCsv = () => {
    // TODO: Implement CSV export logic
    alert("Export CSV functionality not yet implemented.");
  };

  const filteredLogs = logs.filter((log) => {
    const matchesAccount =
      selectedAccount === "all" || log.includes(selectedAccount);
    const matchesDate =
      selectedDate === "" || log.startsWith(`[${selectedDate}`); // Simple date match
    return matchesAccount && matchesDate;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <h2 className="text-3xl font-bold text-white">Logs</h2>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white/80">Activity Logs</h3>
          <div className="flex space-x-4">
            <input
              type="date"
              className="p-2 bg-white/5 rounded-lg border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <select
              className="p-2 bg-white/5 rounded-lg border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
            >
              <option value="all">Filter by Account (All)</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.email}>
                  {account.email}
                </option>
              ))}
            </select>
            <button
              onClick={handleExportCsv}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors duration-200"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div
          ref={logContainerRef}
          className="h-96 overflow-y-auto bg-white/5 rounded-lg p-4 text-white/80 font-mono text-sm"
        >
          {filteredLogs.length > 0 ? (
            filteredLogs.map((log, index) => (
              <p key={index} className="mb-1">
                {log}
              </p>
            ))
          ) : (
            <p className="text-center text-white/70">No log entries.</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Logs;
