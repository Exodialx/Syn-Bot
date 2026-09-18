import { formatPlatformMenu, formatConfigureStatus, configureGroup } from '../src/game/platform.js';
import { getOrCreatePlayer } from '../src/game/player.js';

const p = getOrCreatePlayer('111111111111111');
if (!p.name) { p.name = 'TmpE2E'; (p as any).registered = true; }

// DM jid → unlocked catalog view (shows module badges)
console.log('===== CATALOG (unlocked) =====');
console.log(formatPlatformMenu(p, '9999999999@s.whatsapp.net'));

const gid = 'tmp-plat@g.us';
console.log('\n===== configure unc =====');
console.log(configureGroup(gid, '111111111111111', ['unc']));
console.log('\n===== configure status =====');
console.log(formatConfigureStatus(gid));

const db = (await import('../src/db/database.js')).getDb() as any;
if (db?.platformGroups?.[gid]) { delete db.platformGroups[gid]; console.log('\ncleaned temp platform group'); }
