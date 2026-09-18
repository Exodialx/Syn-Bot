/**
 * Smoke test for the SynAI owner-tier + .synai play feature.
 * Usage: npx tsx scripts/synai-owner-smoke.ts
 * Touches the live DB (creates a test player) — restore data/syndicates.json after.
 */
import { promoteToBotOwner, isBotOwner } from '../src/game/admin.ts';
import { handleCommand } from '../src/commands/handler.ts';
import { getOrCreatePlayer } from '../src/game/player.ts';
import { liveBoostRemaining } from '../src/game/ai.ts';

const ID = '999999999';
const ADMIN = '888888888';
const meta = { isGroup: false, mentioned: [] as string[], chatJid: '' };

// 0. onboard test players (handler requires a username first)
await handleCommand(ID, '.set name TestOwner', meta);
await handleCommand(ADMIN, '.set name TestAdmin', meta);

// 1. owner promotion via .synai01
console.log('1. .synai01:', (await handleCommand(ID, '.synai01', meta)).split('\n')[0]);
console.log('   isBotOwner now:', isBotOwner(ID));

// 2. quota: owner infinite, regular admin 4/day
const owner = getOrCreatePlayer(ID);
(owner as any).isAdmin = true;
console.log('2. owner remaining:', liveBoostRemaining(owner));

// 3. owner can use ops/library/play
console.log('3. .synai library (owner):', (await handleCommand(ID, '.synai library', meta)).split('\n')[0]);

// 4. .synai play — real command execution as owner (ping = harmless, no money)
console.log('4. .synai play ping:', (await handleCommand(ID, '.synai play ping', meta)).split('\n').slice(0, 3).join(' | '));

// 5. nesting guard
console.log('5. nesting guard:', (await handleCommand(ID, '.synai play synai play ping', meta)).split('\n')[0]);

// 6. non-owner admin blocked from owner tools
await handleCommand(ADMIN, '.admin01', meta);
console.log('6. admin .synai library:', await handleCommand(ADMIN, '.synai library', meta));
console.log('   admin .synai ops:', await handleCommand(ADMIN, '.synai ops', meta));
console.log('   admin .synai play:', await handleCommand(ADMIN, '.synai play ping', meta));
const admin = getOrCreatePlayer(ADMIN);
(admin as any).isAdmin = true;
console.log('   admin boost remaining:', liveBoostRemaining(admin));

// 7. admin CAN still ask normal .synai questions (offline brain answer)
const q = await handleCommand(ADMIN, '.synai how do i deposit money', meta);
console.log('7. admin .synai question works:', q ? `yes (${q.length} chars)` : 'no');

// 8. .synai menu — owner sees everything, admin sees restricted card
console.log('8. owner .synai menu:');
console.log(await handleCommand(ID, '.synai menu', meta));
console.log('---');
console.log('8b. admin .synai menu:');
console.log(await handleCommand(ADMIN, '.synai menu', meta));

