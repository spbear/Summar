const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  findVaults: () => ipcRenderer.invoke('find-vaults'),
  selectVaultFolder: () => ipcRenderer.invoke('select-vault-folder'),
  installPlugin: (vaultPath) => ipcRenderer.invoke('install-plugin', vaultPath),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkDiskAccess: () => ipcRenderer.invoke('check-disk-access'),
  openSystemPreferences: () => ipcRenderer.invoke('open-system-preferences'),
  loadLocale: (language) => ipcRenderer.invoke('load-locale', language),
  getSystemLocale: () => ipcRenderer.invoke('get-system-locale')
});
