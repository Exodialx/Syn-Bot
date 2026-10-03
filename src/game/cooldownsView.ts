import { Player } from './player.js';

function fmt(msLeft: number): string {
  if (msLeft <= 0) return '✅';
  const s = Math.ceil(msLeft / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.ceil(s / 60)}m`;
}

/** Compact half-message cooldowns board */
export function formatCooldowns(p: Player): string {
  const now = Date.now();
  const robCd = 15 * 60 * 1000;
  const raidCd = 15 * 60 * 1000;
  const hitCd = 15 * 60 * 1000;
  const collectCd = 30 * 60 * 1000;

  const lastRob = p.lastRob || 0;
  const lastRaid = p.lastRaid || 0;
  const lastHit = p.lastHit || 0;
  const lastCollect = (p as any).lastCollect || 0;
  const lastDaily = (p as any).lastDaily as string | undefined;
  const today = new Date();
  const dayKey = `${today.getUTCFullYear()}-${today.getUTCMonth() + 1}-${today.getUTCDate()}`;
  const dailyReady = lastDaily !== dayKey;
  const revenge = (p as any).revengeToken && (!(p as any).revengeUntil || now < (p as any).revengeUntil);

  const jail = p.inPrison && now < p.prisonUntil
    ? ` · 🔒${Math.ceil((p.prisonUntil - now) / 60000)}m`
    : '';

  return `🧭 *CD*${jail}
━━━━━━━━━━━━━━━━━━━━
Rob ${fmt(robCd - (now - lastRob))} · Raid ${fmt(raidCd - (now - lastRaid))} · Hit ${fmt(hitCd - (now - lastHit))}
Collect ${fmt(collectCd - (now - lastCollect))} · Daily ${dailyReady ? '✅' : '❌'}${revenge ? ' · 🩸 Revenge ✅' : ''}
━━━━━━━━━━━━━━━━━━━━
🔥${p.heat}  🚨${p.wanted}`;
}

/** One-line CD strip to append under timed actions */
export function cdStrip(p: Player): string {
  return `\n${formatCooldowns(p)}`;
}
