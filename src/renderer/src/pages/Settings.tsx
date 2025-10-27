import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Account } from "@main/profile-manager";
import { Trash2, ArrowLeft } from "lucide-react";

interface SettingsProps {
  onBack: () => void;
}

const Settings: React.FC<SettingsProps> = ({ onBack }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [excelFile, setExcelFile] = useState("");

  useEffect(() => {
    const loadAccounts = async () => {
      const accountsData = await window.electron.getAccounts();
      setAccounts(accountsData);
    };
    loadAccounts();

    // Listen for account updates
    const unsubscribe = window.electron.onUpdateAccounts(
      (_event, updatedAccounts) => {
        setAccounts(updatedAccounts);
      }
    );

    return unsubscribe;
  }, []);

  const handleImportExcel = async () => {
    try {
      const result = await window.electron.selectExcelFile();
      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0]; // Take the first file
        setExcelFile(filePath);
        const importedAccounts = await window.electron.importAccounts(filePath);
        if (Array.isArray(importedAccounts)) {
          setAccounts(importedAccounts);
          alert("Accounts imported successfully!");
        } else {
          alert("Failed to import accounts: Invalid response format");
        }
      }
    } catch (error: any) {
      alert(`Failed to import accounts: ${error.message}`);
    }
  };

  const handleClearAllAccounts = async () => {
    if (
      confirm(
        "Are you sure you want to delete ALL accounts and their profile data? This action cannot be undone!"
      )
    ) {
      try {
        for (const account of accounts) {
          await window.electron.deleteAccount(account.id);
        }
        setAccounts([]);
        alert("All accounts deleted successfully!");
      } catch (error: any) {
        alert(`Failed to delete accounts: ${error.message}`);
      }
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (
      confirm(
        "Are you sure you want to delete this account and its profile data?"
      )
    ) {
      try {
        await window.electron.deleteAccount(id);
        setAccounts(accounts.filter((acc) => acc.id !== id));
        alert("Account deleted successfully!");
      } catch (error: any) {
        alert(`Failed to delete account: ${error.message}`);
      }
    }
  };

  const handleSaveAccounts = async () => {
    // For now, accounts are automatically saved when imported
    // This could be extended to allow manual editing
    alert("Accounts are automatically saved when imported.");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6 space-y-6"
    >
      <button
        onClick={onBack}
        className="flex items-center px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg font-semibold transition-colors duration-200 mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Main View
      </button>
      {/* Excel Import Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mt-20 shadow-xl border border-white/20"
      >
        <h3 className="text-lg font-semibold text-white/80 mb-4">
          Import Accounts from Excel
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Excel File
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="Select Excel file"
                className="flex-1 p-3 bg-white/5 rounded-lg border border-white/10 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={excelFile}
                readOnly
              />
              <button
                onClick={handleImportExcel}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors duration-200"
              >
                Browse
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Accounts List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20"
      >
        <h3 className="text-lg font-semibold text-white/80 mb-4">
          Accounts List ({accounts ? accounts.length : 0})
        </h3>
        <div className="overflow-x-auto">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-sm font-medium text-white/70">Account List</h4>
            {accounts.length > 0 && (
              <button
                onClick={handleClearAllAccounts}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-medium transition-colors duration-200 flex items-center"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear All Accounts
              </button>
            )}
          </div>
          <table className="min-w-full divide-y divide-white/20">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                  Password
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {accounts.length > 0 ? (
                accounts.map((account) => (
                  <motion.tr
                    key={account.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.3 }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      {account.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white/70">
                      Stored
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-400">
                      Active
                    </td>
                  </motion.tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-4 text-center text-white/70"
                  >
                    No accounts imported yet. Import from Excel file above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {accounts.length > 0 && (
          <button
            onClick={handleSaveAccounts}
            className="mt-6 px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors duration-200"
          >
            Save Accounts
          </button>
        )}
      </motion.div>
    </motion.div>
  );
};

export default Settings;
