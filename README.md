# ⚜️ SYNDICATE v1.6 — Per-Player Identity · Full Crypto · Name System

Pure JSON persistence (Windows / Mac / Linux safe). No native modules.

## Critical fixes in this build

### 1. Separate player identity (FIXED)
Previously the bot used `remoteJid` as player ID. In **groups** that is the group ID, so every member shared one profile.

Now the bot extracts the real sender:
- DM → `remoteJid`
- Group → `key.participant`

Each phone number has its own persistent save in `data/syndicates.json`.

### 2. Database per player
All state (cash, bank, portfolio, inventory, trade history, watchlist, heat, etc.) is keyed by the player's phone ID and saved to JSON after every mutation.

### 3. `.start` + unique username
1. User sends `.start`
2. Bot asks for a unique name via `.set name YourName`
3. Name is unique across all players (case-insensitive)
4. First name is free and permanent
5. Further changes require buying **Name Change Card** (`.shop` → `namecard` → $75k) then `.set name NewName`

### 4. Bot replies quote the user
Every response uses WhatsApp `quoted` so the reply is clearly threaded to the person who issued the command (works in groups).

### 5. Full 35-token crypto market
Tiers 1–5, liquidity impact, momentum, global sentiment cycles, random events (PUMP / RUG / WHALE / HACK / LISTING / REGULATION / HALVING), per-player portfolios with avg cost + realized/unrealized P/L, watchlist, trade history, top gainers/losers/volume.

## Commands (crypto)
```
.crypto                     market overview
.crypto <SYM>               token detail
.crypto buy <SYM> <amt>
.crypto sell <SYM> <amt>
.crypto portfolio
.crypto watchlist
.crypto watch <SYM>
.crypto unwatch <SYM>
.crypto history
.crypto top gainers|losers|volume
```

## Run
```bash
npm install
npm run bot
```
Scan the QR with WhatsApp → Linked Devices.

Data file: `data/syndicates.json`  
Auth: `auth_info_baileys/`

## Notes
- Players must `.set name` before most commands work.
- Name Change Card is consumable and stackable.
- Portfolios and trade history are isolated per player ID.

## Class Gameplay Loops (v1.7)

### Businessman
`.class` `.launder` `.shell` `.board` `.lend` `.collectloan` `.takeover` `.manipulate` `.politics`

### Mafia
`.class` `.crew` `.recruit` `.racket` `.paytribute` `.intimidate` `.territory` `.blood`

### Hitman
`.class` `.contracts` `.accept` `.complete` `.ghost` `.evidence` `.stalk` `.list` `.doublecross` `.silent`

Milestones unlock at Class 3 / 5 / 7 / 8 / 10. Crime payouts for Businessmen go to dirty cash and must be laundered.
