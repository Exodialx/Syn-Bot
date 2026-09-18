/**
 * City tax system — money sink targeting transfers and business income.
 * Rates are tuned here; nothing else needs to change to adjust the economy.
 *
 * Targets (per spec):
 *   • money transfers (.pay)            → TRANSFER_TAX_RATE
 *   • business owners (.collect / .biz) → COLLECT_TAX_RATE
 *
 * Exemptions: admins pay nothing, Premium pays half. Under the transfer
 * floor, small sends stay tax-free so new players aren't nickel-and-dimed.
 * Everything collected is DESTROYED (deflationary sink) and tallied in
 * db.tax_stats for .tax / SynAI ops visibility.
 */
import { getDb, saveDb } from '../db/database.js';
import { isPremium } from './shop.js';
import type { Player } from './player.js';

export const TRANSFER_TAX_RATE = 0.03; // 3% skimmed from every .pay
export const TRANSFER_TAX_FLOOR = 1_000; // sends under this are tax-free
export const TRANSFER_TAX_CAP = 150_000; // max tax per transfer
export const PREMIUM_RATE_MULT = 0.5; // Premium pays half rates

// ── Business collect tax: progressive, hits empires hardest ──
// Bigger collections pay more, and owning lots of businesses adds a surcharge.
export const COLLECT_BRACKETS: Array<[number, number]> = [
  // [gross below, rate] — first matching bracket wins
  [25_000, 0.35],   // small collections: 35%
  [75_000, 0.4],    // 40% baseline
  [150_000, 0.45],  // big collections: 45%
  [Infinity, 0.5],  // mega collections: 50%
];
export const EMPIRE_SURCHARGE_PER_BIZ = 0.02; // +2% per business owned past the free ones
export const EMPIRE_FREE_BIZ = 3;             // first 3 businesses carry no surcharge
export const EMPIRE_SURCHARGE_CAP = 0.1;      // surcharge caps at +10%
export const COLLECT_TAX_CAP = 0.6;           // never above 60% total

// ── Other money sinks ──
export const PURCHASE_FEE_RATE = 0.05;   // 5% market registration fee on .biz buy
export const UPGRADE_DUTY_RATE = 0.05;   // 5% city stamp duty on .biz upgrade
export const CONTRACT_TAX_RATE = 0.1;    // 10% income tax on daily-contract payouts

type TaxStats = {
  transferCount: number;
  transferTotal: number;
  collectCount: number;
  collectTotal: number;
  lastAt: number;
};

function stats(): TaxStats {
  const db = getDb() as any;
  if (!db.tax_stats) db.tax_stats = { transferCount: 0, transferTotal: 0, collectCount: 0, collectTotal: 0, lastAt: 0 };
  return db.tax_stats;
}

function record(kind: 'transfer' | 'collect', amount: number): void {
  const s = stats();
  if (kind === 'transfer') {
    s.transferCount += 1;
    s.transferTotal += amount;
  } else {
    s.collectCount += 1;
    s.collectTotal += amount;
  }
  s.lastAt = Date.now();
  saveDb();
}

/** Rate this player actually pays for a given base rate (0 / half / full). */
export function effectiveRate(base: number, p: Player): number {
  if ((p as any).isAdmin) return 0;
  if (isPremium(p)) return base * PREMIUM_RATE_MULT;
  return base;
}

export type TaxResult = { tax: number; net: number; ratePct: number; exempt: boolean };

/** Tax on a .pay transfer. Below the floor it's free. */
export function applyTransferTax(from: Player, amount: number): TaxResult {
  if (amount < TRANSFER_TAX_FLOOR) return { tax: 0, net: amount, ratePct: 0, exempt: true };
  const rate = effectiveRate(TRANSFER_TAX_RATE, from);
  if (rate <= 0) return { tax: 0, net: amount, ratePct: 0, exempt: true };
  const tax = Math.min(TRANSFER_TAX_CAP, Math.max(1, Math.floor(amount * rate)));
  record('transfer', tax);
  return { tax, net: amount - tax, ratePct: Math.round(rate * 1000) / 10, exempt: false };
}

/** Rate a collect pays BEFORE premium/admin adjustment: bracket by size + empire surcharge. */
export function collectRateFor(p: Player, gross: number): number {
  let rate = 0.4;
  for (const [below, r] of COLLECT_BRACKETS) {
    if (gross < below) { rate = r; break; }
  }
  const owned = (p.businesses?.length || 0) - EMPIRE_FREE_BIZ;
  if (owned > 0) rate += Math.min(EMPIRE_SURCHARGE_CAP, owned * EMPIRE_SURCHARGE_PER_BIZ);
  return Math.min(COLLECT_TAX_CAP, rate);
}

/** Tax on business collections (targets biz owners). */
export function applyCollectTax(p: Player, gross: number): TaxResult {
  if (gross <= 0) return { tax: 0, net: gross, ratePct: 0, exempt: true };
  const base = collectRateFor(p, gross);
  const rate = effectiveRate(base, p);
  if (rate <= 0) return { tax: 0, net: gross, ratePct: 0, exempt: true };
  const tax = Math.max(1, Math.floor(gross * rate));
  record('collect', tax);
  return { tax, net: gross - tax, ratePct: Math.round(rate * 1000) / 10, exempt: false };
}

/** One-time 5% market registration fee when buying a business. */
export function applyPurchaseFee(p: Player, cost: number): TaxResult {
  const rate = effectiveRate(PURCHASE_FEE_RATE, p);
  if (rate <= 0 || cost <= 0) return { tax: 0, net: cost, ratePct: 0, exempt: true };
  const tax = Math.max(1, Math.floor(cost * rate));
  record('collect', tax);
  return { tax, net: cost + tax, ratePct: Math.round(rate * 1000) / 10, exempt: false };
}

/** One-time 5% city stamp duty when upgrading a business. */
export function applyUpgradeDuty(p: Player, cost: number): TaxResult {
  const rate = effectiveRate(UPGRADE_DUTY_RATE, p);
  if (rate <= 0 || cost <= 0) return { tax: 0, net: cost, ratePct: 0, exempt: true };
  const tax = Math.max(1, Math.floor(cost * rate));
  record('collect', tax);
  return { tax, net: cost + tax, ratePct: Math.round(rate * 1000) / 10, exempt: false };
}

/** 10% income tax on daily-contract payouts. */
export function applyContractTax(p: Player, reward: number): TaxResult {
  const rate = effectiveRate(CONTRACT_TAX_RATE, p);
  if (rate <= 0 || reward <= 0) return { tax: 0, net: reward, ratePct: 0, exempt: true };
  const tax = Math.max(1, Math.floor(reward * rate));
  record('collect', tax);
  return { tax, net: reward - tax, ratePct: Math.round(rate * 1000) / 10, exempt: false };
}

/** One-line receipt suffix — only shown when tax was actually taken. */
export function taxLine(r: TaxResult, what = 'Tax'): string {
  if (r.tax <= 0) return '';
  return `🏛️ City ${what} (${r.ratePct}%): −$${r.tax.toLocaleString()}`;
}

/** .tax — rates, exemptions and lifetime collection totals. */
export function formatTaxStatus(p?: Player): string {
  const s = stats();
  const youNote = p
    ? (p as any).isAdmin
      ? '\n▸ You are admin — exempt.'
      : isPremium(p)
        ? `\n▸ You are Premium — half rates.`
        : '\n▸ Standard rates apply to you.'
    : '';
  const total = s.transferTotal + s.collectTotal;
  const brackets = COLLECT_BRACKETS.map(([below, r], i) => {
    const from = i === 0 ? 0 : COLLECT_BRACKETS[i - 1][0];
    const to = below === Infinity ? '+' : `$${below.toLocaleString()}`;
    return `▸ Collects $${from.toLocaleString()}–${to}: ${Math.round(r * 100)}%`;
  }).join('\n');
  return `🏛️ *CITY TAX*
━━━━━━━━━━━━━━━━━━━━
▸ Transfers (.pay ≥ $${TRANSFER_TAX_FLOOR.toLocaleString()}): ${Math.round(TRANSFER_TAX_RATE * 100)}% (cap $${TRANSFER_TAX_CAP.toLocaleString()})
${brackets}
▸ Empire surcharge: +${Math.round(EMPIRE_SURCHARGE_PER_BIZ * 100)}% per biz owned past ${EMPIRE_FREE_BIZ} (max +${Math.round(EMPIRE_SURCHARGE_CAP * 100)}%)
▸ Hard cap: ${Math.round(COLLECT_TAX_CAP * 100)}%
▸ .biz buy fee: ${Math.round(PURCHASE_FEE_RATE * 100)}% · upgrade duty: ${Math.round(UPGRADE_DUTY_RATE * 100)}% · contracts: ${Math.round(CONTRACT_TAX_RATE * 100)}%
▸ Premium: half · Admins: exempt
━━━━━━━━━━━━━━━━━━━━
Collected lifetime:
▸ Transfers: $${s.transferTotal.toLocaleString()} (${s.transferCount})
▸ Business & fees: $${s.collectTotal.toLocaleString()} (${s.collectCount})
▸ Total sink: $${total.toLocaleString()}
${s.lastAt ? `▸ Last: ${new Date(s.lastAt).toLocaleString()}` : ''}${youNote}`;
}
