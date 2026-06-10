const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('noctra', {
  // tabs & navigation
  newTab: () => ipcRenderer.send('new-tab'),
  closeTab: (id) => ipcRenderer.send('close-tab', id),
  switchTab: (id) => ipcRenderer.send('switch-tab', id),
  navigate: (input) => ipcRenderer.send('navigate', input),
  goBack: () => ipcRenderer.send('go-back'),
  goForward: () => ipcRenderer.send('go-forward'),
  reload: () => ipcRenderer.send('reload'),
  onTabsUpdated: (cb) => ipcRenderer.on('tabs-updated', (_e, state) => cb(state)),
  onFocusUrl: (cb) => ipcRenderer.on('focus-url', () => cb()),

  // popups
  openPopup: (type, anchorX) => ipcRenderer.send('open-popup', { type, anchorX }),
  closePopup: () => ipcRenderer.send('close-popup'),

  // shield
  getShieldData: () => ipcRenderer.invoke('get-shield-data'),
  toggleShieldSite: () => ipcRenderer.send('toggle-shield-site'),

  // profiles
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  switchProfile: (name) => ipcRenderer.send('switch-profile', name),
  addProfile: (name) => ipcRenderer.send('add-profile', name),

  // settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (patch) => ipcRenderer.send('set-settings', patch),
  clearProfileData: () => ipcRenderer.send('clear-profile-data'),

  // menu
  menuAction: (action) => ipcRenderer.send('menu-action', action)
});
