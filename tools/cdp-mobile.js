// Captures the landing in mobile emulation (390x844) from the local file.
const fs = require('fs');
const path = require('path');

(async () => {
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const tab = targets.find(t => t.type === 'page' && !t.url.includes('ui/index.html'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (m, p = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method: m, params: p }));
  });
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    }
  };

  await send('Page.navigate', { url: 'file:///C:/Users/promp/ScreenPal/promptal/landing/v2/index.html' });
  await new Promise(r => setTimeout(r, 2500));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await new Promise(r => setTimeout(r, 1000));
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(__dirname, '..', 'verify-mobile.png'), Buffer.from(shot.data, 'base64'));
  // horizontal overflow check
  const r = await send('Runtime.evaluate', { expression: 'document.documentElement.scrollWidth + " vs viewport " + document.documentElement.clientWidth', returnByValue: true });
  console.log('scrollWidth:', r.result.value);
  console.log('mobile screenshot saved');
  ws.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
