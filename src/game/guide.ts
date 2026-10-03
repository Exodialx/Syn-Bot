/**
 * Guides + full role story paths (.story / .guide)
 * Same UI style throughout.
 */

export function formatGuide(topic?: string): string {
  const main = `🗺️ *SYNDICATE GUIDE*
━━━━━━━━━━━━━━━━━━━━

🚀 *START*
  .start  .set name  .role  .menu  .profile

💵 *MONEY*
  .bank  .deposit  .withdraw  .pay

💼 *BUSINESS*
  .biz list  .biz buy <id>
  .biz upgrade <id>  .collect
  .biz insure <id>  (Businessman)

🚨 *CRIME / PVP*
  .crime list  .crime <job>
  .rob / .raid / .hit <num>
  .wanted

🕴️ *MAFIA*
  .crew  .recruit  .racket
  .territory  .intimidate  .blood

🎯 *HITMAN*
  .contracts  .ghost  .evidence
  .stalk  .list  .silent

💼 *BUSINESSMAN*
  .launder  .shell  .board
  .lend  .takeover  .manipulate

🏚️ *HEISTS*
  .sh  .jh  .gmh  .dh  .bh
  .join heist

💠 *CRYPTO*
  .crypto  .crypto buy|sell
  .crypto portfolio

📖 *ROLE STORIES*
  .story businessman
  .story mafia
  .story hitman
━━━━━━━━━━━━━━━━━━━━
.guide crime / biz / heist / crypto / class`;

  if (!topic) return main;
  const t = topic.toLowerCase();
  if (t === 'crime') {
    return `🚨 *CRIME GUIDE*
━━━━━━━━━━━━━━━━━━━━
▸ .crime list — see jobs by class
▸ .crime <job> — run it

Odds use stealth, class, role, heat & city heat.
Mafia & Hitman earn Class XP from crime.
Businessman crime cash is *dirty* → .launder`;
  }
  if (t === 'biz' || t === 'business') {
    return `💼 *BUSINESS GUIDE*
━━━━━━━━━━━━━━━━━━━━
▸ .biz list [legal|grey|criminal|digital|property]
▸ .biz buy <id>
▸ .biz upgrade <id>  (L1→L2→L3)
▸ .collect  (30m CD, idle cap 6h)
▸ .biz insure <id>  (Biz only)

Legal = steady, low heat.
Grey/Criminal = big money, city heat.
Property = Businessman exclusive, zero heat.
L3 unlocks special perks.`;
  }
  if (t === 'heist') {
    return `🏚️ *HEIST GUIDE*
━━━━━━━━━━━━━━━━━━━━
Open .sh → friends .join heist
→ .sh prep → wait → .sh start

Prep timer required.
Crew stats + city heat matter.`;
  }
  if (t === 'crypto') {
    return `💠 *CRYPTO GUIDE*
━━━━━━━━━━━━━━━━━━━━
▸ .crypto — market
▸ .crypto <SYM> — detail
▸ .crypto buy|sell <SYM> <amt>
▸ .crypto portfolio / history
▸ .crypto watch <SYM>

35 tokens · 5 tiers · events · liquidity impact.`;
  }
  if (t === 'class') {
    return `👑 *CLASS GUIDE*
━━━━━━━━━━━━━━━━━━━━
Class 1–10. Earn Class XP from role actions.

Businessman: collect, launder, loans, takeovers
Mafia: crime, rob, crew, territory
Hitman: contracts, hits, ghost, evidence

.type .story <role> for the full path.`;
  }
  // fallback to story if they typed a role name
  if (['businessman', 'mafia', 'hitman', 'biz'].includes(t)) {
    return formatStory(t === 'biz' ? 'businessman' : t);
  }
  return main;
}

/** Full narrative path for each role — every major command in sequence */
export function formatStory(role?: string): string {
  const r = (role || '').toLowerCase().trim();
  // aliases
  if (['businessman', 'biz', 'bm', 'business', 'empire'].includes(r)) return storyBusinessman();
  if (['mafia', 'maf', 'don', 'street'].includes(r)) return storyMafia();
  if (['hitman', 'hit', 'assassin', 'ghost', 'contractor'].includes(r)) return storyHitman();
  if (['all', 'roles', 'triangle'].includes(r)) return storyAll();
  return `📖 *ROLE STORIES*
━━━━━━━━━━━━━━━━━━━━
How a full career plays out — every command in order.

▸ .story businessman
▸ .story mafia
▸ .story hitman
▸ .story all

Aliases: .path  .lore  .howto  .walkthrough
Short: .story biz | maf | hit

Each path shows the loop from day-one cash
to endgame power.`;
}

function storyAll(): string {
  return storyBusinessman() + '\n\n' + storyMafia() + '\n\n' + storyHitman();
}

function storyBusinessman(): string {
  return `💼 *STORY — BUSINESSMAN*
━━━━━━━━━━━━━━━━━━━━
*Day one. You don't throw punches. You buy the building.*

1. .start → .set name YourName
2. .role businessman
3. .daily  ·  .bank  ·  .deposit (keep operating cash)

*Build the front*
4. .biz list legal
5. .biz buy corner-store
6. .biz buy laundromat
7. .collect every 30m (idle dies after 6h)

*Dirty money appears*
8. .crime list — small jobs only
9. Crime pays *dirty cash* for you
10. .launder <amt> through your shops
11. Skip launder → bank risk / seizure

*Expand the empire*
12. .biz list grey → nightclub, casino
13. .biz upgrade nightclub (L3 = laundry node)
14. .shell  (C3) — robbers see decoy net worth
15. .board cut|expand|underground (48h)

*Class power*
16. C5 .takeover <@rich rival> — seize their biz
17. C7 .lend <@> <amt> 20 — loan shark
18. .collectloan <@> when due
19. C8 .politics — city heat leans your way
20. C10 .manipulate NXUS buy 100 — move markets

*Endgame property*
21. .biz list property
22. .biz buy hotel-chain / island-resort
23. .biz insure <id> — survive one raid
24. .hire bodyguards  ·  .guards
25. .crypto portfolio — park profits in blue chips

*You win when the city pays you rent
and nobody knows how rich you really are.*
━━━━━━━━━━━━━━━━━━━━
.type .class for live status`;
}

function storyMafia(): string {
  return `🕴️ *STORY — MAFIA*
━━━━━━━━━━━━━━━━━━━━
*Everyone answers to you — or they learn to.*

1. .start → .set name YourName
2. .role mafia
3. .shop → .buy pistol  ·  .equip pistol
4. .crime list → .crime street-robbery

*Street control*
5. .rob <@soft target>
6. .raid <@> when crew is ready
7. .daily  ·  bank the clean take

*Build the crew (C3+)*
8. .recruit grunt
9. .crew  ·  .crew pay (or they desert)
10. .racket <@biz owner> 5000
11. They .paytribute @you — or you raid free

*Territory (C5+)*
12. .territory claim docks
13. .territory claim midtown
14. Crimes in your zones feed you tax
15. .intimidate <@> — 24h to pay or free rob

*The heavy years*
16. C7 .recruit capo
17. Get robbed → .blood shows the debt
18. Crew hunts them for 72h
19. .biz list grey → chop-shop, fight-club
20. .collect  ·  illegal heat is the cost of power

*Don's table (C10)*
21. Own 3 territories + full crew
22. Protection list full
23. War nights: PVP pays double
24. .hit only when the message must be final

*You win when tribute hits your phone
before anyone asks permission.*
━━━━━━━━━━━━━━━━━━━━
.type .class for live status`;
}

function storyHitman(): string {
  return `🎯 *STORY — HITMAN*
━━━━━━━━━━━━━━━━━━━━
*You are not the loudest in the room.
You are the reason the room goes quiet.*

1. .start → .set name YourName
2. .role hitman
3. .shop → stealth gear  ·  .equip
4. Patience. Your passive income is weak — activity is oxygen.

*First blood (C2+)*
5. .contracts — read the board
6. .accept c1
7. .complete c1 — signature kills start stacking
8. Payout scales with rep

*Stay invisible (C4+)*
9. .ghost — 2h off leaderboards & target lists
10. .evidence — burn heat without waiting
11. .crime only when the odds are clean
12. Never let wanted snowball

*Hunt with intent (C6+)*
13. .stalk <@> — last active, approx cash
14. .hit <@> when the window is perfect
15. .doublecross <@client> — 3× pay, bridge burned
16. Choose betrayal carefully

*The List (C8+)*
17. .list add <@rival>
18. .list add <@threat>
19. Hits on The List pay 2× + signature stacks
20. .list — review before every contract night

*Apex (C10)*
21. .silent — government job, huge pay
22. Fail it → 24h manhunt (anyone can bounty you)
23. Win it → you fund the next month in one move
24. .crypto only to park clean capital
25. Businessmen hire you. Mafia fears the invoice.

*You win when your name is whispered
and your balance never needs a crew.*
━━━━━━━━━━━━━━━━━━━━
.type .class for live status`;
}
