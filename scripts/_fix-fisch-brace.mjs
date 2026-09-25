const fs = require('fs');
const path = 'src/game/fisch.ts';
let bytes = fs.readFileSync(path);

// The file uses CRLF. We need to insert "}\r\n" at byte position
// right before "\r\n// Pick 1 of 5 shells: one pearl pays".
// Find the byte offset of that comment line start.

const needle = Buffer.from('\r\n// Pick 1 of 5 shells: one pearl pays');
let pos = bytes.indexOf(needle);
if (pos === -1) {
  // fallback: search without CRLF assumption
  const needle2 = Buffer.from('// Pick 1 of 5 shells: one pearl pays');
  pos = bytes.indexOf(needle2);
  if (pos === -1) {
    console.error('Could not find insertion anchor');
    process.exit(1);
  }
}
// pos now points at '/' of the comment. Insert "}\r\n" before it.

const insert = Buffer.from('}\r\n');
const out = Buffer.concat([bytes.slice(0, pos), insert, bytes.slice(pos)]);
fs.writeFileSync(path, out);
console.log('Inserted } at byte', pos, 'file now', out.length, 'bytes');
