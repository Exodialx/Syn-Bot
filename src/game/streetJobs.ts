/**
 * Repeatable street jobs — rewards cash + possible salvage + heat.
 * Uses existing Player cash/heat; does not replace .crime.
 */
import type { Player } from './player.js';
import { grantMoney } from './economy.js';
import { savePlayer } from './player.js';
import { grantSalvage } from './salvage.js';
import { addRep } from './reputation.js';
import { eventMult } from './weeklyEvents.js';
import { bumpContract } from './contracts.js';

export type StreetJob = {
  id: string;
  name: string;
  desc: string;
  reward: number;
  heat: number;
  cooldownMs: number;
  salvageChance: number;
};

export const STREET_JOBS: StreetJob[] = [
  { id: 'courier', name: 'Courier Run', desc: 'Move a sealed package across town.', reward: 4500, heat: 2, cooldownMs: 8 * 60_000, salvageChance: 0.15 },
  { id: 'smuggle', name: 'Smuggling Run', desc: 'Harbor drop under quiet lights.', reward: 9000, heat: 5, cooldownMs: 15 * 60_000, salvageChance: 0.25 },
  { id: 'recovery', name: 'Recovery Job', desc: 'Retrieve a car that “got lost”.', reward: 12000, heat: 6, cooldownMs: 20 * 60_000, salvageChance: 0.4 },
  { id: 'protection', name: 'Protection Shift', desc: 'Stand outside a front for an hour.', reward: 7000, heat: 3, cooldownMs: 12 * 60_000, salvageChance: 0.1 },
  { id: 'delivery', name: 'High-Risk Delivery', desc: 'One bag. No questions. No stops.', reward: 16000, heat: 8, cooldownMs: 25 * 60_000, salvageChance: 0.35 },
];

function cdMap(p: Player): Record<string, number> {
  if (!(p as any).streetJobCd) (p as any).streetJobCd = {};
  return (p as any).streetJobCd;
}

export function formatStreetJobs(p: Player): string {
  const cds = cdMap(p);
  const now = Date.now();
  const lines = ['🔫 *STREET JOBS*', '━━━━━━━━━━━━━━━━━━━━'];
  for (const j of STREET_JOBS) {
    const left = (cds[j.id] || 0) - now;
    const cd = left > 0 ? ` · ⏳ ${Math.ceil(left / 60000)}m` : '';
    lines.push(`· *${j.name}* — $${j.reward.toLocaleString()} · heat +${j.heat}${cd}`);
  }
  lines.push('', '▸ `.streetjob <name>` e.g. `.streetjob courier`');
  return lines.join('\n');
}

export function runStreetJob(p: Player, query: string): string {
  const q = query.trim().toLowerCase();
  const job = STREET_JOBS.find(
    (j) => j.id === q || j.name.toLowerCase().includes(q) || q.includes(j.id)
  );
  if (!job) return '⚠️ Unknown job. `.streetjob` for the list.';

  const cds = cdMap(p);
  const now = Date.now();
  if ((cds[job.id] || 0) > now) {
    const m = Math.ceil(((cds[job.id] || 0) - now) / 60000);
    return `⏳ ${job.name} cooling down — ${m}m left.`;
  }

  cds[job.id] = now + job.cooldownMs;
  p.heat = Math.min(100, (p.heat || 0) + job.heat);
  grantMoney({
    player: p,
    amount: Math.floor(job.reward * eventMult('street')),
    source: 'STREET_JOB',
    reason: job.name,
    metadata: { jobId: job.id },
  });

  let salvageLine = '';
  if (Math.random() < job.salvageChance) {
    const rare = Math.random() < 0.2;
    grantSalvage(p, rare ? 'rare' : 'common', 1);
    salvageLine = rare ? '\n🔧 Rare salvage recovered.' : '\n🔧 Common part recovered.';
  }
  try {
    addRep(p, 2, 'streetjob');
  } catch {}
  savePlayer(p);

  let extra = '';
  try {
    const n = bumpContract(p, 'street');
    if (n) extra = '\n' + n;
  } catch {}
  const paid = Math.floor(job.reward * eventMult('street'));
  return [
    `🔫 *${job.name.toUpperCase()}*`,
    job.desc,
    `+$${paid.toLocaleString()} · heat +${job.heat}`,
    salvageLine,
    extra,
  ]
    .filter(Boolean)
    .join('\n');
}
