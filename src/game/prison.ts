/**
 * Prison economy — work, commissary, contraband, sentence reduction
 * Only usable while inPrison
 */
import { Player, savePlayer, addXp } from './player.js';
import { addCityHeat } from './city.js';

const WORK_CD = 4 * 60 * 1000; // 4 min
const SMUGGLE_CD = 8 * 60 * 1000;

type CommissaryItem = {
  id: string;
  name: string;
  icon: string;
  cost: number; // paid from cash (commissary account flavor)
  effect: 'sentence' | 'energy' | 'contraband' | 'rep';
  value: number;
  desc: string;
};

const COMMISSARY: CommissaryItem[] = [
  { id: 'noodles', name: 'Ramen Pack', icon: '🍜', cost: 500, effect: 'energy', value: 1, desc: 'Small comfort' },
  { id: 'cigarettes', name: 'Cigarettes', icon: '🚬', cost: 1200, effect: 'rep', value: 3, desc: 'Yard currency' },
  { id: 'soap', name: 'Soap Bar', icon: '🧼', cost: 400, effect: 'energy', value: 1, desc: 'Hygiene' },
  { id: 'stamps', name: 'Stamps', icon: '📬', cost: 800, effect: 'rep', value: 2, desc: 'Mail favor' },
  { id: 'radio', name: 'Pocket Radio', icon: '📻', cost: 3500, effect: 'sentence', value: 30, desc: '-30s sentence' },
  { id: 'candy', name: 'Candy Bag', icon: '🍬', cost: 900, effect: 'rep', value: 2, desc: 'Trade bait' },
  { id: 'book', name: 'Law Book', icon: '📖', cost: 2500, effect: 'sentence', value: 45, desc: '-45s + XP' },
  { id: 'protein', name: 'Protein Bar', icon: '🍫', cost: 1500, effect: 'energy', value: 2, desc: 'Gym fuel' },
  { id: 'shank-kit', name: 'Shank Kit', icon: '🗡️', cost: 8000, effect: 'contraband', value: 1, desc: 'Illegal — risky' },
  { id: 'phone-chip', name: 'Phone Chip', icon: '📶', cost: 12000, effect: 'contraband', value: 1, desc: 'Smuggle tool' }
];

function assertJailed(p: Player): string | null {
  if (!p.inPrison || Date.now() >= p.prisonUntil) {
    p.inPrison = false;
    p.prisonUntil = 0;
    return '🔓 You are not in prison.';
  }
  return null;
}

function prisonRep(p: Player): number {
  return (p as any).prisonRep || 0;
}

function setRep(p: Player, v: number) {
  (p as any).prisonRep = Math.max(0, Math.min(100, v));
}

/** Yard work — earn commissary cash + shave time */
export function prisonWork(p: Player): string {
  const err = assertJailed(p);
  if (err) return err;

  const now = Date.now();
  const last = (p as any).lastPrisonWork || 0;
  if (now - last < WORK_CD) {
    const left = Math.ceil((WORK_CD - (now - last)) / 1000);
    return `⏳ Next shift in ${left}s`;
  }
  (p as any).lastPrisonWork = now;

  // Jobs scale slightly with strength / role
  const jobs = [
    { name: 'Laundry', pay: 400, shave: 20 },
    { name: 'Kitchen', pay: 550, shave: 25 },
    { name: 'Library', pay: 500, shave: 30 },
    { name: 'Workshop', pay: 700, shave: 15 },
    { name: 'Yard sweep', pay: 350, shave: 35 }
  ];
  const job = jobs[Math.floor(Math.random() * jobs.length)];
  let pay = job.pay + p.level * 15 + Math.floor(p.strength * 8);
  let shave = job.shave; // seconds

  if (p.role === 'Businessman') pay = Math.floor(pay * 1.15); // better at soft jobs
  if (p.role === 'Mafia') shave += 5;

  // Rep helps pay
  pay += prisonRep(p) * 5;

  p.cash += pay;
  p.prisonUntil = Math.max(now, p.prisonUntil - shave * 1000);
  setRep(p, prisonRep(p) + 1);
  // good behavior can lift solitary
  if ((p as any).solitary && Math.random() < 0.2) {
    (p as any).solitary = false;
  }
  const notes = addXp(p, 8);
  savePlayer(p);

  const left = Math.ceil((p.prisonUntil - Date.now()) / 1000);
  return `
       🛠️ PRISON WORK
━━━━━━━━━━━━━━━━━━━━
Job: ${job.name}
💰 +$${pay.toLocaleString()}
⏱️ Sentence -${shave}s
👊 Yard rep ${prisonRep(p)}
Time left: ${left}s
${notes.map(n => `${n}`).join('\n')}
`;
}

export function commissaryList(): string {
  let out = `
      🛒 COMMISSARY
━━━━━━━━━━━━━━━━━━━━\n`;
  for (const i of COMMISSARY) {
    out += `${i.icon} ${i.name.padEnd(14)} $${i.cost}\n`;
  }
  out += `━━━━━━━━━━━━━━━━━━━━
.commissary buy <id>             
Only while jailed                
━━━━━━━━━━━━━━━━━━━━`;
  return out;
}

export function commissaryBuy(p: Player, id: string): string {
  const err = assertJailed(p);
  if (err) return err;

  const item = COMMISSARY.find(c => c.id === id.toLowerCase() || c.name.toLowerCase().includes(id.toLowerCase()));
  if (!item) return '❌ Unknown. .commissary';

  if (p.cash < item.cost) return `❌ Need $${item.cost}`;

  // Contraband chance of confiscation
  if (item.effect === 'contraband' && Math.random() < 0.35) {
    p.cash -= Math.floor(item.cost * 0.5);
    p.prisonUntil += 90 * 1000;
    p.wanted = Math.min(100, p.wanted + 3);
    savePlayer(p);
    return `🚨 Guards found the ${item.name}!
💸 Lost half · +90s solitary · Wanted +3`;
  }

  p.cash -= item.cost;

  if (item.effect === 'sentence') {
    p.prisonUntil = Math.max(Date.now(), p.prisonUntil - item.value * 1000);
    if (item.id === 'book') addXp(p, 12);
  } else if (item.effect === 'rep') {
    setRep(p, prisonRep(p) + item.value);
  } else if (item.effect === 'energy') {
    setRep(p, prisonRep(p) + 1);
  } else if (item.effect === 'contraband') {
    const bag = ((p as any).contraband || []) as string[];
    bag.push(item.id);
    (p as any).contraband = bag;
    setRep(p, prisonRep(p) + 2);
  }

  savePlayer(p);
  const left = Math.ceil((Math.max(0, p.prisonUntil - Date.now())) / 1000);
  return `▸ Commissary: ${item.icon} ${item.name}
${item.desc}
💰 $${p.cash.toLocaleString()} · ⏱️ ${left}s left · Rep ${prisonRep(p)}`;
}

/** Smuggle contraband out when free — or use inside for bonus escape later */
export function prisonSmuggle(p: Player): string {
  const err = assertJailed(p);
  if (err) return err;

  const bag = ((p as any).contraband || []) as string[];
  if (!bag.length) return '❌ No contraband. Buy risky items from .commissary';

  const now = Date.now();
  const last = (p as any).lastSmuggle || 0;
  if (now - last < SMUGGLE_CD) {
    return `⏳ Smuggle cooldown ${Math.ceil((SMUGGLE_CD - (now - last)) / 1000)}s`;
  }
  (p as any).lastSmuggle = now;

  const item = bag.pop();
  (p as any).contraband = bag;

  const success = Math.random() < 0.55 + p.stealth * 0.01 + prisonRep(p) * 0.002;
  if (success) {
    const payout = 5000 + Math.floor(Math.random() * 12000) + p.level * 100;
    p.cash += payout;
    p.prisonUntil = Math.max(now, p.prisonUntil - 60 * 1000);
    addCityHeat(1.5, 'Prison smuggle whisper');
    savePlayer(p);
    return `📦 Smuggled ${item} to the outside line
💰 +$${payout.toLocaleString()} · ⏱️ -60s`;
  }

  p.prisonUntil += 3 * 60 * 1000;
  p.heat = Math.min(100, p.heat + 6);
  p.wanted = Math.min(100, p.wanted + 5);
  savePlayer(p);
  return `❌ Shakedown! Lost ${item}
⏱️ +3 min · 🔥 Heat +6 · 🚨 Wanted +5`;
}

export function prisonEconomyHelp(): string {
  return `
      ◆ PRISON ECONOMY
━━━━━━━━━━━━━━━━━━━━
.work          — yard job
.commissary    — buy supplies
.commissary buy <id>
.smuggle       — move contraband
.jail .bail .escape
━━━━━━━━━━━━━━━━━━━━
Work = cash + less time
Rep = better pay
Contraband = risk / reward
`;
}
