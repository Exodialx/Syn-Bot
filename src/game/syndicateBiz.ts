/**
 * Syndicate Biz — 40 elite-tier businesses ($200M–$1B).
 * Claim cycle: 70 hours. Separate from normal .biz / .collect.
 * Command: .syndicate biz | .synbiz | .sbiz
 */
import { Player, savePlayer } from './player.js';
import { chargeMoney, grantMoney } from './economy.js';
import { grantXp } from './progression.js';

export const SYN_BIZ_CLAIM_CD = 70 * 60 * 60 * 1000; // 70 hours

export type SynBizDef = {
  id: string;
  name: string;
  icon: string;
  cost: number;
  baseIncome: number; // per claim cycle
  minLevel: number;
  desc: string;
};

export const SYN_BIZ_CATALOG: SynBizDef[] = [
  { id: 'sb-sovereign-vault', name: 'Sovereign Vault', icon: '🏛️', cost: 200_000_000, baseIncome: 4_200_000, minLevel: 50, desc: 'A fortified reserve bank for off-grid wealth storage.' },
  { id: 'sb-ghost-exchange', name: 'Ghost Exchange', icon: '👻', cost: 220_000_000, baseIncome: 4_600_000, minLevel: 50, desc: 'A shadow trading desk that moves money without a trace.' },
  { id: 'sb-black-airfield', name: 'Black Airfield', icon: '✈️', cost: 240_000_000, baseIncome: 5_000_000, minLevel: 52, desc: 'Unlisted runway for high-value cargo and personnel.' },
  { id: 'sb-dark-harbor', name: 'Dark Harbor', icon: '⚓', cost: 260_000_000, baseIncome: 5_400_000, minLevel: 52, desc: 'Deep-water port for off-manifest freight.' },
  { id: 'sb-eclipse-labs', name: 'Eclipse Laboratories', icon: '🧬', cost: 280_000_000, baseIncome: 5_800_000, minLevel: 54, desc: 'Classified biotech research generating steady contracts.' },
  { id: 'sb-phantom-fleet', name: 'Phantom Fleet', icon: '🚢', cost: 300_000_000, baseIncome: 6_200_000, minLevel: 54, desc: 'Unregistered cargo vessels crossing international waters.' },
  { id: 'sb-cipher-grid', name: 'Cipher Grid', icon: '🔐', cost: 320_000_000, baseIncome: 6_600_000, minLevel: 55, desc: 'Encryption infrastructure for off-book communications.' },
  { id: 'sb-shadow-press', name: 'Shadow Press', icon: '🖨️', cost: 340_000_000, baseIncome: 7_000_000, minLevel: 55, desc: 'Currency-grade counterfeiting at a national scale.' },
  { id: 'sb-titan-refinery', name: 'Titan Refinery', icon: '🏭', cost: 360_000_000, baseIncome: 7_400_000, minLevel: 56, desc: 'Rare-earth processing plant off sovereign territory.' },
  { id: 'sb-iron-corridor', name: 'Iron Corridor', icon: '🚂', cost: 380_000_000, baseIncome: 7_800_000, minLevel: 56, desc: 'Ghost rail network moving contraband cross-border.' },
  { id: 'sb-deep-relay', name: 'Deep Relay Station', icon: '📡', cost: 400_000_000, baseIncome: 8_200_000, minLevel: 57, desc: 'Satellite relay for untraceable global data traffic.' },
  { id: 'sb-obsidian-tower', name: 'Obsidian Tower', icon: '🏢', cost: 420_000_000, baseIncome: 8_600_000, minLevel: 57, desc: 'Elite corporate HQ used as a financial front at scale.' },
  { id: 'sb-null-island', name: 'Null Island Terminal', icon: '🏝️', cost: 440_000_000, baseIncome: 9_000_000, minLevel: 58, desc: 'Offshore data haven operating outside jurisdictions.' },
  { id: 'sb-venom-pharma', name: 'Venom Pharma', icon: '💉', cost: 460_000_000, baseIncome: 9_400_000, minLevel: 58, desc: 'Off-label pharmaceutical empire with no oversight.' },
  { id: 'sb-northgate-casino', name: 'Northgate Casino', icon: '🎰', cost: 480_000_000, baseIncome: 9_800_000, minLevel: 59, desc: 'The largest underground casino operation in the region.' },
  { id: 'sb-silent-capital', name: 'Silent Capital Group', icon: '💼', cost: 500_000_000, baseIncome: 10_200_000, minLevel: 59, desc: 'An invisible investment fund routing money through shells.' },
  { id: 'sb-blacksite-hotel', name: 'Blacksite Hotel', icon: '🏨', cost: 520_000_000, baseIncome: 10_600_000, minLevel: 60, desc: 'Luxury cover for intelligence operations worldwide.' },
  { id: 'sb-rogue-satellite', name: 'Rogue Satellite Array', icon: '🛰️', cost: 540_000_000, baseIncome: 11_000_000, minLevel: 60, desc: 'Unlicensed orbital assets generating surveillance revenue.' },
  { id: 'sb-void-exchange', name: 'Void Exchange', icon: '🌑', cost: 560_000_000, baseIncome: 11_400_000, minLevel: 61, desc: 'Zero-identity crypto exchange processing untraceable flows.' },
  { id: 'sb-ironclad-insurance', name: 'Ironclad Insurance Corp', icon: '🛡️', cost: 580_000_000, baseIncome: 11_800_000, minLevel: 61, desc: 'Fraud-backed insurance empire — pay nothing, collect everything.' },
  { id: 'sb-dusk-armament', name: 'Dusk Armament Co.', icon: '⚔️', cost: 600_000_000, baseIncome: 12_200_000, minLevel: 62, desc: 'Private arms manufacture licensed to no government.' },
  { id: 'sb-zenith-media', name: 'Zenith Media Syndicate', icon: '📺', cost: 620_000_000, baseIncome: 12_600_000, minLevel: 62, desc: 'A media conglomerate shaping narratives for pay.' },
  { id: 'sb-crown-exchange', name: 'Crown Exchange Floor', icon: '👑', cost: 640_000_000, baseIncome: 13_000_000, minLevel: 63, desc: 'High-frequency trading desk running on unmonitored feeds.' },
  { id: 'sb-nova-logistics', name: 'Nova Logistics Ring', icon: '📦', cost: 660_000_000, baseIncome: 13_400_000, minLevel: 63, desc: 'A global logistics shadow-network moving anything for anyone.' },
  { id: 'sb-apex-construct', name: 'Apex Construction Group', icon: '🏗️', cost: 680_000_000, baseIncome: 13_800_000, minLevel: 64, desc: 'Infrastructure contracts used to launder billions.' },
  { id: 'sb-sable-foundry', name: 'Sable Foundry', icon: '⚙️', cost: 700_000_000, baseIncome: 14_200_000, minLevel: 64, desc: 'A heavy-industry plant running illegal production lines.' },
  { id: 'sb-hydra-bank', name: 'Hydra Banking Network', icon: '🐍', cost: 720_000_000, baseIncome: 14_600_000, minLevel: 65, desc: 'Shell bank branching through 40 jurisdictions simultaneously.' },
  { id: 'sb-abyss-mining', name: 'Abyss Deep Mining', icon: '⛏️', cost: 740_000_000, baseIncome: 15_000_000, minLevel: 65, desc: 'Seabed mineral extraction under no territorial law.' },
  { id: 'sb-crimson-labs', name: 'Crimson R&D Labs', icon: '🔬', cost: 760_000_000, baseIncome: 15_400_000, minLevel: 66, desc: 'Weapons-grade research sold to the highest bidder.' },
  { id: 'sb-styx-logistics', name: 'Styx Freight Lines', icon: '🚛', cost: 780_000_000, baseIncome: 15_800_000, minLevel: 66, desc: 'Cross-continental smuggling scaled to an industry.' },
  { id: 'sb-throne-group', name: 'Throne Group Holdings', icon: '🪑', cost: 800_000_000, baseIncome: 16_200_000, minLevel: 67, desc: 'Holding company controlling dozens of criminal subsidiaries.' },
  { id: 'sb-eclipse-tower', name: 'Eclipse Tower HQ', icon: '🌘', cost: 820_000_000, baseIncome: 16_600_000, minLevel: 67, desc: 'Opaque HQ managing assets no registry acknowledges.' },
  { id: 'sb-phantom-press', name: 'Phantom Press Bureau', icon: '📰', cost: 840_000_000, baseIncome: 17_000_000, minLevel: 68, desc: 'Disinformation agency paid by states and cartels alike.' },
  { id: 'sb-eternal-vault', name: 'Eternal Vault Co.', icon: '🗄️', cost: 860_000_000, baseIncome: 17_400_000, minLevel: 68, desc: 'The most secure off-grid asset storage operation in existence.' },
  { id: 'sb-null-labs', name: 'Null Research Collective', icon: '🧪', cost: 880_000_000, baseIncome: 17_800_000, minLevel: 69, desc: 'Classified programs funded by entities that do not exist.' },
  { id: 'sb-dominion-trade', name: 'Dominion Trade Ring', icon: '🌐', cost: 900_000_000, baseIncome: 18_200_000, minLevel: 69, desc: 'Global commodity manipulation ring spanning 60 countries.' },
  { id: 'sb-sovereign-fleet', name: 'Sovereign Air Fleet', icon: '🛩️', cost: 920_000_000, baseIncome: 18_600_000, minLevel: 70, desc: 'Private air armada chartered only for elites.' },
  { id: 'sb-void-corp', name: 'Void Corporation', icon: '⬛', cost: 950_000_000, baseIncome: 19_000_000, minLevel: 70, desc: 'An entity with no public name, no address, and no limit.' },
  { id: 'sb-apex-syndicate', name: 'Apex Syndicate Bureau', icon: '⚜️', cost: 975_000_000, baseIncome: 19_500_000, minLevel: 70, desc: 'The nerve centre of the entire underworld economy.' },
  { id: 'sb-monarch-empire', name: 'Monarch Empire HQ', icon: '🏰', cost: 1_000_000_000, baseIncome: 20_000_000, minLevel: 70, desc: 'The pinnacle of criminal enterprise. Everything flows here.' },
];

function ensureSynBiz(player: Player): void {
  if (!(player as any).synBiz) (player as any).synBiz = {};
  if (!(player as any).lastSynBizClaim) (player as any).lastSynBizClaim = 0;
}

export function getSynBizById(id: string): SynBizDef | undefined {
  return SYN_BIZ_CATALOG.find(b => b.id === id || b.name.toLowerCase() === id.toLowerCase());
}

export function buySynBiz(player: Player, query: string): string {
  ensureSynBiz(player);
  const biz = SYN_BIZ_CATALOG.find(
    b => b.id === query.trim().toLowerCase() || b.name.toLowerCase().includes(query.trim().toLowerCase())
  );
  if (!biz) return `❌ Business not found. Try *.synbiz list*`;
  if (player.level < biz.minLevel) return `❌ Requires Level ${biz.minLevel}.`;
  const owned = (player as any).synBiz as Record<string, boolean>;
  if (owned[biz.id]) return `❌ You already own *${biz.name}*.`;
  if (player.cash < biz.cost) return `❌ Need $${biz.cost.toLocaleString()}. You have $${player.cash.toLocaleString()}.`;

  try {
    chargeMoney({ player, amount: biz.cost, source: 'SYNBIZ', reason: `Bought ${biz.name}`, metadata: { bizId: biz.id } });
  } catch (e) {
    return `❌ ${e instanceof Error ? e.message : 'Purchase failed.'}`;
  }

  owned[biz.id] = true;
  grantXp(player, 500, 'SYNBIZ', `synbiz-buy:${player.id}:${biz.id}`);
  savePlayer(player);
  return [
    `${biz.icon} *${biz.name}* — ACQUIRED`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Cost: $${biz.cost.toLocaleString()}`,
    `Income per claim: ~$${biz.baseIncome.toLocaleString()}`,
    `Claim every 70 hours with *.syndicate claim*`,
  ].join('\n');
}

export function claimSynBiz(player: Player): string {
  ensureSynBiz(player);
  const owned = (player as any).synBiz as Record<string, boolean>;
  const ownedIds = Object.keys(owned).filter(k => owned[k]);
  if (!ownedIds.length) return `❌ You don't own any Syndicate Businesses.\nBrowse: *.synbiz list*`;

  const now = Date.now();
  const last = Number((player as any).lastSynBizClaim) || 0;
  if (now - last < SYN_BIZ_CLAIM_CD) {
    const hoursLeft = ((SYN_BIZ_CLAIM_CD - (now - last)) / 3_600_000).toFixed(1);
    return `⏳ Next Syndicate claim in *${hoursLeft}h*`;
  }

  let total = 0;
  const lines: string[] = [];
  for (const id of ownedIds) {
    const def = SYN_BIZ_CATALOG.find(b => b.id === id);
    if (!def) continue;
    total += def.baseIncome;
    lines.push(`${def.icon} ${def.name} → +$${def.baseIncome.toLocaleString()}`);
  }

  grantMoney({ player, amount: total, source: 'SYNBIZ', reason: 'Syndicate Biz claim', metadata: { count: ownedIds.length } });
  grantXp(player, ownedIds.length * 100, 'SYNBIZ', `synbiz-claim:${player.id}:${now}`);
  (player as any).lastSynBizClaim = now;
  savePlayer(player);

  return [
    `⚜️ *SYNDICATE BIZ — CLAIM*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ...lines,
    `━━━━━━━━━━━━━━━━━━━━`,
    `💰 Total: *$${total.toLocaleString()}*`,
    `Next claim in 70h`,
  ].join('\n');
}

export function listSynBiz(player: Player, pageArg?: string): string {
  ensureSynBiz(player);
  const owned = (player as any).synBiz as Record<string, boolean>;
  const PAGE = 10;
  const page = Math.max(1, parseInt(pageArg || '1', 10) || 1);
  const slice = SYN_BIZ_CATALOG.slice((page - 1) * PAGE, page * PAGE);
  const totalPages = Math.ceil(SYN_BIZ_CATALOG.length / PAGE);
  const lines = [
    `⚜️ *SYNDICATE BUSINESSES* (Page ${page}/${totalPages})`,
    `━━━━━━━━━━━━━━━━━━━━`,
  ];
  for (const b of slice) {
    const tag = owned[b.id] ? ' ✅' : '';
    lines.push(`${b.icon} *${b.name}*${tag}\nLv${b.minLevel} · $${b.cost.toLocaleString()} · ~$${b.baseIncome.toLocaleString()}/claim`);
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`▸ .synbiz buy <name>   ▸ .syndicate claim`);
  if (page < totalPages) lines.push(`▸ .synbiz list ${page + 1} — next page`);
  return lines.join('\n');
}

export function mySynBiz(player: Player): string {
  ensureSynBiz(player);
  const owned = (player as any).synBiz as Record<string, boolean>;
  const ownedDefs = SYN_BIZ_CATALOG.filter(b => owned[b.id]);
  if (!ownedDefs.length) return `❌ No Syndicate Businesses owned yet.\n▸ .synbiz list`;
  const now = Date.now();
  const last = Number((player as any).lastSynBizClaim) || 0;
  const hoursLeft = Math.max(0, (SYN_BIZ_CLAIM_CD - (now - last)) / 3_600_000);
  const totalIncome = ownedDefs.reduce((s, b) => s + b.baseIncome, 0);
  const lines = [
    `⚜️ *YOUR SYNDICATE BUSINESSES*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ...ownedDefs.map(b => `${b.icon} *${b.name}* · $${b.baseIncome.toLocaleString()}/claim`),
    `━━━━━━━━━━━━━━━━━━━━`,
    `Combined income: *$${totalIncome.toLocaleString()}*/claim`,
    hoursLeft > 0 ? `⏳ Next claim in *${hoursLeft.toFixed(1)}h*` : `✅ Ready to claim — *.syndicate claim*`,
  ];
  return lines.join('\n');
}
