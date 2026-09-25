import { readFileSync } from 'fs';

const path = 'src/game/fisch.ts';
const src = readFileSync(path, 'utf8');
const len = src.length;

// Track balance, find FIRST line where it goes wrong
let brace = 0, paren = 0, brkt = 0;
let inS = false, inD = false, inT = false, esc = false;
let pos = 0;
let lineNo = 1;
let firstBadBraceLine = 0;
let firstBadParenLine = 0;
let firstBadBrktLine = 0;

while (pos < len) {
  const c = src[pos];
  if (esc) { esc = false; pos++; continue; }
  if (inT) { if (c === '\\') esc = true; else if (c === '`') inT = false; pos++; if (c === '\n') lineNo++; continue; }
  if (inS) { if (c === '\\') esc = true; else if (c === "'") inS = false; pos++; if (c === '\n') lineNo++; continue; }
  if (inD) { if (c === '\\') esc = true; else if (c === '"') inD = false; pos++; if (c === '\n') lineNo++; continue; }
  
  if (c === "'") inS = true;
  else if (c === '"') inD = true;
  else if (c === '`') inT = true;
  else if (c === '{') brace++;
  else if (c === '}') {
    brace--;
    if (brace < 0 && firstBadBraceLine === 0) firstBadBraceLine = lineNo;
  }
  else if (c === '(') paren++;
  else if (c === ')') {
    paren--;
    if (paren < 0 && firstBadParenLine === 0) firstBadParenLine = lineNo;
  }
  else if (c === '[') brkt++;
  else if (c === ']') {
    brkt--;
    if (brkt < 0 && firstBadBrktLine === 0) firstBadBrktLine = lineNo;
  }
  if (c === '\n') lineNo++;
  pos++;
}

console.log('FIRST bad brace (extra }): line', firstBadBraceLine);
console.log('FIRST bad paren (extra )): line', firstBadParenLine);
console.log('FIRST bad bracket (extra ]): line', firstBadBrktLine);
console.log('Final: brace=', brace, 'paren=', paren, 'bracket=', brkt);

// Print the line where first bad brace occurs, with context
if (firstBadBraceLine > 0) {
  const lines = src.split('\n');
  const idx = firstBadBraceLine - 1;
  console.log('\n--- Context around line', firstBadBraceLine, '---');
  const start = Math.max(0, idx - 15);
  const end = Math.min(lines.length, idx + 5);
  for (let i = start; i < end; i++) {
    const marker = i === idx ? '>>> ' : '    ';
    console.log(marker + (i+1) + ' | ' + lines[i]);
  }
}

if (firstBadParenLine > 0) {
  const lines = src.split('\n');
  const idx = firstBadParenLine - 1;
  console.log('\n--- Context around line', firstBadParenLine, '(first extra )) ---');
  const start = Math.max(0, idx - 15);
  const end = Math.min(lines.length, idx + 5);
  for (let i = start; i < end; i++) {
    const marker = i === idx ? '>>> ' : '    ';
    console.log(marker + (i+1) + ' | ' + lines[i]);
  }
}
