export type QuestType = 'Main' | 'Side' | 'Business' | 'Clan' | 'Hitman' | 'Mafia' | 'Crime' | 'Property' | 'Market' | 'Exploration' | 'Achievement';

export type Quest = {
  id: string;
  title: string;
  type: QuestType;
  objective: string;
  rewardXp: number;
  rewardCash: number;
  requiredLevel: number;
};

export const QUEST_CATALOG: Quest[] = [
  { id: 'first-business', title: 'First Business', type: 'Business', objective: 'Purchase your first business.', rewardXp: 250, rewardCash: 5000, requiredLevel: 1 },
  { id: 'street-ops', title: 'Street Ops', type: 'Crime', objective: 'Complete one profitable criminal operation.', rewardXp: 350, rewardCash: 7000, requiredLevel: 2 },
  { id: 'mini-empire', title: 'Mini Empire', type: 'Business', objective: 'Own 3 businesses.', rewardXp: 700, rewardCash: 12000, requiredLevel: 4 },
  { id: 'crew-assembler', title: 'Crew Assembler', type: 'Clan', objective: 'Join or create a clan.', rewardXp: 900, rewardCash: 18000, requiredLevel: 10 },
  { id: 'property-mogul', title: 'Property Mogul', type: 'Property', objective: 'Own 2 properties.', rewardXp: 1200, rewardCash: 25000, requiredLevel: 15 },
  { id: 'market-runner', title: 'Market Runner', type: 'Market', objective: 'Execute a market trade.', rewardXp: 800, rewardCash: 15000, requiredLevel: 12 },
  { id: 'ghost-run', title: 'Ghost Run', type: 'Hitman', objective: 'Complete a hit contract.', rewardXp: 2000, rewardCash: 30000, requiredLevel: 20 },
  { id: 'territory-push', title: 'Territory Push', type: 'Clan', objective: 'Capture a territory.', rewardXp: 2200, rewardCash: 35000, requiredLevel: 30 },
  { id: 'syndicate-aura', title: 'Syndicate Aura', type: 'Achievement', objective: 'Reach level 50 and prepare for syndicate warfare.', rewardXp: 5000, rewardCash: 100000, requiredLevel: 50 }
];

export function getQuestById(id: string): Quest | undefined {
  return QUEST_CATALOG.find(quest => quest.id === id);
}
