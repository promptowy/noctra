// Verifies the settings and menu popups after the popup-race fix.
const fs = require('fs');
const path = require('path');
const list = async () => (await fetch('http://127.0.0.1:9222/json/list')).json();

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onopen = () => resolve({
      send: (m, p = {}) => new Promise((res, rej) => {
        const mid = ++id;
        pending.set(mid, { res, rej });
        ws.send(JSON.stringify({ id: mid, method: m, params: p }));
      }),
      close: () => ws.close()
    });
    ws.onerror = reject;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      }
    };
  });
}
const evalIn = async (c, e) => {
  const r = await c.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval failed');
  return r.result.value;
};
const shot = async (c, name) => {
  const s = await c.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', name), Buffer.from(s.data, 'base64'));
  console.log(name, 'saved');
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const uiT = (await list()).find(t => t.url.includes('ui/index.html'));
  const ui = await cdp(uiT.webSocketDebuggerUrl);

  await evalIn(ui, `window.noctra.menuAction('settings'); 'ok'`);
  await sleep(2500);
  const setT = (await list()).find(t => t.url.includes('popup-settings'));
  if (!setT) { console.log('NO settings popup'); process.exit(1); }
  const st = await cdp(setT.webSocketDebuggerUrl);
  await sleep(400);
  console.log('settings:', await evalIn(st, `JSON.stringify({
    engine: document.querySelector('input[name="engine"]:checked')?.value,
    homepage: document.getElementById('homepage').value,
    ver: document.getElementById('ver').textContent
  })`));
  await shot(st, 'verify-settings-popup.png');
  st.close();

  await evalIn(ui, `window.noctra.openPopup('menu', 1200); 'ok'`);
  await sleep(2000);
  const menuT = (await list()).find(t => t.url.includes('popup-menu'));
  if (menuT) {
    const mn = await cdp(menuT.webSocketDebuggerUrl);
    await sleep(300);
    await shot(mn, 'verify-menu-popup.png');
    mn.close();
  } else console.log('NO menu popup');

  await evalIn(ui, `window.noctra.closePopup(); 'ok'`);
  console.log('main process alive:', !!(await list()).length);
  ui.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
