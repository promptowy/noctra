// Compiles EasyList + EasyPrivacy + EasyList Polish into a serialized engine
// shipped with the app (assets/adblock-engine.bin). Run at dev/release time.
const fs = require('fs');
const path = require('path');
const { FiltersEngine } = require('@ghostery/adblocker');

const LISTS = [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
  'https://easylist-downloads.adblockplus.org/easylistpolish.txt',
  'https://secure.fanboy.co.nz/fanboy-cookiemonster.txt' // cookie banners
];

(async () => {
  const engine = await FiltersEngine.fromLists(fetch, LISTS);
  const buf = engine.serialize();
  const out = path.join(__dirname, '..', 'assets', 'adblock-engine.bin');
  fs.writeFileSync(out, Buffer.from(buf));
  console.log('engine:', (buf.byteLength / 1048576).toFixed(1), 'MB ->', out);
})();
