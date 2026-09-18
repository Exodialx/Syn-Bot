const fs = require('fs');
const p = 'src/game/fisch.ts';
let s = fs.readFileSync(p, 'utf8');

function sub(find, repl, label) {
  if (!s.includes(find)) { console.log('MISS: ' + label); return; }
  s = s.replace(find, repl);
  console.log('ok: ' + label);
}

// 1. Catch report — strip the heavy box + emoji wall
sub(
  `  return [
    '╔══════════════════════════════╗',
    '║      🎣 CATCH REPORT       ║',
    '╠══════════════════════════════╣',
    \`║ \${fish.emoji} \${fish.name}\`,
    \`║ ⭐ \${fish.rarity}\`,
    \`║ ⚖️ \${weight} kg\`,
    \`║ 💰 +\${value.toLocaleString()} gold\`,
    \`║ 📈 +\${xp} XP\`,
    \`║ 🎣 Fishing XP +\${xp}\`,
    '║ 🌊 The sea remembers you.',
    '╚══════════════════════════════╝',
  ].join('\\n') + flourish + perfectLine + luckyLine + recordLine + streakLine;`,
  `  const line = '━'.repeat(18);
  return [
    '🎣 *CATCH*',
    line,
    \`\${fish.emoji} \${fish.name}\`,
    \`\${fish.rarity}  ·  \${weight} kg\`,
    \`+\${value.toLocaleString()} gold  ·  +\${xp} XP (Fishing +\${xp})\`,
    line,
  ].join('\\n') + flourish + perfectLine + luckyLine + recordLine + streakLine;`,
  'catch report'
);

// 2. Bite message — calmer
sub(
  `  return \`🎣 *You've got a bite!*\${dailyBonusLine}\\n\\n\${renderReelBar(session, fish)}\`;`,
  `  return \`⚡ *Something took the bait*\${dailyBonusLine}\\n\\n\${renderReelBar(session, fish)}\`;`,
  'bite message'
);

// 3. Escape — one line, less noise
sub(
  `  return \`🎣💨 *The line snaps — it's gone.*\\n\${fish.emoji} The \${fish.name} slips back into the water.\\n📈 +15 XP · +15 Fishing XP (consolation)\`;`,
  `  return \`The line snaps — it's gone.\\n\${fish.emoji} The \${fish.name} slips back into the water.\\n+15 XP · +15 Fishing XP\`;`,
  'escape text'
);

// 4. Flourish / bonuses — trim emoji stacks
sub(`const flourish = bigCatch ? \`\\n🎉🎉🎉 *\${fish.rarity.toUpperCase()} CATCH!!!* 🎉🎉🎉\` : '';`,
    `const flourish = bigCatch ? \`\\n🎉 *\${fish.rarity.toUpperCase()} CATCH* 🎉\` : '';`,
    'flourish');
sub(`const perfectLine = perfect ? \`\\n✨ *PERFECT REEL!* Not a single miss — bonus gold & XP.\` : '';`,
    `const perfectLine = perfect ? \`\\n✦ *PERFECT REEL* — no misses, bonus gold & XP\` : '';`,
    'perfect line');
sub(`const recordLine = isRecord ? \`\\n🏆 *NEW PERSONAL BEST WEIGHT!*\` : '';`,
    `const recordLine = isRecord ? \`\\n*Personal best weight*\` : '';`,
    'record line');
sub(`const streakLine = p.streak >= 3 ? \`\\n🔥 Streak: \${p.streak} (+\${Math.min(p.streak, 20) * 2}% value) · don't break it!\` : '';`,
    `const streakLine = p.streak >= 3 ? \`\\nStreak x\${p.streak} (+\${Math.min(p.streak, 20) * 2}% value)\` : '';`,
    'streak line');
sub(`const luckyLine = session.isLucky ? \`\\n🍀 *A lucky bite you shouldn't have hooked yet!*\` : '';`,
    `const luckyLine = session.isLucky ? \`\\nLucky bite — hooked early\` : '';`,
    'lucky line');

fs.writeFileSync(p, s);
console.log('written');
