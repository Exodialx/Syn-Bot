import { readFileSync, writeFileSync } from 'fs';

const path = 'src/game/fisch.ts';
const src = readFileSync(path, 'utf8');
const lines = src.split('\n');

// Parse state
let inTemplate = false;
let templateOpenLine = 0;
let templateOpenCol = 0;
let templateLines = [];

// We track: are we inside a template literal?
// Strategy: count backticks, but account for the fact that
// a line may have multiple backticks (e.g. `\`${x}\``).
// Simplest robust approach: walk char by char.

let i = 0;
let ch = '';
let pos = 0;
const len = src.length;
let lineNo = 1;
let colNo = 1;

function next(): string | null {
  if (pos >= len) return null;
  const c = src[pos];
  pos++;
  if (c === '\n') { lineNo++; colNo = 1; }
  else colNo++;
  return c;
}

function peek(): string | null {
  return pos < len ? src[pos] : null;
}

// Find all backtick positions
const backtickPositions: { line: number; col: number; index: number }[] = [];
pos = 0; lineNo = 1; colNo = 1;
while (pos < len) {
  const c = src[pos];
  if (c === '\n') { lineNo++; colNo = 1; pos++; continue; }
  if (c === '`') {
    backtickPositions.push({ line: lineNo, col: colNo, index: pos });
  }
  pos++;
  colNo++;
}

// Now find unmatched backtick pairs.
// A template literal starts with a backtick and ends with the NEXT backtick
// that isn't escaped. Inside a template, \` is escaped.
// Simple approach: walk through backtick positions, toggling in/out,
// but skip a backtick if preceded by odd number of backslashes.

let inTpl = false;
let tplStart: { line: number; col: number } | null = null;
const unmatched: { line: number; col: number; index: number }[] = [];

for (let bi = 0; bi < backtickPositions.length; bi++) {
  const bt = backtickPositions[bi];
  // Check if preceded by odd backslashes
  let backslashes = 0;
  let idx = bt.index - 1;
  while (idx >= 0 && src[idx] === '\\') { backslashes++; idx--; }
  if (backslashes % 2 === 1) {
    // escaped backtick - ignore
    continue;
  }
  if (!inTpl) {
    inTpl = true;
    tplStart = { line: bt.line, col: bt.col };
  } else {
    inTpl = false;
    tplStart = null;
  }
}

// Any remaining inTpl means unclosed template
if (inTpl && tplStart) {
  console.log('UNCLOSED TEMPLATE LITERAL');
  console.log('Opens at line', tplStart.line, 'col', tplStart.col);
  // Print context around the open
  const openIdx = backtickPositions.find(b => b.line === tplStart.line && b.col === tplStart.col)!.index;
  const before = src.slice(Math.max(0, openIdx - 200), openIdx + 1);
  const afterStart = openIdx + 1;
  const after = src.slice(afterStart, Math.min(len, afterStart + 600));
  console.log('--- 200 chars before opening backtick ---');
  console.log(before);
  console.log('--- 600 chars after opening backtick (looking for where it SHOULD close) ---');
  console.log(after);
  console.log('---');
  console.log(`File has ${backtickPositions.length} total backticks at ${backtickPositions.map(b => b.line + ':' + b.col).join(', ')}`);
}

// Also check brace/paren balance ignoring string contents
let brace = 0, paren = 0, bracket = 0;
let inSingle = false, inDouble = false, inTemplate2 = false;
let escape = false;
pos = 0;
while (pos < len) {
  const c = src[pos];
  const nextC = pos + 1 < len ? src[pos + 1] : null;
  
  if (escape) { escape = false; pos++; continue; }
  
  if (inTemplate2) {
    if (c === '\\') { escape = true; pos++; continue; }
    if (c === '`') { inTemplate2 = false; }
    pos++; continue;
  }
  
  if (inSingle) {
    if (c === '\\') { escape = true; pos++; continue; }
    if (c === "'") { inSingle = false; }
    pos++; continue;
  }
  
  if (inDouble) {
    if (c === '\\') { escape = true; pos++; continue; }
    if (c === '"') { inDouble = false; }
    pos++; continue;
  }
  
  if (c === "'") { inSingle = true; pos++; continue; }
  if (c === '"') { inDouble = true; pos++; continue; }
  if (c === '`') { inTemplate2 = true; pos++; continue; }
  
  if (c === '{') brace++;
  else if (c === '}') brace--;
  else if (c === '(') paren++;
  else if (c === ')') paren--;
  else if (c === '[') bracket++;
  else if (c === ']') bracket--;
  
  pos++;
}

console.log('--- SYNTAX BALANCE (ignoring strings) ---');
console.log('brace =', brace, '(negative = extra close, positive = unclosed)');
console.log('paren =', paren);
console.log('bracket =', bracket);

// Find the line of the first unbalanced closing
if (brace < 0 || paren < 0 || bracket < 0) {
  // Re-scan to find where balance goes negative
  let b2 = 0, p2 = 0, br2 = 0;
  let inS = false, inD = false, inT = false, esc = false;
  pos = 0; lineNo = 1;
  while (pos < len) {
    const c = src[pos];
    const nl = c === '\n';
    if (nl) { lineNo++; pos++; continue; }
    
    if (esc) { esc = false; pos++; continue; }
    if (inT) { if (c === '\\') esc = true; else if (c === '`') inT = false; pos++; continue; }
    if (inS) { if (c === '\\') esc = true; else if (c === "'") inS = false; pos++; continue; }
    if (inD) { if (c === '\\') esc = true; else if (c === '"') inD = false; pos++; continue; }
    
    if (c === "'") { inS = true; }
    else if (c === '"') { inD = true; }
    else if (c === '`') { inT = true; }
    else if (c === '{') b2++;
    else if (c === '}') { b2--; if (b2 < 0) console.log('Extra } at line', lineNo); }
    else if (c === '(') p2++;
    else if (c === ')') { p2--; if (p2 < 0) console.log('Extra ) at line', lineNo); }
    else if (c === '[') br2++;
    else if (c === ']') { br2--; if (br2 < 0) console.log('Extra ] at line', lineNo); }
    
    pos++;
  }
}
