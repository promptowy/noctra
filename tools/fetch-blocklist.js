// Builds assets/blocklist-data.json from public ad/tracker host lists.
// Run at dev time; the result ships with the app (no runtime downloads).
const fs = require('fs');
const path = require('path');

const SOURCES = [
  { url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts', type: 'hosts' },
  { url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=plain&showintro=0&mimetype=plaintext', type: 'plain' }
];

(async () => {
  const domains = new Set();
  for (const src of SOURCES) {
    const res = await fetch(src.url);
    const text = await res.text();
    let count = 0;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      let d = null;
      if (src.type === 'hosts') {
        const m = line.match(/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+(\S+)/);
        if (m && m[1] !== 'localhost' && m[1].includes('.')) d = m[1];
      } else {
        if (/^[\w.-]+\.[a-z]{2,}$/i.test(line)) d = line;
      }
      if (d) { domains.add(d.toLowerCase()); count++; }
    }
    console.log(src.url.slice(0, 60), '->', count, 'entries');
  }
  // local additions (Polish networks etc.)
  for (const d of require('../blocklist')) domains.add(d);
  const out = path.join(__dirname, '..', 'assets', 'blocklist-data.json');
  fs.writeFileSync(out, JSON.stringify([...domains]));
  console.log('total unique domains:', domains.size, '->', out);
})();
