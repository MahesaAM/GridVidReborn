const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Fungsi untuk komunikasi antara popup dan main window
  sendToMain: (channel, data) => {
    ipcRenderer.send(channel, data);
  },

  onFromMain: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args));
  },

  closePopup: () => {
    window.close();
  },
});
