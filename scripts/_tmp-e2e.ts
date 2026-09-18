import { handleCommand } from '../src/commands/handler.js';
import { getOrCreatePlayer } from '../src/game/player.js';

const gid = 'tmp-e2e@g.us';
const me = '111111111111111';
const p = getOrCreatePlayer(me);
if (!p.name) { p.name = 'TmpE2E'; (p as any).registered = true; }
const meta = { isGroup: true, mentioned: [] as string[], chatJid: gid };

for (const t of ['.whatsnew', '.version', '.suggest the trading cooldown is way too long', '.suggest list', '.library', '.library suggestions']) {
  const out = await handleCommand(me, t, meta);
  console.log('\n===== ' + t + ' =====');
  console.log(out);
}

const db = (await import('../src/db/database.js')).getDb() as any;
if (db?.synaiGroups?.[gid]) { delete db.synaiGroups[gid]; console.log('\ncleaned temp group'); }
