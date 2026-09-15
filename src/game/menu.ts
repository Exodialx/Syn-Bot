import { Player } from './player.js';

export function formatMenu(p: Player): string {
  return `⚜️ *SYNDICATE TERMINAL*
━━━━━━━━━━━━━━━━━━━━
👤 Profile & Stats
  .profile  .balance  .role  .daily  .cd  .class  .achievements

🏦 Banking
  .bank  .deposit  .withdraw  .pay

💼 Business
  .biz list  .biz buy  .biz upgrade  .collect
  .launder  .shell  .board  .lend  .takeover

🚨 Crime & PVP
  .crime list  .wanted
  .rob  .revenge  .brob  .raid  .hit
  .bounty  .bounties  .dailies  .quest  .cd

🕴️ Mafia Ops
  .crew  .recruit  .racket  .territory  .intimidate

🎯 Hitman Ops
  .contracts  .ghost  .evidence  .stalk  .list  .silent

🌆 City
  .news

💠 Crypto
  .crypto  .crypto portfolio

🏚️ Heists
  .sh .jh .gmh .dh .bh (solo · high jail)
  .safe .risky · .join heist (crew)

🛒 Gear
  .shop  .buy  .inv  .equip

🛡️ Guards & Jail
  .hire  .guards  .jail  .bail  .escape  .work

🎰 Casino & Minigames
  .bj  .poker  .spell  .slots  .dice
  .shellgame  .futures  .roulette  .contraband
  .count  .fake  .auction  .race  .ghostmarket
  .riddle  .numbers  .prisonpoker  .rat

🏆 Rankings
  .lb  .lb level  .lb heat  .al

📖 .guide  .story  .path  ❓ .help
━━━━━━━━━━━━━━━━━━━━
${p.role} · Lv ${p.level} · Class ${p.classLevel} · 💰 $${p.cash.toLocaleString()} · 🏦 $${p.bank.toLocaleString()}`;
}
