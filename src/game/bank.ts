import { Player, savePlayer } from './player.js';
import { resolveExistingPlayerId } from './player.js';
import { addCityHeat, personalHeatGainMult, isLockdown, depositLimitForHeat } from './city.js';
import { isPremium } from './shop.js';

const BANK_ROB_COOLDOWN = 15 * 60 * 1000;

export function deposit(p: Player, amount: number | string): string {
  if (amount === 'all' || amount === -1) amount = p.cash;
  amount = Number(amount);
  if (!amount || amount <= 0) return '❌ Usage: .deposit <amount|all>';
  if (amount > p.cash) return `❌ Only have $${p.cash.toLocaleString()} cash`;
  const lim = depositLimitForHeat(p.heat || 0);
  if (lim > 0 && amount > lim) {
    return `🔥 Too hot to move large cash.\nMax deposit now $${lim.toLocaleString()} (heat ${p.heat})\nCool off or split deposits.`;
  }
  p.cash -= amount;
  p.bank += amount;
  savePlayer(p);
  const heatNote = lim > 0 ? `\n⚠️ Heat deposit cap $${lim.toLocaleString()}` : '';
  return `🏦 Deposited $${amount.toLocaleString()}
💰 Cash $${p.cash.toLocaleString()}
🏦 Bank $${p.bank.toLocaleString()}${heatNote}`;
}

export function withdraw(p: Player, amount: number | string): string {
  if (amount === 'all' || amount === -1) amount = p.bank;
  amount = Number(amount);
  if (!amount || amount <= 0) return '❌ Usage: .withdraw <amount|all>';
  if (amount > p.bank) return `❌ Only $${p.bank.toLocaleString()} in bank`;
  p.bank -= amount;
  p.cash += amount;
  savePlayer(p);
  return `🏦 Withdrew $${amount.toLocaleString()}
💰 Cash $${p.cash.toLocaleString()}
🏦 Bank $${p.bank.toLocaleString()}`;
}

export function bankStatus(p: Player, targetRaw?: string): string {
  if (targetRaw && String(targetRaw).trim()) {
    const resolved = resolveExistingPlayerId(targetRaw);
    if (!resolved.ok) return resolved.error;
    const t = resolved.player;
    const name = (t as any).usernameSet && t.name ? t.name : `…${t.id.slice(-4)}`;
    return `🏛️ *BANK LOOKUP*
━━━━━━━━━━━━━━━━━━━━
👤 ${name}
💰 Cash   $${t.cash.toLocaleString()}
🏦 Bank   $${t.bank.toLocaleString()}
━━━━━━━━━━━━━━━━━━━━
.brob @${name} — try their vault`;
  }

  const lim = depositLimitForHeat(p.heat || 0);
  const cap = lim > 0 ? `\n🔥 Deposit cap $${lim.toLocaleString()} (heat)` : '';
  return `🏛️ *BANK*
━━━━━━━━━━━━━━━━━━━━
💰 Cash   $${p.cash.toLocaleString()}
🏦 Bank   $${p.bank.toLocaleString()}${cap}

.deposit <amt>  .withdraw <amt>
.bank @player — peek their bank
.brob <number> — rob their bank`;
}

/** Rob money from another player's BANK (not cash) */
export function bankRob(attacker: Player, targetRaw: string): string {
  if (attacker.inPrison && Date.now() < attacker.prisonUntil) return '◆ In prison';
  if (isLockdown()) return '🚨 Lockdown — bank jobs frozen. .news';
  if ((attacker.heat || 0) >= 90) return '🔥 Heat critical — .brob blocked. Lay low.';

  const now = Date.now();
  if (now - (attacker.lastRob || 0) < BANK_ROB_COOLDOWN) {
    const left = Math.ceil((BANK_ROB_COOLDOWN - (now - attacker.lastRob)) / 60000);
    return `⏳ Bank rob cooldown ~${left}m`;
  }

  const resolved = resolveExistingPlayerId(targetRaw);
  if (!resolved.ok) return resolved.error;
  if (resolved.id === attacker.id) return '❌ Cannot brob yourself.';
  const target = resolved.player;
  if (isPremium(target)) return '⭐ Target has Premium — immune to .brob';
  if (target.bank < 5000) return '❌ Target bank too empty (min $5,000)';

  const atk = attacker.stealth * 1.3 + attacker.intelligence + attacker.level + (attacker.role === 'Hitman' ? 10 : 0) + (attacker.role === 'Mafia' ? 6 : 0);
  const def = target.security * 1.4 + target.defense + (target.role === 'Businessman' ? 12 : 0);
  const success = Math.random() * 100 + atk * 0.6 >= 48 + def * 0.5;

  attacker.lastRob = now;
  const heatGain = Math.floor(22 * personalHeatGainMult());
  attacker.heat = Math.min(100, attacker.heat + heatGain);

  if (success) {
    const maxSteal = Math.floor(target.bank * 0.22);
    const stolen = Math.min(maxSteal, 8000 + Math.floor(Math.random() * 25000) + attacker.level * 300);
    const actual = Math.min(stolen, target.bank);
    target.bank -= actual;
    attacker.cash += actual; // dirty cash out
    addCityHeat(8, 'Bank breach reported');
    savePlayer(attacker);
    savePlayer(target);
    return `⚜️ *BANK ROB — SUCCESS*
━━━━━━━━━━━━━━━━━━━━
💰 Lifted $${actual.toLocaleString()} from vault
Target bank left $${target.bank.toLocaleString()}
🔥 Heat +${heatGain} → ${attacker.heat}
💰 Cash $${attacker.cash.toLocaleString()}`;
  }

  attacker.wanted = Math.min(100, attacker.wanted + 14);
  const fine = Math.floor(attacker.cash * 0.08);
  attacker.cash = Math.max(0, attacker.cash - fine);
  if (Math.random() < 0.28) {
    attacker.inPrison = true;
    attacker.prisonUntil = now + 15 * 60 * 1000;
  }
  addCityHeat(5, 'Failed bank robbery');
  savePlayer(attacker);
  return `🕯️ *BANK ROB — FAILED*
━━━━━━━━━━━━━━━━━━━━
Vault held. Cameras got you.
💸 Fine $${fine.toLocaleString()}
🔥 Heat +${heatGain}  🚨 Wanted +14
${attacker.inPrison ? '◆ Arrested 15 min\n💡 .work  ·  .bail  ·  .escape' : ''}`;
}
