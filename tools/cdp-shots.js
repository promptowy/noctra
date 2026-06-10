// Screenshots each landing variant in a Noctra tab via CDP.
(async () => {
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const tab = targets.find(t => t.type === 'page' && !t.url.includes('ui/index.html'));
  if (!tab) { console.log('no tab target — is Noctra running with --remote-debugging-port=9222?'); process.exit(1); }

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
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

  const fs = require('fs');
  const path = require('path');
  for (const v of ['v1', 'v2', 'v3']) {
    await send('Page.navigate', { url: `file:///C:/Users/promp/ScreenPal/promptal/landing/${v}/index.html` });
    await new Promise(r => setTimeout(r, 2500));
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(__dirname, '..', `verify-landing-${v}.png`), Buffer.from(shot.data, 'base64'));
    console.log(v, 'saved');
  }
  ws.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
