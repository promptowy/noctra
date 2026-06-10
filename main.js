const { app, BrowserWindow, WebContentsView, ipcMain, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const COSMETIC_CSS = require('./cosmetic');
const { FiltersEngine, Request } = require('@ghostery/adblocker');

const ADBLOCK_TYPE = {
  mainFrame: 'main_frame', subFrame: 'sub_frame', stylesheet: 'stylesheet',
  script: 'script', image: 'image', font: 'font', object: 'object',
  xhr: 'xmlhttprequest', ping: 'ping', cspReport: 'csp_report',
  media: 'media', webSocket: 'websocket'
};

function normHost(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
}

// Sites with bot protection reject the Electron token — present a clean Chrome UA.
app.userAgentFallback = app.userAgentFallback
  .replace(/\s?noctra\/[\d.]+/i, '')
  .replace(/\s?Electron\/[\d.]+/i, '');

const TOOLBAR_HEIGHT = 96;
const PROFILE_COLORS = ['#34d24b', '#22d3ee', '#f472b6', '#fbbf24', '#a78bfa', '#fb7185'];
const SEARCH_ENGINES = {
  duckduckgo: 'https://duckduckgo.com/?q=',
  brave: 'https://search.brave.com/search?q=',
  google: 'https://www.google.com/search?q='
};

let win = null;
let popup = null;
const tabs = new Map(); // id -> { view, profile, wcId, blocked: Map(host->count), blockedTotal }
let activeTabId = null;
let nextTabId = 1;
let sessionBlocked = 0;

// ---------- Settings ----------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { searchEngine: 'duckduckgo', homepage: 'https://duckduckgo.com', shieldOffSites: [] };
function loadSettings() {
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch {}
}
function saveSettings() { fs.writeFileSync(settingsFile(), JSON.stringify(settings)); }

// ---------- Profiles ----------
const profilesFile = () => path.join(app.getPath('userData'), 'profiles.json');
let profiles = [];
let activeProfile = 'Default';
function loadProfiles() {
  try {
    const data = JSON.parse(fs.readFileSync(profilesFile(), 'utf8'));
    profiles = data.profiles;
    activeProfile = data.active;
  } catch {
    profiles = [{ name: 'Default', color: PROFILE_COLORS[0] }];
    activeProfile = 'Default';
  }
}
function saveProfiles() {
  fs.writeFileSync(profilesFile(), JSON.stringify({ profiles, active: activeProfile }));
}
function profileSession(name) {
  return name === 'Default'
    ? session.defaultSession
    : session.fromPartition('persist:profile-' + name);
}

// ---------- Shield (always on) ----------
function tabByWcId(wcId) {
  for (const t of tabs.values()) if (t.wcId === wcId) return t;
  return null;
}

// Full filter engine (EasyList + EasyPrivacy + EasyList Polish + cookie banners),
// compiled at release time into assets/adblock-engine.bin. Network matching only —
// no injected cosmetics from the engine, so pages can never be left hidden by it.
let blocker = null;
function loadBlocker() {
  blocker = FiltersEngine.deserialize(
    fs.readFileSync(path.join(__dirname, 'assets', 'adblock-engine.bin'))
  );
}

function shieldOffFor(host) {
  return !!host && settings.shieldOffSites.includes(host);
}

const shieldedSessions = new WeakSet();
function setupShield(ses) {
  if (shieldedSessions.has(ses)) return;
  shieldedSessions.add(ses);
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    if (details.resourceType === 'mainFrame') return callback({});
    const t = tabByWcId(details.webContentsId);
    const pageUrl = t ? t.view.webContents.getURL() : (details.referrer || '');
    if (shieldOffFor(normHost(pageUrl))) return callback({});
    const { match } = blocker.match(Request.fromRawDetails({
      url: details.url,
      type: ADBLOCK_TYPE[details.resourceType] || 'other',
      sourceUrl: pageUrl
    }));
    if (match) {
      sessionBlocked++;
      if (t) {
        let host = null;
        try { host = new URL(details.url).hostname; } catch {}
        if (host) {
          t.blocked.set(host, (t.blocked.get(host) || 0) + 1);
          t.blockedTotal++;
        }
      }
      sendTabsState();
      return callback({ cancel: true });
    }
    callback({});
  });
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders;
    headers['DNT'] = '1';
    headers['Sec-GPC'] = '1';
    callback({ requestHeaders: headers });
  });
}

// ---------- Tabs ----------
function tabBounds() {
  const [w, h] = win.getContentSize();
  return { x: 0, y: TOOLBAR_HEIGHT, width: w, height: h - TOOLBAR_HEIGHT };
}

function sendTabsState() {
  if (!win) return;
  const state = [...tabs.entries()].map(([id, t]) => ({
    id,
    title: t.view.webContents.getTitle() || 'new tab',
    url: t.view.webContents.getURL(),
    profile: t.profile,
    profileColor: (profiles.find(p => p.name === t.profile) || profiles[0]).color,
    active: id === activeTabId,
    blocked: t.blockedTotal,
    shieldOff: shieldOffFor(normHost(t.view.webContents.getURL())),
    canGoBack: t.view.webContents.navigationHistory.canGoBack(),
    canGoForward: t.view.webContents.navigationHistory.canGoForward(),
    loading: t.view.webContents.isLoading()
  }));
  win.webContents.send('tabs-updated', {
    tabs: state,
    profiles,
    activeProfile,
    sessionBlocked
  });
}

function createTab(url = settings.homepage, profileName = activeProfile) {
  const id = nextTabId++;
  const ses = profileSession(profileName);
  setupShield(ses);
  const view = new WebContentsView({
    webPreferences: { sandbox: true, contextIsolation: true, session: ses }
  });
  tabs.set(id, { view, profile: profileName, wcId: view.webContents.id, blocked: new Map(), blockedTotal: 0 });

  const wc = view.webContents;
  for (const ev of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading']) {
    wc.on(ev, sendTabsState);
  }
  wc.on('did-navigate', () => {
    const t = tabs.get(id);
    if (t) { t.blocked = new Map(); t.blockedTotal = 0; }
  });
  wc.on('did-finish-load', () => {
    if (shieldOffFor(normHost(wc.getURL()))) return;
    wc.insertCSS(COSMETIC_CSS).catch(() => {});
    // Anti-hide watchdog: some sites keep <html>/<body> hidden until a consent
    // manager or ad script (which we block) reports back. Unhide them.
    wc.executeJavaScript(`(() => {
      const unhide = () => {
        for (const el of [document.documentElement, document.body]) {
          if (el && getComputedStyle(el).display === 'none') el.style.setProperty('display', 'block', 'important');
          if (el && getComputedStyle(el).visibility === 'hidden') el.style.setProperty('visibility', 'visible', 'important');
        }
      };
      let n = 0;
      const iv = setInterval(() => { unhide(); if (++n >= 10) clearInterval(iv); }, 700);
      unhide();
    })()`, true).catch(() => {});
  });
  wc.setWindowOpenHandler(({ url }) => {
    createTab(url, profileName);
    return { action: 'deny' };
  });
  // Browser shortcuts must work while the page has focus (no app menu anymore).
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !input.control) return;
    const k = input.key.toLowerCase();
    if (k === 't') { e.preventDefault(); createTab(); }
    if (k === 'w') { e.preventDefault(); closeTab(id); }
    if (k === 'r') { e.preventDefault(); wc.reload(); }
    if (k === 'l') { e.preventDefault(); win.focus(); win.webContents.focus(); win.webContents.send('focus-url'); }
  });

  wc.loadURL(url);
  switchTab(id);
  return id;
}

function switchTab(id) {
  if (!tabs.has(id)) return;
  if (activeTabId !== null && tabs.has(activeTabId)) {
    win.contentView.removeChildView(tabs.get(activeTabId).view);
  }
  activeTabId = id;
  const t = tabs.get(id);
  activeProfile = t.profile;
  saveProfiles();
  win.contentView.addChildView(t.view);
  t.view.setBounds(tabBounds());
  sendTabsState();
}

function closeTab(id) {
  const t = tabs.get(id);
  if (!t) return;
  if (id === activeTabId) win.contentView.removeChildView(t.view);
  t.view.webContents.close();
  tabs.delete(id);
  if (id === activeTabId) {
    activeTabId = null;
    const remaining = [...tabs.keys()];
    if (remaining.length) switchTab(remaining[remaining.length - 1]);
    else createTab();
  } else {
    sendTabsState();
  }
}

function toUrl(input) {
  const text = input.trim();
  if (/^https?:\/\//i.test(text) || /^file:\/\//i.test(text)) return text;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(text)) return 'https://' + text;
  return (SEARCH_ENGINES[settings.searchEngine] || SEARCH_ENGINES.duckduckgo) + encodeURIComponent(text);
}

// ---------- Popups (shield / menu / settings bubbles, Brave-style) ----------
const POPUP_SIZES = {
  shield: { width: 360, height: 380 },
  menu: { width: 280, height: 330 },
  profiles: { width: 300, height: 360 },
  settings: { width: 460, height: 520 }
};

function closePopup() {
  if (popup && !popup.isDestroyed()) popup.close();
  popup = null;
}

function openPopup(type, anchorX) {
  closePopup();
  const size = POPUP_SIZES[type] || POPUP_SIZES.menu;
  const cb = win.getContentBounds();
  const x = Math.round(cb.x + Math.max(8, Math.min(anchorX - size.width / 2, cb.width - size.width - 8)));
  const y = Math.round(cb.y + TOOLBAR_HEIGHT - 4);
  popup = new BrowserWindow({
    x, y,
    width: size.width, height: size.height,
    frame: false, resizable: false, movable: false,
    skipTaskbar: true, show: false,
    parent: win,
    backgroundColor: '#0c0f0c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  const p = popup;
  p.loadFile(path.join(__dirname, 'ui', `popup-${type}.html`));
  p.once('ready-to-show', () => { if (!p.isDestroyed()) p.show(); });
  p.on('blur', () => { if (!p.isDestroyed()) p.close(); });
  p.on('closed', () => { if (popup === p) popup = null; });
}

// ---------- App ----------
function setupAutoUpdate() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', () => {}); // offline / no release yet — never bother the user
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
  } catch {}
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // no File/Edit/View bar — browsers don't have one
  loadBlocker();
  loadProfiles();
  loadSettings();
  setupAutoUpdate();

  win = new BrowserWindow({
    width: 1320,
    height: 860,
    backgroundColor: '#0c0f0c',
    title: 'noctra',
    icon: path.join(__dirname, 'assets', 'noctra.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });

  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.on('resize', () => {
    if (activeTabId && tabs.has(activeTabId)) tabs.get(activeTabId).view.setBounds(tabBounds());
  });
  win.on('closed', () => { win = null; });

  win.webContents.once('did-finish-load', () => createTab());

  // tabs & nav
  ipcMain.on('new-tab', () => createTab());
  ipcMain.on('close-tab', (_e, id) => closeTab(id));
  ipcMain.on('switch-tab', (_e, id) => switchTab(id));
  ipcMain.on('navigate', (_e, input) => {
    const t = tabs.get(activeTabId);
    if (t) t.view.webContents.loadURL(toUrl(input));
  });
  ipcMain.on('go-back', () => {
    const wc = tabs.get(activeTabId)?.view.webContents;
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  });
  ipcMain.on('go-forward', () => {
    const wc = tabs.get(activeTabId)?.view.webContents;
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  });
  ipcMain.on('reload', () => tabs.get(activeTabId)?.view.webContents.reload());

  // popups
  ipcMain.on('open-popup', (_e, { type, anchorX }) => openPopup(type, anchorX));
  ipcMain.on('close-popup', () => closePopup());

  // shield details (Brave-style breakdown for the active tab)
  ipcMain.handle('get-shield-data', () => {
    const t = tabs.get(activeTabId);
    let url = '';
    try { url = t ? new URL(t.view.webContents.getURL()).hostname : ''; } catch {}
    return {
      site: url,
      shieldOff: shieldOffFor(normHost(t ? t.view.webContents.getURL() : '')),
      total: t ? t.blockedTotal : 0,
      sessionTotal: sessionBlocked,
      hosts: t ? [...t.blocked.entries()].map(([host, count]) => ({ host, count })).sort((a, b) => b.count - a.count) : []
    };
  });

  // per-site shield toggle (Brave-style "shields down" for stubborn sites)
  ipcMain.on('toggle-shield-site', () => {
    closePopup();
    const t = tabs.get(activeTabId);
    if (!t) return;
    const host = normHost(t.view.webContents.getURL());
    if (!host) return;
    const i = settings.shieldOffSites.indexOf(host);
    if (i >= 0) settings.shieldOffSites.splice(i, 1);
    else settings.shieldOffSites.push(host);
    saveSettings();
    t.blocked = new Map();
    t.blockedTotal = 0;
    t.view.webContents.reload();
  });

  // profiles
  ipcMain.handle('get-profiles', () => ({ profiles, activeProfile }));
  ipcMain.on('switch-profile', (_e, name) => {
    closePopup();
    if (!profiles.find(p => p.name === name)) return;
    activeProfile = name;
    saveProfiles();
    createTab(settings.homepage, name);
  });
  ipcMain.on('add-profile', (_e, name) => {
    closePopup();
    name = String(name).trim().slice(0, 24);
    if (!name || profiles.find(p => p.name === name)) return;
    profiles.push({ name, color: PROFILE_COLORS[profiles.length % PROFILE_COLORS.length] });
    activeProfile = name;
    saveProfiles();
    createTab(settings.homepage, name);
  });

  // settings
  ipcMain.handle('get-settings', () => ({ ...settings, version: app.getVersion(), chromium: process.versions.chrome }));
  ipcMain.on('set-settings', (_e, patch) => {
    if (patch.searchEngine && SEARCH_ENGINES[patch.searchEngine]) settings.searchEngine = patch.searchEngine;
    if (typeof patch.homepage === 'string' && /^https?:\/\//.test(patch.homepage)) settings.homepage = patch.homepage;
    saveSettings();
  });
  ipcMain.on('clear-profile-data', async () => {
    const ses = profileSession(activeProfile);
    await ses.clearStorageData();
    await ses.clearCache();
    closePopup();
    const t = tabs.get(activeTabId);
    if (t) t.view.webContents.reload();
  });

  // menu actions
  ipcMain.on('menu-action', (_e, action) => {
    closePopup();
    if (action === 'new-tab') createTab();
    if (action === 'settings') openPopup('settings', 99999);
  });
});

app.on('window-all-closed', () => app.quit());
