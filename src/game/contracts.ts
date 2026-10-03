/**
 * Limited contracts that bridge systems (business, fisch, crime, vehicles).
 */
import type { Player } from './player.js';
import { grantMoney } from './economy.js';
import { savePlayer } from './player.js';
import { addRep, getRep } from './reputation.js';
import { grantSalvage } from './salvage.js';

export type ContractDef = {
  id: string;
  name: string;
  desc: string;
  /** goal units */
  goal: number;
  reward: number;
  repReward: number;
  kind: 'collect' | 'fish' | 'crime' | 'street';
  minRep: number;
};

const CATALOG: ContractDef[] = [
  { id: 'biz-3', name: 'Business Contract', desc: 'Complete 3 business collections.', goal: 3, reward: 25000, repReward: 5, kind: 'collect', minRep: 0 },
  { id: 'fish-5', name: 'FISCH Contract', desc: 'Land 5 catches (any).', goal: 5, reward: 18000, repReward: 5, kind: 'fish', minRep: 0 },
  { id: 'street-2', name: 'Street Contract', desc: 'Finish 2 street jobs.', goal: 2, reward: 22000, repReward: 6, kind: 'street', minRep: 0 },
  { id: 'crime-3', name: 'Crime Contract', desc: 'Commit 3 crimes (.crime).', goal: 3, reward: 30000, repReward: 8, kind: 'crime', minRep: 100 },
];

type Progress = { id: string; progress: number; claimed: boolean };

function state(p: Player): { active: Progress | null; completed: string[] } {
  if (!(p as any).contracts) (p as any).contracts = { active: null, completed: [] };
  return (p as any).contracts;
}

export function formatContracts(p: Player): string {
  const st = state(p);
  const rep = getRep(p);
  const lines = ['💼 *CONTRACTS*', '━━━━━━━━━━━━━━━━━━━━'];
  if (st.active) {
    const def = CATALOG.find((c) => c.id === st.active!.id);
    if (def) {
      lines.push(
        `Active: *${def.name}*`,
        `${st.active.progress}/${def.goal} · reward $${def.reward.toLocaleString()}`,
        ''
      );
    }
  } else {
    lines.push('No active contract.', '');
  }
  for (const c of CATALOG) {
    if (st.completed.includes(c.id)) continue;
    if (rep < c.minRep) {
      lines.push(`· 🔒 ${c.name} (need rep ${c.minRep})`);
      continue;
    }
    lines.push(`· *${c.name}* — ${c.desc}`);
  }
  lines.push('', '▸ `.contract take <name>` · `.contract` status');
  return lines.join('\n');
}

export function takeContract(p: Player, query: string): string {
  const st = state(p);
  if (st.active) return '⚠️ Finish or abandon your current contract first.';
  const q = query.toLowerCase();
  const def = CATALOG.find(
    (c) => c.id.includes(q) || c.name.toLowerCase().includes(q) || c.kind === q
  );
  if (!def) return '⚠️ Contract not found.';
  if (getRep(p) < def.minRep) return `⚠️ Need reputation ${def.minRep}.`;
  st.active = { id: def.id, progress: 0, claimed: false };
  savePlayer(p);
  return `💼 Contract accepted: *${def.name}*\n${def.desc}\nGoal: ${def.goal}`;
}

/** Progress hook — call from collect / fish / crime / streetjob */
export function bumpContract(p: Player, kind: ContractDef['kind']): string | null {
  const st = state(p);
  if (!st.active) return null;
  const def = CATALOG.find((c) => c.id === st.active!.id);
  if (!def || def.kind !== kind) return null;
  if (st.active.claimed) return null;
  st.active.progress += 1;
  if (st.active.progress >= def.goal) {
    st.active.claimed = true;
    st.completed.push(def.id);
    st.active = null;
    grantMoney({
      player: p,
      amount: def.reward,
      source: 'CONTRACT',
      reason: def.name,
      metadata: { contractId: def.id },
    });
    addRep(p, def.repReward, 'contract');
    grantSalvage(p, 'common', 1);
    savePlayer(p);
    return `💼 *CONTRACT COMPLETE* — ${def.name}\n+$${def.reward.toLocaleString()} · +${def.repReward} rep`;
  }
  savePlayer(p);
  return null;
}

export function abandonContract(p: Player): string {
  const st = state(p);
  if (!st.active) return 'No active contract.';
  st.active = null;
  savePlayer(p);
  return 'Contract abandoned.';
}
