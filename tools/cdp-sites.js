// Verifies ppe.pl loads (UA fix) and wp.pl gets heavily blocked (big blocklist).
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
  return r.result.value;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const uiT = (await list()).find(t => t.url.includes('ui/index.html'));
  const ui = await cdp(uiT.webSocketDebuggerUrl);

  // ppe.pl — should load now
  await evalIn(ui, `window.noctra.navigate('ppe.pl'); 'ok'`);
  await sleep(10000);
  const ppeT = (await list()).find(t => t.url.includes('ppe.pl'));
  if (ppeT) {
    const ppe = await cdp(ppeT.webSocketDebuggerUrl);
    console.log('ppe.pl:', await evalIn(ppe, `JSON.stringify({title: document.title.slice(0,60), bodyLen: document.body.innerText.length})`));
    const shot = await ppe.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, '..', 'verify-ppe.png'), Buffer.from(shot.data, 'base64'));
    ppe.close();
  } else console.log('ppe.pl target NOT FOUND');

  // wp.pl — count blocked
  await evalIn(ui, `window.noctra.navigate('wp.pl'); 'ok'`);
  await sleep(12000);
  console.log('wp.pl blocked counter:', await evalIn(ui, `document.getElementById('blocked').textContent`));
  const data = await evalIn(ui, `window.noctra.getShieldData().then(d => JSON.stringify({total: d.total, top: d.hosts.slice(0,6)}))`);
  console.log('wp.pl shield:', data);

  ui.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
