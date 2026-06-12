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
  restoreTab: () => ipcRenderer.send('restore-tab'),
  onTabsUpdated: (cb) => ipcRenderer.on('tabs-updated', (_e, state) => cb(state)),
  onFocusUrl: (cb) => ipcRenderer.on('focus-url', () => cb()),
  onBookmarkShortcut: (cb) => ipcRenderer.on('bookmark-shortcut', () => cb()),

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

  // bookmarks
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  addBookmark: (title, url) => ipcRenderer.send('add-bookmark', { title, url }),
  removeBookmark: (url) => ipcRenderer.send('remove-bookmark', url),
  navigateBookmark: (url) => ipcRenderer.send('navigate-bookmark', url),

  // downloads
  onDownloadsUpdated: (cb) => ipcRenderer.on('downloads-updated', (_e, list) => cb(list)),
  openDownloadsFolder: () => ipcRenderer.send('open-downloads-folder'),
  clearDownload: (id) => ipcRenderer.send('clear-download', id),
  showDownloadFile: (savePath) => ipcRenderer.send('show-download-file', savePath),

  // settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (patch) => ipcRenderer.send('set-settings', patch),
  clearProfileData: () => ipcRenderer.send('clear-profile-data'),
  setDefaultBrowser: () => ipcRenderer.send('set-default-browser'),

  // menu
  menuAction: (action) => ipcRenderer.send('menu-action', action)
});
