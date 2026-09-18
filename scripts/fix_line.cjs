const fs = require('fs');
const f = 'c:\\Users\\merco\\OneDrive\\Desktop\\syn0.0.90\\src\\game\\fisch.ts';
let c = fs.readFileSync(f, 'utf8');
let lines = c.split('\n');
lines[608] = '  return `${inZone ? \'Standard pull!\' : \'Slipped away\'}\\n\\n${renderReelBar(session, fish)}`;';
fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('Fixed:', lines[608]);