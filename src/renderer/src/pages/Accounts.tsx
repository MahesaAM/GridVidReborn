import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Account } from "@main/profile-manager";
import { Trash2, UserPlus, X } from "lucide-react";

const Accounts: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const fetchAccounts = async () => {
    const fetchedAccounts = await window.electron.getAccounts();
    setAccounts(fetchedAccounts);
  };

  useEffect(() => {
    fetchAccounts();

    const unsubscribe = window.electron.onUpdateAccounts(
      (updatedAccounts: Account[]) => {
        setAccounts(updatedAccounts);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const handleImportExcel = async () => {
    const result = await window.electron.selectExcelFile();
    if (!result.canceled && result.filePaths.length > 0) {
      try {
        await window.electron.importAccounts(result.filePaths[0]);
        alert("Accounts imported successfully!");
      } catch (error: any) {
        alert(`Failed to import accounts: ${error.message}`);
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
        alert("Account deleted successfully!");
      } catch (error: any) {
        alert(`Failed to delete account: ${error.message}`);
      }
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
        alert("All accounts deleted successfully!");
      } catch (error: any) {
        alert(`Failed to delete accounts: ${error.message}`);
      }
    }
  };

  const handleAddAccount = async () => {
    if (!newEmail.trim() || !newPassword.trim()) {
      alert("Please enter both email and password");
      return;
    }

    try {
      // Check if account already exists
      const existingAccount = accounts.find(
        (acc) => acc.email.toLowerCase() === newEmail.toLowerCase()
      );
      if (existingAccount) {
        alert("Account with this email already exists!");
        return;
      }

      await window.electron.addAccount(newEmail.trim(), newPassword.trim());
      alert("Account added successfully!");
      setNewEmail("");
      setNewPassword("");
      setShowAddForm(false);
    } catch (error: any) {
      alert(`Failed to add account: ${error.message}`);
    }
  };

  const handleOpenProfileWindow = async (email: string) => {
    try {
      await window.electron.openProfileWindow(email);
    } catch (error: any) {
      alert(`Failed to open profile window: ${error.message}`);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <h2 className="text-3xl font-bold text-white">Accounts</h2>

      {/* Add Account Form */}
      {showAddForm && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white/80">
              Add New Account
            </h3>
            <button
              onClick={() => setShowAddForm(false)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-white/70" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Email
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Enter email address"
                className="w-full p-3 bg-white/5 rounded-lg border border-white/10 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full p-3 bg-white/5 rounded-lg border border-white/10 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleAddAccount}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-colors duration-200"
              >
                Add Account
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white/80">
            Registered Accounts ({accounts.length})
          </h3>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-colors duration-200 flex items-center"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Add Account
            </button>
            <button
              onClick={handleImportExcel}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors duration-200"
            >
              Import Excel
            </button>
            {accounts.length > 0 && (
              <button
                onClick={handleClearAllAccounts}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors duration-200 flex items-center"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All
              </button>
            )}
          </div>
        </div>

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
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {accounts.map((account) => (
                <motion.tr
                  key={account.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                    {account.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-400">
                    {account.status}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white/70">
                    {account.lastLogin
                      ? new Date(account.lastLogin).toLocaleDateString()
                      : "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleOpenProfileWindow(account.email)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium transition-colors duration-200"
                      >
                        Profile
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(account.id)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-medium transition-colors duration-200 flex items-center"
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-4 text-center text-white/70"
                  >
                    No accounts registered. Import from Excel to add accounts.
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

export default Accounts;
