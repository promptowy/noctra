// Verifies the terminal-themed UI: navigation, shield breakdown popup, settings popup, landing.
const fs = require('fs');
const path = require('path');

const list = async () => (await fetch('http://127.0.0.1:9222/json/list')).json();

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onopen = () => resolve({
      send: (method, params = {}) => new Promise((res, rej) => {
        const mid = ++id;
        pending.set(mid, { res, rej });
        ws.send(JSON.stringify({ id: mid, method, params }));
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

const evalIn = async (c, expr) => {
  const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
  return r.result.value;
};

const shot = async (c, name, beyond = false) => {
  const s = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: beyond });
  fs.writeFileSync(path.join(__dirname, '..', name), Buffer.from(s.data, 'base64'));
  console.log(name, 'saved');
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  let targets = await list();
  const uiT = targets.find(t => t.url.includes('ui/index.html'));
  const ui = await cdp(uiT.webSocketDebuggerUrl);

  // navigate to tracker-heavy site
  await evalIn(ui, `window.noctra.navigate('onet.pl'); 'ok'`);
  await sleep(9000);
  console.log('toolbar state:', await evalIn(ui, `JSON.stringify({
    blocked: document.getElementById('blocked').textContent,
    url: document.getElementById('url').value,
    profile: document.getElementById('profilename').textContent
  })`));
  await shot(ui, 'verify-toolbar.png');

  // open shield popup
  await evalIn(ui, `window.noctra.openPopup('shield', 1100); 'ok'`);
  await sleep(2000);
  targets = await list();
  const shieldT = targets.find(t => t.url.includes('popup-shield'));
  if (shieldT) {
    const sp = await cdp(shieldT.webSocketDebuggerUrl);
    await sleep(500);
    console.log('shield popup:', await evalIn(sp, `JSON.stringify({
      site: document.getElementById('site').textContent,
      tabTotal: document.getElementById('tabTotal').textContent,
      rows: [...document.querySelectorAll('.row .host')].map(h => h.textContent).slice(0, 8)
    })`));
    await shot(sp, 'verify-shield-popup.png');
    sp.close();
  } else console.log('NO shield popup target');

  // open settings popup
  await evalIn(ui, `window.noctra.menuAction('settings'); 'ok'`);
  await sleep(2000);
  targets = await list();
  const setT = targets.find(t => t.url.includes('popup-settings'));
  if (setT) {
    const st = await cdp(setT.webSocketDebuggerUrl);
    await sleep(500);
    console.log('settings popup ok, engine:', await evalIn(st, `document.querySelector('input[name="engine"]:checked')?.value`));
    await shot(st, 'verify-settings-popup.png');
    st.close();
  } else console.log('NO settings popup target');

  // landing
  await evalIn(ui, `window.noctra.closePopup(); window.noctra.navigate('file:///C:/Users/promp/ScreenPal/promptal/landing/v2/index.html'); 'ok'`);
  await sleep(2500);
  targets = await list();
  const landT = targets.find(t => t.url.includes('landing/v2'));
  if (landT) {
    const lp = await cdp(landT.webSocketDebuggerUrl);
    await shot(lp, 'verify-landing-v2-full.png', true);
    lp.close();
  }

  ui.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
