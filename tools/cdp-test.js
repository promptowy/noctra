// Drives the Noctra UI page over CDP to verify toolbar DOM, navigation, shield and profiles.
const UI_FILTER = process.argv[2] || 'ui/index.html';

async function getTargets() {
  const res = await fetch('http://127.0.0.1:9222/json/list');
  return res.json();
}

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onopen = () => resolve({
      send: (method, params = {}) => new Promise((res2, rej2) => {
        const mid = ++id;
        pending.set(mid, { res2, rej2 });
        ws.send(JSON.stringify({ id: mid, method, params }));
      }),
      close: () => ws.close()
    });
    ws.onerror = reject;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res2, rej2 } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej2(new Error(msg.error.message)) : res2(msg.result);
      }
    };
  });
}

async function evalIn(client, expr) {
  const r = await client.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

(async () => {
  const targets = await getTargets();
  const ui = targets.find(t => t.url.includes(UI_FILTER));
  if (!ui) { console.log('UI target not found'); process.exit(1); }
  const client = await cdp(ui.webSocketDebuggerUrl);

  // 1. Toolbar DOM check
  const dom = await evalIn(client, `JSON.stringify({
    shield: !!document.getElementById('shield'),
    shieldRect: document.getElementById('shield')?.getBoundingClientRect().toJSON(),
    profile: !!document.getElementById('profile'),
    profileRect: document.getElementById('profile')?.getBoundingClientRect().toJSON(),
    bodySize: { w: document.body.clientWidth, h: document.body.clientHeight },
    tabs: document.querySelectorAll('.tab').length,
    blocked: document.getElementById('blocked')?.textContent,
    errors: window.__errs || null
  })`);
  console.log('DOM:', dom);

  // 2. Navigate active tab to a tracker-heavy site
  await evalIn(client, `window.noctra.navigate('onet.pl'); 'ok'`);
  await new Promise(r => setTimeout(r, 9000));
  console.log('blocked after onet:', await evalIn(client, `document.getElementById('blocked').textContent`));

  // 3. Add a profile
  await evalIn(client, `window.noctra.addProfile('Work'); 'ok'`);
  await new Promise(r => setTimeout(r, 3000));
  console.log('after addProfile:', await evalIn(client, `JSON.stringify({
    activeProfileLabel: document.getElementById('profilename').textContent,
    tabs: [...document.querySelectorAll('.tab')].map(t => t.title)
  })`));

  // 4. Screenshot of UI page
  const shot = await client.send('Page.captureScreenshot', { format: 'png' });
  require('fs').writeFileSync(require('path').join(__dirname, '..', 'verify-ui.png'), Buffer.from(shot.data, 'base64'));
  console.log('ui screenshot saved');

  client.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
