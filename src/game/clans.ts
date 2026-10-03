export type ClanTier = 'Crew' | 'Gang' | 'Cartel' | 'Crime Family' | 'Mafia Empire' | 'Syndicate';

export type Clan = {
  id: string;
  name: string;
  ownerId: string;
  tier: ClanTier;
  level: number;
  xp: number;
  treasury: number;
  reputation: number;
  influence: number;
  military: number;
  defense: number;
  intelligence: number;
  logistics: number;
  territory: number;
  memberCapacity: number;
  members: string[];
};

export const CLAN_TIERS: ClanTier[] = ['Crew', 'Gang', 'Cartel', 'Crime Family', 'Mafia Empire', 'Syndicate'];

export function getClanTierIndex(tier: ClanTier): number {
  return CLAN_TIERS.indexOf(tier);
}

export function createClan(id: string, name: string, ownerId: string): Clan {
  return {
    id,
    name,
    ownerId,
    tier: 'Crew',
    level: 1,
    xp: 0,
    treasury: 0,
    reputation: 0,
    influence: 0,
    military: 0,
    defense: 0,
    intelligence: 0,
    logistics: 0,
    territory: 0,
    memberCapacity: 8,
    members: [ownerId]
  };
}

export function clanXpToNextLevel(level: number): number {
  return 500 + level * 350;
}
