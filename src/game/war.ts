import type { Player } from './player.js';
import { grantMoney } from './economy.js';
import { grantXp } from './progression.js';

export type WarObjective = {
  id: string;
  name: string;
  reward: number;
};

export const WAR_OBJECTIVES: WarObjective[] = [
  { id: 'financial-district', name: 'Financial District', reward: 150000 },
  { id: 'harbor', name: 'Harbor', reward: 120000 },
  { id: 'industrial-zone', name: 'Industrial Zone', reward: 130000 },
  { id: 'luxury-district', name: 'Luxury District', reward: 170000 },
  { id: 'downtown', name: 'Downtown', reward: 160000 },
  { id: 'transport-hub', name: 'Transport Hub', reward: 140000 }
];

export type WarStatus = {
  active: boolean;
  objectiveId: string;
  score: Record<string, number>;
  startedAt: number;
};

export function createWarState(): WarStatus {
  return {
    active: true,
    objectiveId: 'downtown',
    score: { attacker: 0, defender: 0 },
    startedAt: Date.now()
  };
}

export function getWarObjectiveById(id?: string): WarObjective | undefined {
  if (!id) return WAR_OBJECTIVES[0];
  const normalized = id.toLowerCase();
  return WAR_OBJECTIVES.find(objective => objective.id.toLowerCase() === normalized || objective.name.toLowerCase().includes(normalized));
}

export function resolveWarAttack(player: Player, objectiveId?: string): { success: boolean; objectiveId: string; objectiveName: string; reward: number; xpGranted: number; message: string; score: Record<string, number> } {
  const objective = getWarObjectiveById(objectiveId) ?? WAR_OBJECTIVES[0];
  const status = createWarState();
  status.objectiveId = objective.id;

  const attackStrength = Math.max(1, (player.level + player.classLevel + player.stats.wars + player.heat) * 8);
  const defenseStrength = Math.max(1, (player.level * 3) + (player.wanted || 0));
  const success = attackStrength > defenseStrength;

  if (success) {
    const reward = objective.reward;
    const xpGranted = 250 + Math.max(0, Math.round(player.level * 12));
    grantMoney({
      player,
      amount: reward,
      source: 'REWARD',
      reason: `War objective captured: ${objective.name}`,
      metadata: { objectiveId: objective.id, objectiveName: objective.name, war: true }
    });
    grantXp(player, xpGranted, 'WAR', `war-capture:${player.id}:${objective.id}`);
    player.stats.wars = (player.stats.wars ?? 0) + 1;
    status.score.attacker = Math.max(status.score.attacker, 1);
    status.score.defender = 0;
    return {
      success: true,
      objectiveId: objective.id,
      objectiveName: objective.name,
      reward,
      xpGranted,
      score: status.score,
      message: `⚔️ Frontline secured. Objective: ${objective.name} captured. Reward: $${reward.toLocaleString()} and +${xpGranted} XP.`
    };
  }

  status.score.attacker = 0;
  status.score.defender = Math.max(status.score.defender, 1);
  return {
    success: false,
    objectiveId: objective.id,
    objectiveName: objective.name,
    reward: 0,
    xpGranted: 0,
    score: status.score,
    message: `⚔️ Frontline lost near ${objective.name}. The objective remains contested. Regroup and try again.`
  };
}
