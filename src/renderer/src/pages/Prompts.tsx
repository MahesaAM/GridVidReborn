import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import path from "path"; // Import path for basename

const Prompts: React.FC = () => {
  const [mode, setMode] = useState<"text-to-video" | "image-to-video">(
    "text-to-video"
  );
  const [prompts, setPrompts] = useState<string[]>([]);
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [promptInput, setPromptInput] = useState("");

  useEffect(() => {
    // Load saved prompts on component mount
    const loadPrompts = async () => {
      const savedPrompts = await window.electron.getPrompts();
      setPrompts(savedPrompts);
      setPromptInput(savedPrompts.join("\n"));
    };
    loadPrompts();
  }, []);

  const handleImportPromptFile = async () => {
    const { canceled, filePaths } = await window.electron.selectImages(); // Reusing for file picker
    if (!canceled && filePaths.length > 0) {
      const filePath = filePaths[0];
      try {
        // For simplicity, assuming CSV is just lines of prompts
        const response = await fetch(`file://${filePath}`);
        const text = await response.text();
        const importedPrompts = text
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean);
        setPrompts(importedPrompts);
        setPromptInput(importedPrompts.join("\n"));
        await window.electron.savePrompts(importedPrompts);
        alert("Prompts imported successfully!");
      } catch (error: any) {
        alert(`Failed to import prompt file: ${error.message}`);
      }
    }
  };

  const handleSavePrompts = async () => {
    const updatedPrompts = promptInput
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    setPrompts(updatedPrompts);
    await window.electron.savePrompts(updatedPrompts);
    alert("Prompts saved!");
  };

  const handleSelectImages = async () => {
    const { canceled, filePaths } = await window.electron.selectImages();
    if (!canceled && filePaths.length > 0) {
      setImagePaths(filePaths);
      alert(`Selected ${filePaths.length} images.`);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <h2 className="text-3xl font-bold text-white">Prompts / Images</h2>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20"
      >
        <h3 className="text-lg font-semibold text-white/80 mb-4">
          Select Mode
        </h3>
        <div className="flex space-x-4">
          <button
            onClick={() => setMode("text-to-video")}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors duration-200 ${
              mode === "text-to-video"
                ? "bg-purple-600 hover:bg-purple-700"
                : "bg-gray-700 hover:bg-gray-600"
            }`}
          >
            Text-to-Video
          </button>
          <button
            onClick={() => setMode("image-to-video")}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors duration-200 ${
              mode === "image-to-video"
                ? "bg-purple-600 hover:bg-purple-700"
                : "bg-gray-700 hover:bg-gray-600"
            }`}
          >
            Image-to-Video
          </button>
        </div>
      </motion.div>

      {mode === "text-to-video" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white/80">
              Text Prompts
            </h3>
            <div className="flex space-x-2">
              <button
                onClick={handleImportPromptFile}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors duration-200"
              >
                Import Prompt File (.csv)
              </button>
              <button
                onClick={handleSavePrompts}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors duration-200"
              >
                Save Prompts
              </button>
            </div>
          </div>
          <textarea
            className="w-full h-40 p-4 bg-white/5 rounded-lg border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Enter prompts, one per line..."
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
          ></textarea>
          <div className="overflow-x-auto mt-4">
            <table className="min-w-full divide-y divide-white/20">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                    Prompt
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {prompts.length > 0 ? (
                  prompts.map((prompt, index) => (
                    <motion.tr
                      key={index}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 + index * 0.05, duration: 0.3 }}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {prompt}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-400">
                        Pending
                      </td>
                    </motion.tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={2}
                      className="px-6 py-4 text-center text-white/70"
                    >
                      No prompts loaded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {mode === "image-to-video" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white/80">
              Images for Video
            </h3>
            <button
              onClick={handleSelectImages}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors duration-200"
            >
              Select Images (Multiple)
            </button>
          </div>
          <div className="overflow-x-auto mt-4">
            <table className="min-w-full divide-y divide-white/20">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                    Image File
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {imagePaths.length > 0 ? (
                  imagePaths.map((imagePath, index) => (
                    <motion.tr
                      key={index}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 + index * 0.05, duration: 0.3 }}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {path.basename(imagePath)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-400">
                        Pending
                      </td>
                    </motion.tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={2}
                      className="px-6 py-4 text-center text-white/70"
                    >
                      No images selected.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default Prompts;
