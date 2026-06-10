// Bundles the rendered PNGs into a single .ico (ICO supports PNG-compressed entries).
const fs = require('fs');
const path = require('path');

const assets = path.join(__dirname, '..', 'assets');
const sizes = [16, 32, 48, 64, 128, 256];
const pngs = sizes.map(s => ({ size: s, data: fs.readFileSync(path.join(assets, `noctra-${s}.png`)) }));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(pngs.length, 4);

const entries = [];
let offset = 6 + 16 * pngs.length;
for (const { size, data } of pngs) {
  const e = Buffer.alloc(16);
  e.writeUInt8(size === 256 ? 0 : size, 0); // width (0 = 256)
  e.writeUInt8(size === 256 ? 0 : size, 1); // height
  e.writeUInt8(0, 2);  // palette
  e.writeUInt8(0, 3);  // reserved
  e.writeUInt16LE(1, 4);  // color planes
  e.writeUInt16LE(32, 6); // bpp
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += data.length;
  entries.push(e);
}

fs.writeFileSync(
  path.join(assets, 'noctra.ico'),
  Buffer.concat([header, ...entries, ...pngs.map(p => p.data)])
);
console.log('noctra.ico written');
