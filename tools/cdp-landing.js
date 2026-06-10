// Opens the landing page in a Noctra tab via CDP and captures a full screenshot.
(async () => {
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const tab = targets.find(t => t.type === 'page' && !t.url.includes('ui/index.html'));
  if (!tab) { console.log('no tab target'); process.exit(1); }

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

  await send('Page.navigate', { url: 'file:///C:/Users/promp/ScreenPal/promptal/landing/v2/index.html' });
  await new Promise(r => setTimeout(r, 3000));
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  require('fs').writeFileSync(require('path').join(__dirname, '..', 'verify-landing.png'), Buffer.from(shot.data, 'base64'));
  console.log('landing screenshot saved');
  ws.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
