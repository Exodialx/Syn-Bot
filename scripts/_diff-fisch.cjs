const fs = require('fs');
const a = fs.readFileSync('_head_fisch.ts', 'utf8').split(/\r?\n/);
const b = fs.readFileSync('_fisch_fixed_preview.ts', 'utf8').split(/\r?\n/);
console.log('HEAD lines', a.length, '| WORK lines', b.length);

// crude LCS-free diff: walk with lookahead resync
let i = 0, j = 0;
let hunks = 0;
while (i < a.length || j < b.length) {
  if (a[i] === b[j]) { i++; j++; continue; }
  // find resync
  let ai = -1, bj = -1;
  for (let k = 1; k < 60; k++) {
    if (i + k < a.length && a[i + k] === b[j]) { ai = i + k; bj = j; break; }
    if (j + k < b.length && b[j + k] === a[i]) { ai = i; bj = j + k; break; }
  }
  if (ai < 0) { ai = Math.min(i + 1, a.length); bj = Math.min(j + 1, b.length); }
  hunks++;
  console.log('\n--- HUNK ' + hunks + ' @HEAD' + (i + 1) + ' ---');
  for (let k = i; k < ai; k++) console.log('- ' + a[k]);
  for (let k = j; k < bj; k++) console.log('+ ' + b[k]);
  i = ai; j = bj;
  if (hunks > 40) { console.log('...truncated'); break; }
}
console.log('\ntotal hunks', hunks);