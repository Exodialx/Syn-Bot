import { Player, savePlayer, addXp, addClassXp, resolveExistingPlayerId, getOrCreatePlayer } from './player.js';
import { flagBloodDebt } from './classSystems.js';
import { gearBonuses, isPremium, getItem, hasItem } from './shop.js';
import { estimateBizCycleIncome } from './businesses.js';
import { guardDefense } from './guards.js';
import { addCityHeat, personalHeatGainMult, isLockdown, isHeatBlocked, maybeRaidCheck } from './city.js';
import { hospitalBlock, damageHeart, heartsBar, getHearts } from './health.js';
import { tryGiftbox } from './events.js';

const PVP_COOLDOWN = 15 * 60 * 1000;
const ROB_COOLDOWN = PVP_COOLDOWN;
const RAID_COOLDOWN = 30 * 60 * 1000; // 30 minutes
const CASH_FLOOR = 2000; // can't rob below this

function grantRevengeToken(victim: Player, robberId: string) {
  const v = victim as any;
  v.revengeToken = true;
  v.revengeTargetId = robberId;
  v.revengeUntil = Date.now() + 6 * 60 * 60 * 1000; // 6h window
}

function findTarget(raw: string): Player | null {
  // accept full id or last 6-8 digits
  const cleaned = raw.replace(/[^0-9]/g, '');
  if (!cleaned) return null;
  // try exact
  try {
    return getOrCreatePlayer(cleaned);
  } catch {
    return null;
  }
}

export function robPlayer(attacker: Player, targetRaw: string, opts?: { revenge?: boolean }): string {
  const hosp = hospitalBlock(attacker);
  if (hosp) return hosp;
  if (attacker.inPrison && Date.now() < attacker.prisonUntil) {
    return '◆ You are in prison.';
  }
  if (isHeatBlocked(attacker.heat || 0) && !opts?.revenge) {
    return '🔥 Heat critical (90+). Lay low — .rob blocked.\n.news · .cd · deposit small amounts';
  }

  const now = Date.now();
  const revenge = !!opts?.revenge;
  if (!revenge && now - attacker.lastRob < ROB_COOLDOWN) {
    const left = Math.ceil((ROB_COOLDOWN - (now - attacker.lastRob)) / 60000);
    return `⏳ Robbery cooldown: ~${left}m left\n💡 Got robbed? .revenge once`;
  }

  const resolved = resolveExistingPlayerId(targetRaw);
  if (!resolved.ok) return resolved.error;
  if (resolved.id === attacker.id) return '❌ You cannot rob yourself.';
  const target = resolved.player;
  if (target.banned) return '❌ Target is banned.';
  if (isPremium(target)) return '⭐ Target has Premium — immune to .rob';
  if (target.cash <= CASH_FLOOR) return '❌ Target is too broke to rob.';

  // roll — weapons for Mafia/Hitman, bodyguards+money for Businessman defense
  const atkGear = gearBonuses(attacker);
  const defGear = gearBonuses(target);
  const guards = target.role === 'Businessman' ? guardDefense(target) : 0;
  const moneyWall = target.role === 'Businessman' ? Math.min(25, Math.floor(target.cash / 20000)) : 0;
  let atkPower = attacker.strength + attacker.stealth + attacker.level * 1.4
    + atkGear.atk * 2.4 + atkGear.stealth * 0.8
    + (attacker.role === 'Mafia' ? 10 : 0) + (attacker.role === 'Hitman' ? 7 : 0);
  const defPower = target.defense + target.security + target.level * 1.2
    + defGear.def * 2.5 + guards + moneyWall
    + (target.role === 'Businessman' ? 8 : 0);
  // revenge is riskier — lower effective atk
  if (revenge) atkPower *= 0.72;
  const roll = Math.random() * 100 + atkPower * 0.8;
  const need = (revenge ? 52 : 40) + defPower * 0.55;
  const success = roll >= need;

  if (!revenge) attacker.lastRob = now;
  attacker.heat = Math.min(100, attacker.heat + (success ? (revenge ? 14 : 10) : (revenge ? 24 : 18)));

  if (success) {
    const maxSteal = Math.floor(target.cash * (revenge ? 0.22 : 0.18));
    const stolen = Math.min(maxSteal, Math.floor(3000 + Math.random() * 12000 + attacker.level * 200));
    const actual = Math.min(stolen, target.cash - CASH_FLOOR);
    target.cash -= actual;
    attacker.cash += actual;
    const notes = addXp(attacker, 80 + Math.floor(actual / 500));
    if (attacker.role === 'Mafia') notes.push(...addClassXp(attacker, 40, 'rob'));
    addCityHeat(4, revenge ? 'Revenge robbery reported' : 'Street robbery reported');
    grantRevengeToken(target, attacker.id);
    flagBloodDebt(target, attacker.id);

    let retal = '';
    try {
      const eq = ((target as any).equipped || {}) as any;
      let weaponId = eq.weapon || null;
      if (!weaponId) {
        const invList = ((target as any).inventory || []) as string[];
        for (const id of invList) {
          const it = getItem(id);
          if (it?.slot === 'weapon') { weaponId = id; break; }
        }
      }
      if (weaponId) {
        const w = getItem(weaponId);
        const wName = w?.name || String(weaponId);
        const chance = Math.min(0.65, 0.2 + ((w?.atk || 5) * 0.018));
        if (Math.random() < chance) {
          const dmg = damageHeart(attacker, 'shot by ' + wName);
          retal = '\n🔫 *' + wName + '* — shot you during the rob!\n' + dmg.msg;
        }
      }
      if (eq.armor) {
        const a = getItem(eq.armor);
        if (a) retal += '\n🦺 Target armor: ' + a.name + ' (harder steal)';
      }
    } catch {}
    savePlayer(attacker);
    savePlayer(target);
    flagBloodDebt(target, attacker.id);

    const raid = maybeRaidCheck(attacker as any, now);
    if (raid) savePlayer(attacker);

    return withGift(attacker, 'rob', `${revenge ? '🩸 *REVENGE — SUCCESS*' : '⚡ *ROBBERY — SUCCESS*'}
━━━━━━━━━━━━━━━━━━━━
Target: ${target.name || '...' + target.id.slice(-6)}
Stole: $${actual.toLocaleString()}
🔥 Heat +${revenge ? 14 : 10} → ${attacker.heat}
${notes.join('\n')}${retal || ''}${raid ? '\n' + raid : ''}`.trim());
  }

  // fail
  const fine = Math.floor(attacker.cash * (revenge ? 0.09 : 0.05));
  attacker.cash = Math.max(0, attacker.cash - fine);
  attacker.wanted = Math.min(100, attacker.wanted + (revenge ? 12 : 8));
  if (Math.random() < (revenge ? 0.28 : 0.15)) {
    attacker.inPrison = true;
    attacker.prisonUntil = now + (revenge ? 12 : 8) * 60 * 1000;
  }
  savePlayer(attacker);

  return `${revenge ? '🩸 *REVENGE — FAILED*' : '🦴 *ROBBERY — FAILED*'}
━━━━━━━━━━━━━━━━━━━━
Target defended.
💸 Fine: $${fine.toLocaleString()}
🔥 Heat up  🚨 Wanted up
${attacker.inPrison ? '◆ Arrested\n💡 .work  ·  .bail  ·  .escape' : ''}`.trim();
}

/** Spend revenge token — ignore rob CD, harder odds */
export function revengeRob(attacker: Player, targetRaw?: string): string {
  const a = attacker as any;
  const now = Date.now();
  if (!a.revengeToken || (a.revengeUntil && now > a.revengeUntil)) {
    a.revengeToken = false;
    a.revengeTargetId = null;
    return '❌ No revenge token.\nGet robbed successfully → unlock .revenge (6h window)';
  }
  const raw = targetRaw || a.revengeTargetId;
  if (!raw) return 'Usage: .revenge  (targets who robbed you) or .revenge <@/num>';
  // consume token up front
  a.revengeToken = false;
  const savedTarget = a.revengeTargetId;
  a.revengeTargetId = null;
  a.revengeUntil = 0;
  const result = robPlayer(attacker, String(raw || savedTarget), { revenge: true });
  if (result.startsWith('❌') || result.startsWith('⭐') || result.startsWith('◆')) {
    // refund token if target invalid
    a.revengeToken = true;
    a.revengeTargetId = savedTarget;
    a.revengeUntil = now + 6 * 60 * 60 * 1000;
    savePlayer(attacker);
  }
  return result;
}

export function raidPlayer(attacker: Player, targetRaw: string): string {
  const hosp = hospitalBlock(attacker);
  if (hosp) return hosp;
  if (attacker.inPrison && Date.now() < attacker.prisonUntil) {
    return '◆ You are in prison.';
  }

  const now = Date.now();
  if (now - attacker.lastRaid < RAID_COOLDOWN) {
    const left = Math.ceil((RAID_COOLDOWN - (now - attacker.lastRaid)) / 60000);
    return `⏳ Raid cooldown: ~${left}m left`;
  }

  const resolved = resolveExistingPlayerId(targetRaw);
  if (!resolved.ok) return resolved.error;
  if (resolved.id === attacker.id) return '❌ You cannot raid yourself.';
  const target = resolved.player;
  if (!target.businesses.length) return '❌ Target has no businesses to raid.';

  const atkGear = gearBonuses(attacker);
  const defGear = gearBonuses(target);
  const guards = target.role === 'Businessman' ? guardDefense(target) : 0;
  const atk = attacker.strength + attacker.stealth + attacker.level + atkGear.atk + (attacker.role === 'Mafia' ? 12 : 0);
  const def = target.security + target.defense + target.businesses.length * 3 + defGear.def + guards + (target.role === 'Businessman' ? 10 : 0);
  const success = Math.random() * 100 + atk * 0.5 >= 45 + def * 0.4;

  attacker.lastRaid = now;
  attacker.heat = Math.min(100, attacker.heat + (success ? 16 : 25));

  if (success) {
    const payout = 8000 + Math.floor(Math.random() * 25000) + attacker.level * 400;
    // damage one business income flavor
    target.cash = Math.max(CASH_FLOOR, target.cash - Math.floor(payout * 0.4));
    attacker.cash += payout;
    const notes = addXp(attacker, 120);
    addCityHeat(7, 'Business raid reported');
    savePlayer(attacker);
    savePlayer(target);

    return withGift(attacker, 'raid', `🔱 *RAID — SUCCESS*
━━━━━━━━━━━━━━━━━━━━
Hit ...${target.id.slice(-6)}'s operations
Loot: $${payout.toLocaleString()}
🔥 Heat +16 → ${attacker.heat}
${notes.join('\n')}`.trim());
  }

  attacker.wanted = Math.min(100, attacker.wanted + 12);
  const loss = Math.floor(attacker.cash * 0.07);
  attacker.cash = Math.max(0, attacker.cash - loss);
  savePlayer(attacker);

  return `💀 *RAID — FAILED*
━━━━━━━━━━━━━━━━━━━━
Security held. You got burned.
💸 -$${loss.toLocaleString()}
🔥 Heat +25  🚨 Wanted +12`;
}

/** Hitman contract-style hit */
/** Hitman contract-style hit — damages hearts; 0 → hospitalized */
export function hitPlayer(attacker: Player, targetRaw: string): string {
  const hosp = hospitalBlock(attacker);
  if (hosp) return hosp;
  if (attacker.inPrison && Date.now() < attacker.prisonUntil) return '◆ In prison.';

  const now = Date.now();
  if (now - (attacker.lastHit || 0) < PVP_COOLDOWN) {
    const left = Math.ceil((PVP_COOLDOWN - (now - (attacker.lastHit || 0))) / 60000);
    return `⏳ Hit cooldown: ~${left}m left`;
  }

  const resolved = resolveExistingPlayerId(targetRaw);
  if (!resolved.ok) return resolved.error;
  if (resolved.id === attacker.id) return '❌ You cannot hit yourself.';
  const target = resolved.player;
  if (hospitalBlock(target)) return '❌ Target is hospitalized.';

  const targetWanted = (target.wanted || 0) >= 15;
  const isAssassin = attacker.role === 'Hitman' || attacker.role === 'Mafia';
  if (!isAssassin && !targetWanted) {
    return '❌ Only Hitman/Mafia can .hit — unless the target is *wanted* (15+).';
  }
  const atkGear = gearBonuses(attacker);
  const defGear = gearBonuses(target);
  const guards = target.role === 'Businessman' ? guardDefense(target) : 0;
  const atk = attacker.stealth * 1.2 + attacker.strength + attacker.level * 1.5 + atkGear.atk * 2.5 + atkGear.stealth * 0.5 + (attacker.role === 'Hitman' ? 18 : 6);
  const pierce = attacker.role === 'Hitman' ? (target.defense + defGear.def) * 0.4 : 0;
  const def = target.defense + target.security + target.level * 1.2 + defGear.def * 2.2 + guards * 0.5 - pierce;
  const success = Math.random() * 100 + atk >= 50 + def * 0.7;

  attacker.lastHit = now;
  attacker.heat = Math.min(100, attacker.heat + (success ? 20 : 30));

  if (success) {
    const bounty = 15000 + attacker.level * 800 + Math.floor(Math.random() * 20000);
    attacker.cash += bounty;
    target.heat = Math.min(100, target.heat + 15);
    const dmg = damageHeart(target, 'hit contract');
    const notes = addXp(attacker, 200);
    if (attacker.role === 'Hitman') notes.push(...addClassXp(attacker, 80, 'hit'));
    addCityHeat(9, 'Contract hit shook the streets');
    savePlayer(attacker);
    savePlayer(target);

    return withGift(attacker, 'hit', `🦅 *HIT — SUCCESSFUL*
━━━━━━━━━━━━━━━━━━━━
Target took a heart.
${dmg.msg}
💰 Bounty $${bounty.toLocaleString()}
🔥 Heat +20 → ${attacker.heat}
${notes.join('\n')}`.trim());
  }

  attacker.wanted = Math.min(100, attacker.wanted + 15);
  if (Math.random() < 0.25) {
    attacker.inPrison = true;
    attacker.prisonUntil = now + 12 * 60 * 1000;
  }
  savePlayer(attacker);

  return `🐍 *HIT — FAILED*
━━━━━━━━━━━━━━━━━━━━
Target escaped / security held.
🔥 Heat +30  🚨 Wanted +15
${attacker.inPrison ? '◆ Arrested (12 min)\n💡 .work  ·  .bail  ·  .escape' : ''}`.trim();
}




/** Businessman-only: skim half of target biz cycle income from cash+bank (5h CD) */
export function launderPlayer(attacker: Player, targetRaw: string): string {
  const hosp = hospitalBlock(attacker);
  if (hosp) return hosp;
  if (attacker.role !== 'Businessman') {
    return '❌ .launder is *Businessman* only.\nMafia use .rob · Hitman use .hit';
  }
  if (attacker.inPrison && Date.now() < attacker.prisonUntil) return '◆ In prison.';

  const CD = 5 * 60 * 60 * 1000;
  const now = Date.now();
  const last = (attacker as any).lastLaunder || 0;
  if (now - last < CD) {
    const left = ((CD - (now - last)) / 3_600_000).toFixed(1);
    return `⏳ Launder cooldown: ${left}h (5h)`;
  }

  const resolved = resolveExistingPlayerId(targetRaw);
  if (!resolved.ok) return resolved.error;
  if (resolved.id === attacker.id) return '❌ Cannot launder yourself.';
  const target = resolved.player;
  if (target.banned) return '❌ Target banned.';
  if (!target.businesses?.length) return '❌ Target has no businesses to skim.';

  const cycle = estimateBizCycleIncome(target);
  const skim = Math.floor(cycle * 0.5);
  if (skim < 5000) {
    return `❌ Target cycle income too low (half = $${skim.toLocaleString()}).\nNeed a richer empire.`;
  }

  const atk =
    attacker.charisma * 1.3 +
    attacker.intelligence * 1.2 +
    attacker.level * 1.3 +
    attacker.classLevel * 4 +
    (attacker.security || 0) * 0.3;
  const def =
    target.security * 1.5 +
    target.defense * 0.7 +
    target.businesses.length * 2.5 +
    target.level * 1.0 +
    ((target as any).guards?.length || 0) * 3;
  const roll = Math.random() * 100 + atk * 0.75;
  const need = 36 + def * 0.45;

  (attacker as any).lastLaunder = now;

  if (roll < need) {
    attacker.heat = Math.min(100, attacker.heat + 14);
    attacker.wanted = Math.min(100, attacker.wanted + 8);
    savePlayer(attacker);
    return `📉 *LAUNDER FAILED*
━━━━━━━━━━━━━━━━━━━━
Auditors caught the paper trail.
🔥 Heat +14 · 🚨 Wanted +8
⏳ 5h cooldown started`;
  }

  let left = skim;
  const fromCash = Math.min(Math.max(0, target.cash || 0), left);
  target.cash = Math.max(0, (target.cash || 0) - fromCash);
  left -= fromCash;
  const fromBank = Math.min(Math.max(0, target.bank || 0), left);
  target.bank = Math.max(0, (target.bank || 0) - fromBank);
  left -= fromBank;
  const actual = skim - left;

  if (actual < 1000) {
    savePlayer(attacker);
    return '❌ Target has almost no cash/bank to pull. Cooldown started.';
  }

  attacker.cash += actual;
  attacker.heat = Math.min(100, attacker.heat + 9);
  (target as any).raidDebuffUntil = Math.max((target as any).raidDebuffUntil || 0, now + 5 * 60 * 60 * 1000);
  (target as any).lastLaunderedBy = attacker.id;
  (target as any).lastLaunderedAt = now;

  const notes = addXp(attacker, 100 + Math.floor(actual / 800));
  if (attacker.role === 'Businessman') notes.push(...addClassXp(attacker, 50 + Math.floor(actual / 2000), 'launder'));
  addCityHeat(5, 'Corporate laundering exposed');
  savePlayer(attacker);
  savePlayer(target);

  return withGift(attacker, 'launder', `💼 *LAUNDER SUCCESS*
━━━━━━━━━━━━━━━━━━━━
Target: ${target.name || '...' + target.id.slice(-6)}
Empire half-cycle: $${skim.toLocaleString()}
💰 Skimmed $${actual.toLocaleString()}
   cash −$${fromCash.toLocaleString()} · bank −$${fromBank.toLocaleString()}
🔥 Heat +9 → ${attacker.heat}
⏳ Next .launder in 5h
${notes.join('\n')}`.trim());
}


function withGift(p: Player, source: string, msg: string): string {
  const g = tryGiftbox(p, source);
  return g ? msg + '\n\n' + g : msg;
}
