import { readFileSync } from 'fs';

// Character-by-character scanner: finds first unclosed template literal,
// or first unexpected close, or reports unclosed braces/parens/brackets at EOF.
const src = readFileSync('src/game/fisch.ts', 'utf8');
const N = src.length;

let i = 0, line = 1, col = 1;
let inS = false, inD = false, inT = false, te = 0; // template expr depth
let brace = 0, paren = 0, brkt = 0;
let bCmt = false, lCmt = false;
let tOpenLine = -1, tOpenCol = -1;
let firstErr = null;

function err(msg) {
  if (!firstErr) firstErr = { line, col, msg };
  console.log(`L${line}:C${col}  ${msg}`);
}

while (i < N) {
  const c = src[i], n = src[i + 1];

  if (c === '\n') { line++; col = 1; i++; continue; }

  if (bCmt) {
    if (c === '*' && n === '/') { bCmt = false; i += 2; col += 2; }
    else { i++; col++; }
    continue;
  }
  if (lCmt) {
    if (c === '\n') lCmt = false;
    i++; col++; continue;
  }

  // comment starts — only outside strings AND template bodies
  if (!inS && !inD && !inT) {
    if (c === '/' && n === '/') { lCmt = true; i += 2; col += 2; continue; }
    if (c === '/' && n === '*') { bCmt = true; i += 2; col += 2; continue; }
  }

  // escape — skip next char in any string or template
  if ((inS || inD || inT) && c === '\\') { i += 2; col += 2; continue; }

  // ${ inside template — opens nested expression
  if (c === '$' && n === '{' && inT) { te++; i += 2; col += 2; continue; }

  // backtick
  if (c === '`') {
    if (inT && te === 0) {
      // close template
      inT = false;
      te = 0;
    } else if (!inS && !inD) {
      // open template
      inT = true;
      te = 0;
      tOpenLine = line;
      tOpenCol = col;
    }
    i++; col++; continue;
  }

  // single quote
  if (c === "'" && !inD && !inT) { inS = !inS; i++; col++; continue; }

  // double quote
  if (c === '"' && !inS && !inT) { inD = !inD; i++; col++; continue; }

  // braces / parens / brackets — only outside strings
  if (!inS && !inD) {
    if (c === '{') {
      if (!(inT && te === 0)) brace++; // literal in template body → skip
    } else if (c === '}') {
      if (inT && te > 0) {
        if (brace > 0) brace--;
        else te--;
      } else if (!inT) {
        brace--;
        if (brace < 0) err(`Unexpected } — brace balance now ${brace}`);
      }
      // in template body → literal, skip
    } else if (c === '(') {
      paren++;
    } else if (c === ')') {
      paren--;
      if (paren < 0) err(`Unexpected ) — paren balance now ${paren}`);
    } else if (c === '[') {
      brkt++;
    } else if (c === ']') {
      brkt--;
      if (brkt < 0) err(`Unexpected ] — bracket balance now ${brkt}`);
    }
  }

  i++; col++;
}

console.log('=== SYNTAX SCAN: src/game/fisch.ts ===');
console.log(`Scanned ${N} chars across ${line} lines`);
console.log('');
console.log('Final state:');
console.log(`  inSingle:       ${inS}`);
console.log(`  inDouble:       ${inD}`);
console.log(`  inTemplate:     ${inT}  (tmplExpr depth: ${te})`);
console.log(`  brace balance:  ${brace}`);
console.log(`  paren balance:  ${paren}`);
console.log(`  bracket balance: ${brkt}`);
console.log('');

if (firstErr) {
  console.log(`FIRST ERROR: ${firstErr.msg}`);
  console.log(`  At line ${firstErr.line}, col ${firstErr.col}`);
} else {
  console.log('No unexpected closes detected during scan.');
}

if (inT) {
  console.log('');
  console.log(`!! UNCLOSED TEMPLATE LITERAL !!`);
  console.log(`  Opened at line ${tOpenLine}, col ${tOpenCol}`);
  console.log(`  Still open at EOF (line ${line}).`);
  console.log(`  Template expression nesting depth at EOF: ${te}`);
  const ls = src.split('\n');
  if (tOpenLine > 0 && tOpenLine <= ls.length) {
    console.log(`  Opening line content: ${ls[tOpenLine - 1].trim().slice(0, 200)}`);
  }
  // show context around open
  const ctxStart = Math.max(0, tOpenLine - 4);
  const ctxEnd = Math.min(ls.length, tOpenLine + 40);
  console.log(`  Context (L${tOpenLine} ±):`);
  for (let li = ctxStart; li < ctxEnd; li++) {
    const mark = li === tOpenLine - 1 ? '>>> ' : '    ';
    console.log(`${mark}L${li + 1}: ${ls[li].trim().slice(0, 130)}`);
  }
  // also show last few lines of file
  console.log(`  Last 5 lines of file:`);
  for (let li = Math.max(0, ls.length - 5); li < ls.length; li++) {
    console.log(`    L${li + 1}: ${ls[li].trim().slice(0, 130)}`);
  }
}

if (brace > 0) console.log(`\n!! UNCLOSED BRACES: ${brace} still open at EOF.`);
if (paren > 0) console.log(`\n!! UNCLOSED PARENS: ${paren} still open at EOF.`);
if (brkt > 0) console.log(`\n!! UNCLOSED BRACKETS: ${brkt} still open at EOF.`);
