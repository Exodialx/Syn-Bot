import { tryGiftbox } from './events.js';
/**
 * .battle — turn-based street fight
 * Actions: strike | heavy | aim | guard | special
 * Gear, level, class, streaks matter.
 */
import { Player, savePlayer, resolveExistingPlayerId, getPlayer } from './player.js';
import { gearBonuses, getItem, ensureInv } from './shop.js';
import { damageHeart, hospitalBlock, heartsBar } from './health.js';
import { getDb, saveDb } from '../db/database.js';

const MAX_BET = 100_000;
const MAX_ROUNDS = 12; // full rounds (both act)

type Action = 'strike' | 'heavy' | 'aim' | 'guard' | 'special';

type Battle = {
  id: string;
  a: string;
  b: string;
  bet: number;
  turn: string;
  round: number;
  hpA: number;
  hpB: number;
  guardA: boolean;
  guardB: boolean;
  aimA: number;
  aimB: number;
  log: string[];
  status: 'pending' | 'active' | 'done';
  created: number;
};

function battles(): Record<string, Battle> {
  const db = getDb() as any;
  if (!db.battles) db.battles = {};
  return db.battles as Record<string, Battle>;
}

function streak(p: Player): number {
  return Math.max(0, (p as any).killStreak || 0);
}

function setStreak(p: Player, n: number) {
  (p as any).killStreak = Math.max(0, n);
}

function maxHp(p: Player): number {
  // Level dominates so L32 >> L10
  return 80 + p.level * 6 + p.classLevel * 8 + Math.floor(p.strength * 1.5);
}

function weaponOf(p: Player): { id: string; name: string; atk: number; icon: string } {
  const inv = ensureInv(p);
  const id = inv.equipped.weapon;
  if (id) {
    const it = getItem(id);
    if (it) return { id: it.id, name: it.name, atk: it.atk || 4, icon: it.icon };
  }
  // inventory fallback
  for (const wid of inv.inventory) {
    const it = getItem(wid);
    if (it?.slot === 'weapon') return { id: it.id, name: it.name, atk: it.atk || 4, icon: it.icon };
  }
  return { id: 'fists', name: 'Fists', atk: 2, icon: '👊' };
}

function armorOf(p: Player): number {
  return gearBonuses(p).def;
}

function basePower(p: Player): number {
  const g = gearBonuses(p);
  const w = weaponOf(p);
  let atk =
    p.level * 2.2 +
    p.classLevel * 3 +
    p.strength * 1.5 +
    p.stealth * 0.4 +
    w.atk * 2.2 +
    g.atk * 1.5 +
    g.stealth * 0.4;
  if (p.role === 'Hitman') atk += 10 + w.atk * 0.3;
  if (p.role === 'Mafia') atk += 12;
  if (p.role === 'Businessman') atk += 4;
  atk += Math.min(20, streak(p) * 3); // kill streak bonus
  return Math.max(10, atk);
}

function baseDef(p: Player): number {
  const g = gearBonuses(p);
  return p.level * 1.1 + p.defense * 1.3 + p.security * 0.7 + g.def * 2 + (p.role === 'Businessman' ? 10 : 0);
}

export function battleChallenge(p: Player, targetRaw: string, amountRaw: string): string {
  const hosp = hospitalBlock(p);
  if (hosp) return hosp;
  const amount = parseInt(String(amountRaw).replace(/[^0-9]/g, ''), 10);
  if (!amount || amount < 1000) return 'Usage: .battle @player <amount> (min $1k · max $100k)';
  if (amount > MAX_BET) return `❌ Max bet $${MAX_BET.toLocaleString()}`;
  if (p.cash < amount) return '❌ Not enough cash';
  const resolved = resolveExistingPlayerId(targetRaw);
  if (!resolved.ok) return resolved.error;
  if (resolved.id === p.id) return '❌ No.';
  const t = resolved.player;
  if (hospitalBlock(t)) return '❌ They are hospitalized.';
  if (t.cash < amount) return '❌ Opponent cannot cover the bet';

  const all = battles();
  for (const id of Object.keys(all)) {
    const b = all[id];
    if (b.status === 'pending' && Date.now() - b.created > 10 * 60_000) delete all[id];
  }
  if (Object.values(all).some(b => b.status !== 'done' && (b.a === p.id || b.b === p.id))) {
    return '❌ You already have an open battle.';
  }

  const id = `bt${Date.now().toString(36)}`;
  all[id] = {
    id, a: p.id, b: t.id, bet: amount, turn: t.id, round: 0,
    hpA: maxHp(p), hpB: maxHp(t), guardA: false, guardB: false,
    aimA: 0, aimB: 0, log: [], status: 'pending', created: Date.now()
  };
  saveDb();
  const wa = weaponOf(p);
  const wb = weaponOf(t);
  return `⚔️ *BATTLE CHALLENGE*
━━━━━━━━━━━━━━━━━━━━
${p.name || 'You'} ${wa.icon}${wa.name}  Lv${p.level}
    vs
${t.name || t.id.slice(-4)} ${wb.icon}${wb.name}  Lv${t.level}
💰 $${amount.toLocaleString()} each · pot $${(amount * 2).toLocaleString()}
🔥 Streaks: you ${streak(p)} · them ${streak(t)}
━━━━━━━━━━━━━━━━━━━━
${t.name || 'Them'}: *.battle accept* or *.battle decline*`;
}

export function battleRespond(p: Player, accept: boolean): string {
  const all = battles();
  const b = Object.values(all).find(x => x.status === 'pending' && x.b === p.id);
  if (!b) return '❌ No pending challenge for you.';
  if (!accept) {
    b.status = 'done';
    saveDb();
    return '🚫 Declined.';
  }
  const a = getPlayer(b.a);
  const bb = getPlayer(b.b);
  if (!a || !bb) { b.status = 'done'; saveDb(); return '❌ Challenger gone.'; }
  if (a.cash < b.bet || bb.cash < b.bet) {
    b.status = 'done'; saveDb(); return '❌ Someone cannot cover the bet.';
  }
  a.cash -= b.bet;
  bb.cash -= b.bet;
  savePlayer(a); savePlayer(bb);
  b.status = 'active';
  b.turn = b.a;
  b.round = 1;
  b.hpA = maxHp(a);
  b.hpB = maxHp(bb);
  b.log = ['🔔 FIGHT — choose your move'];
  saveDb();
  return render(b, a, bb) + `\n${a.name || 'A'} acts first:\n` + movesHelp();
}

function movesHelp(): string {
  return `▸ *.battle strike*  — solid hit
▸ *.battle heavy*   — big damage, can miss
▸ *.battle aim*     — next strike hits harder
▸ *.battle guard*   — block next hit
▸ *.battle special* — weapon finisher`;
}

function bar(hp: number, max: number): string {
  const n = Math.max(0, Math.min(12, Math.round((hp / Math.max(1, max)) * 12)));
  return '█'.repeat(n) + '░'.repeat(12 - n);
}

function render(b: Battle, a: Player, bb: Player): string {
  const wa = weaponOf(a);
  const wb = weaponOf(bb);
  return `⚔️ *STREET FIGHT*  R${b.round}/${MAX_ROUNDS}
━━━━━━━━━━━━━━━━━━━━
${a.name || 'A'} Lv${a.level} ${heartsBar(a)} 🔥${streak(a)}
${wa.icon} ${wa.name}
[${bar(b.hpA, maxHp(a))}] ${Math.max(0, Math.floor(b.hpA))} HP
          ⚔
${bb.name || 'B'} Lv${bb.level} ${heartsBar(bb)} 🔥${streak(bb)}
${wb.icon} ${wb.name}
[${bar(b.hpB, maxHp(bb))}] ${Math.max(0, Math.floor(b.hpB))} HP
━━━━━━━━━━━━━━━━━━━━
💰 Pot $${(b.bet * 2).toLocaleString()}
${b.log.slice(-5).join('\n')}`;
}

function applyAction(b: Battle, me: Player, foe: Player, action: Action, isA: boolean): string {
  const myGuard = isA ? 'guardA' : 'guardB';
  const foeGuard = isA ? 'guardB' : 'guardA';
  const myAim = isA ? 'aimA' : 'aimB';
  const foeHp = isA ? 'hpB' : 'hpA';
  const w = weaponOf(me);
  let msg = '';

  // clear own guard after it was set last turn — guard lasts one enemy hit
  if (action === 'guard') {
    (b as any)[myGuard] = true;
    msg = `🛡️ ${me.name || 'Fighter'} guards`;
    return msg;
  }

  if (action === 'aim') {
    (b as any)[myAim] = Math.min(2, ((b as any)[myAim] || 0) + 1);
    msg = `🎯 ${me.name || 'Fighter'} aims (${(b as any)[myAim]})`;
    return msg;
  }

  let mult = 1;
  let missChance = 0.08;
  if (action === 'heavy') { mult = 1.75; missChance = 0.22; }
  if (action === 'special') { mult = 1.35 + w.atk * 0.02; missChance = 0.12; }

  if (Math.random() < missChance) {
    msg = `💨 ${me.name || 'Fighter'} missed (${action})`;
    (b as any)[myAim] = 0;
    return msg;
  }

  let dmg = basePower(me) * mult * (0.75 + Math.random() * 0.45);
  dmg -= baseDef(foe) * 0.35;
  if ((b as any)[myAim] > 0) {
    dmg *= 1 + 0.35 * (b as any)[myAim];
    (b as any)[myAim] = 0;
  }
  if ((b as any)[foeGuard]) {
    dmg *= 0.4;
    (b as any)[foeGuard] = false;
    msg = `🛡️ blocked · `;
  }
  dmg = Math.max(4, Math.floor(dmg));
  if (action === 'special') {
    dmg = Math.floor(dmg * 1.15);
    msg += `${w.icon} SPECIAL ${w.name} −${dmg}`;
  } else if (action === 'heavy') {
    msg += `💥 HEAVY ${w.icon} −${dmg}`;
  } else {
    msg += `${w.icon} strike −${dmg}`;
  }
  (b as any)[foeHp] = Math.max(0, (b as any)[foeHp] - dmg);
  return `${me.name || 'Fighter'}: ${msg}`;
}

export function battleAct(p: Player, actionRaw: string): string {
  const hosp = hospitalBlock(p);
  if (hosp) return hosp;
  const action = (actionRaw || 'strike').toLowerCase() as Action;
  if (!['strike', 'heavy', 'aim', 'guard', 'special'].includes(action)) {
    return 'Moves: strike · heavy · aim · guard · special';
  }
  const all = battles();
  const b = Object.values(all).find(x => x.status === 'active' && (x.a === p.id || x.b === p.id));
  if (!b) return '❌ No active battle.';
  if (b.turn !== p.id) return '⏳ Not your turn.';

  const a = getPlayer(b.a)!;
  const bb = getPlayer(b.b)!;
  const isA = p.id === b.a;
  const me = isA ? a : bb;
  const foe = isA ? bb : a;

  const line = applyAction(b, me, foe, action, isA);
  b.log.push(line);

  // KO?
  if (b.hpA <= 0 || b.hpB <= 0) {
    return finish(b, a, bb);
  }

  // swap turn
  b.turn = foe.id;
  if (!isA) b.round += 1;
  if (b.round > MAX_ROUNDS) {
    return finish(b, a, bb);
  }
  saveDb();
  return render(b, a, bb) + `\n👉 ${foe.name || 'Opponent'} — your move\n` + movesHelp();
}

/** Back-compat: .battle strike */
export function battleStrike(p: Player): string {
  return battleAct(p, 'strike');
}

function finish(b: Battle, a: Player, bb: Player): string {
  b.status = 'done';
  const aWin = b.hpA >= b.hpB;
  const winner = aWin ? a : bb;
  const loser = aWin ? bb : a;
  winner.cash += b.bet * 2;
  const __gift = tryGiftbox(winner, 'battle');
  setStreak(winner, streak(winner) + 1);
  setStreak(loser, 0);
  const dmgH = damageHeart(loser, 'battle loss');
  savePlayer(winner);
  savePlayer(loser);
  saveDb();
  return (
    render(b, a, bb) +
    `\n━━━━━━━━━━━━━━━━━━━━
🏆 *${winner.name || 'Winner'}*  🔥 streak ${streak(winner)}
💰 +$${(b.bet * 2).toLocaleString()}
💔 ${loser.name || 'Loser'}: ${dmgH.msg}` +
    (__gift ? '\n\n' + __gift : '')
  );
}

export function battleStatus(p: Player): string {
  const all = battles();
  const b = Object.values(all).find(x => x.status !== 'done' && (x.a === p.id || x.b === p.id));
  if (!b) return '❌ No open battle. .battle @user <amt>';
  const a = getPlayer(b.a);
  const bb = getPlayer(b.b);
  if (!a || !bb) return '❌ Broken battle.';
  if (b.status === 'pending') return `Pending vs ${bb.name || bb.id.slice(-4)}`;
  return render(b, a, bb) + '\n' + movesHelp();
}
