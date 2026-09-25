const fs = require('fs');
const path = 'src/game/fisch.ts';
let bytes = fs.readFileSync(path);

// Insert "}" before the "// Pick 1 of 5 shells" comment to close mgAnchorToss.
const needle = Buffer.from('// Pick 1 of 5 shells: one pearl pays');
let pos = bytes.indexOf(needle);
if (pos === -1) {
  console.error('Could not find insertion anchor');
  process.exit(1);
}
// Insert }\r\n (CRLF, matches file line endings) right before the comment.
const insert = Buffer.from('}\r\n');
const out = Buffer.concat([bytes.slice(0, pos), insert, bytes.slice(pos)]);
fs.writeFileSync(path, out);
console.log('Inserted } before byte', pos, 'file now', out.length, 'bytes');
