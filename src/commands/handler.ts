import { getOrCreatePlayer, formatProfile, setUsername, getPlayer, playerExists, isRegistered, linkIdentities } from '../game/player.js';
import { runCrime, listCrimes, getWantedStatus } from '../game/crime.js';
import { formatMenu } from '../game/menu.js';
import { formatPlatformMenu, formatVersion, formatBotOwner } from '../game/platform.js';
import { handleGuildCommand, handleTerritoryCommand } from '../game/guild.js';

import { formatGuide, formatStory } from '../game/guide.js';
import { isAdmin, runAdmin, promoteToAdmin, isBotOwner, promoteToBotOwner } from '../game/admin.js';
import { listAchievements, checkAndGrant, tryGrantFounder, formatBadgeLine } from '../game/achievements.js';
import { logCommand } from '../systems/commandLogger.js';
import { formatRoleSelect, setRole } from '../game/roles.js';
import { listBusinesses, buyBusiness, collectBusinesses, upgradeBusiness, insureBusiness } from '../game/businesses.js';
import { robPlayer, raidPlayer, hitPlayer, revengeRob, launderPlayer } from '../game/pvp.js';
import { formatTaxStatus } from '../game/tax.js';
import { claimDrop, formatDropList } from '../game/drops.js';
import { battleChallenge, battleRespond, battleStrike, battleStatus, battleAct } from '../game/battle.js';
import { hospitalBlock, adminSetHearts, heartsBar } from '../game/health.js';
import { formatCityNews } from '../game/city.js';
import {
  formatMarket,
  buyCrypto,
  sellCrypto,
  formatPortfolio,
  formatTokenDetail,
  formatTop,
  formatWatchlist,
  watchToken,
  unwatchToken,
  formatHistory
} from '../game/crypto.js';
import { bjStart, bjHit, bjStand, bjDouble, dice, coinflip, slots } from '../game/gambling.js';
import {
  shellStart, shellPick, shellCashout,
  racketJoin, racketResolve,
  futureBet, futureClaim,
  prisonPoker,
  riddleStart, riddleAnswer,
  streetRace,
  rouletteJoin, rouletteSpin,
  contrabandStart, contrabandChoice,
  interStart, interAnswer,
  countStart, countAnswer,
  counterfeit, counterfeitSpot,
  auctionBid, auctionEnd,
  ratOrRide,
  ghostStatus, ghostBuy
} from '../game/minigames.js';
import { openLobby, joinLobby, leaveLobby, startHeist, listHeists, startPrep, heistStatus, runSoloHeist, runSoloClassicHeist, isSoloHeistId } from '../game/heists.js';
import { deposit, withdraw, bankStatus, bankRob } from '../game/bank.js';
import { pokerCreate, pokerJoin, pokerDeal, pokerHand, pokerAct, pokerLeave } from '../game/poker.js';
import { spellStart, spellAnswer } from '../game/spelling.js';
import { formatLeaderboard, formatAchievementLeaderboard } from '../game/leaderboard.js';
import { claimDaily } from '../game/daily.js';
import { payPlayer } from '../game/pay.js';
import { formatCooldowns, cdStrip } from '../game/cooldownsView.js';
import { handleFischCommand } from '../game/fisch.js';
import {
  formatDailyContracts, claimDailyJob, trackDailyProgress,
  placeBounty, formatBounties, claimBounty,
  formatOnboarding, touchOnboarding
} from '../game/engagement.js';
import { formatShop, buyItem, formatInv, equipItem, unequip, hasItem, consumeItem } from '../game/shop.js';
import { hireGuard, fireGuard, listGuards } from '../game/guards.js';
import { jailStatus, payBail, attemptEscape } from '../game/jail.js';
import { prisonWork, commissaryList, commissaryBuy, prisonSmuggle, prisonEconomyHelp } from '../game/prison.js';
import {
  formatLaunder, launderCash, toggleShell, hostileTakeover, boardMeeting,
  lendMoney, collectLoan, marketManipulate, politicalStatus,
  formatCrew, recruitCrew, payCrewUpkeep, startProtection, payTribute,
  intimidatePlayer, claimTerritory, listTerritory, formatBloodDebt,
  formatContracts, acceptContract, completeContract, ghostProtocol,
  destroyEvidence, stalkPlayer, manageHitList, doubleCross, silentContract,
  formatClassStatus
} from '../game/classSystems.js';
import {
  formatStatus as formatBlackMarketStatus,
  formatTop as formatBlackMarketTop,
  formatTitles as formatBlackMarketTitles,
  bid as blackMarketBid,
  challenge as blackMarketChallenge,
  crownBid as blackMarketCrownBid,
  startEvent as startBlackMarketEvent,
  endEventNow as endBlackMarketEvent,
} from '../game/blackmarket.js';
import { askAi, formatAiHelp, liveBoostRemaining } from '../game/ai.js';
import { teachSynAI, listTaught, forgetTaught, synAIStats, synAIFeedbackSummary, learnTopic, learnLog, searchKnowledge } from '../synai/synai.js';

function targetFromArgsOrMention(args: string[], mentioned?: string[]): string {
  // Prefer explicit @mention ids from WhatsApp
  if (mentioned && mentioned.length) return mentioned[0];
  for (const a of args) {
    const d = a.replace(/[^0-9]/g, '');
    if (d.length >= 8) return d;
  }
  // Username / partial token (resolveExistingPlayerId handles names)
  for (const a of args) {
    const tok = a.replace(/^@/, '').trim();
    if (tok && !/^\d+$/.test(tok) && tok.length >= 2) return tok;
  }
  return args[0] || '';
}

/** Commands allowed before username is set */
const PRE_NAME_CMDS = new Set(['start', 'setname', 'set', 'help', 'menu', 'ping', 'rules']);

export async function handleCommand(
  senderId: string,
  text: string,
  meta: { isGroup: boolean; mentioned?: string[]; chatJid?: string }
): Promise<string | null> {
  const parts = text.slice(1).trim().split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();
  const args = parts.slice(1);

  // senderId is already clean phone digits from resolveSenderId
  const playerId = senderId.replace(/[^0-9]/g, '');
  if (!playerId || playerId.length < 8) {
    return '❌ Could not identify your account. Try again in a private chat.';
  }

  const player = getOrCreatePlayer(playerId);

  logCommand({
    playerId,
    command: cmd,
    args: [...args, ...(meta.mentioned || []).map(m => '@' + m)],
    isGroup: meta.isGroup
  });

  if (player.banned) return `🚫 Banned: ${player.banReason || 'No reason'}`;

  // Force username on first play
  if (!isRegistered(player) && !PRE_NAME_CMDS.has(cmd) && !(cmd === 'set' && args[0]?.toLowerCase() === 'name')) {
    return `⚜️ *SYNDICATE*
━━━━━━━━━━━━━━━━━━━━
Welcome! You must choose a unique username first.

▸ .start
▸ .set name YourName

Name is permanent (unless you buy a Name Change Card later).`;
  }

  try {
    const fischResponse = handleFischCommand(cmd, args, playerId, meta.mentioned);
    if (fischResponse !== undefined) return fischResponse;

    // ── name commands ──
    if (cmd === 'setname' || (cmd === 'set' && args[0]?.toLowerCase() === 'name')) {
      const nameArg = cmd === 'setname' ? args.join(' ') : args.slice(1).join(' ');
      if (!nameArg.trim()) return 'Usage: .set name <unique name>\nExample: .set name ShadowKing';
      // first set free; later requires namecard
      if (player.usernameSet) {
        if (!hasItem(player, 'namecard')) {
          return `❌ You already set your name (*${player.name}*).\nBuy a *Name Change Card* from .shop (id: namecard) then try again.`;
        }
        const result = setUsername(player, nameArg, true);
        if (result.startsWith('✅')) {
          consumeItem(player, 'namecard');
          tryGrantFounder(player);
          checkAndGrant(player);
        }
        return result;
      }
      {
        const res = setUsername(player, nameArg, false);
        if (res.startsWith('✅')) {
          tryGrantFounder(player);
          checkAndGrant(player);
          const tip = touchOnboarding(player, 'name');
          const onboard = formatOnboarding(player);
          return res + (tip ? '\n' + tip : '') + (onboard ? '\n' + onboard : '');
        }
        return res;
      }
    }

    if (['sh', 'jh', 'gmh', 'dh', 'bh'].includes(cmd)) {
      {
      const hb = hospitalBlock(player);
      if (hb) return hb;
      return runSoloClassicHeist(player, cmd);
    }
    }
    if (['safe', 'risky'].includes(cmd)) {
      if (args[0]?.toLowerCase() === 'start') return startHeist(player, cmd);
      if (args[0]?.toLowerCase() === 'prep') return startPrep(player, cmd);
      return openLobby(player, cmd);
    }

    switch (cmd) {
      case 'start':
        return formatStart(player);
      case 'menu':
      case 'games':
      case 'syn':
        return formatPlatformMenu(player, meta.chatJid || '');
      case 'help':
        return formatHelp();
      case 'tax':
      case 'taxes':
        return formatTaxStatus(player);
      case 'guide':
        return formatGuide(args[0]);
      
      case 'bizstory':
      case 'businessstory':
        return formatStory('businessman');
      case 'mafiastory':
        return formatStory('mafia');
      case 'hitstory':
      case 'hitmanstory':
        return formatStory('hitman');
      case 'story':
      case 'path':
      case 'lore':
      case 'howto':
      case 'walkthrough': {
        const topic = args[0] || (player.role !== 'Unassigned' ? player.role : undefined);
        return formatStory(topic);
      }
      case 'profile':
      case 'whoami': {
        checkAndGrant(player);
        tryGrantFounder(player);
        const base = formatProfile(player);
        const badges = formatBadgeLine(player);
        return base.replace(/🏆 Badges[^\n]*(\n▸[^\n]*)?/, badges);
      }
      case 'daily': {
        const r = claimDaily(player);
        trackDailyProgress(player, 'daily');
        checkAndGrant(player);
        return r + cdStrip(player);
      }
      case 'dailies':
      case 'dcontracts':
      case 'jobs':
        return formatDailyContracts(player);
      case 'dclaim':
        if (!args[0]) return 'Usage: .dclaim d1';
        return claimDailyJob(player, args[0]);
      case 'quest':
      case 'onboard':
      case 'tutorial':
        return formatOnboarding(player) || '✅ Starter path complete. .menu';
      case 'cd':
      case 'cooldown':
      case 'cooldowns':
        return formatCooldowns(player);
      case 'revenge':
        return revengeRob(player, args[0] ? targetFromArgsOrMention(args, meta.mentioned) : undefined) + cdStrip(player);
      case 'bounty':
        if (!args[0]) return formatBounties(player);
        if (!args[1] && !(meta.mentioned && meta.mentioned.length)) return 'Usage: .bounty <@/num> <amount>';
        return placeBounty(player, targetFromArgsOrMention(args, meta.mentioned), args[args.length - 1]);
      case 'bounties':
        return formatBounties(player);
      case 'claim': {
        // street drop first — only responds when a live drop exists in this group
        if (!args[0] && meta.chatJid) {
          const dropMsg = claimDrop(player, meta.chatJid);
          if (dropMsg) return dropMsg;
        }
        // bounty claim if looks like p#; else contract accept path may conflict — prefer bounty when p*
        if (args[0] && /^p/i.test(args[0])) return claimBounty(player, args[0]);
        if (!args[0]) return '▸ .claim <bounty id>\n▸ or wait for a street drop and .claim it fast';
        return claimBounty(player, args[0]);
      }
      case 'drops':
        return formatDropList();
      case 'suggest':
      case 'suggestions': {
        const chat = meta.chatJid || '';
        const { addSuggestion, activeSuggestions, removeSuggestion } = await import('../synai/listening.js');
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'remove' || sub === 'rm' || sub === 'delete' || sub === 'del') {
          if (!isBotOwner(playerId)) return '⛔ Bot owner only.';
          const idx = Number(args[1]);
          if (!Number.isFinite(idx) || idx < 1) return 'Usage: .suggest remove <number>\nSee .suggest list';
          const gone = removeSuggestion(chat, idx);
          if (!gone) return `❌ No suggestion #${idx}.`;
          return `🗑️ Removed suggestion #${idx}.\n_"${gone.text.slice(0, 120)}"_`;
        }
        if (sub === 'clear' || sub === 'flush') {
          if (!isBotOwner(playerId)) return '⛔ Bot owner only.';
          const { clearSuggestions } = await import('../synai/listening.js');
          const n = clearSuggestions(chat);
          return `🧹 Cleared ${n} suggestions.`;
        }
        if (/^\d+$/.test(sub)) {
          const list = activeSuggestions(chat);
          const ent = list[Number(sub) - 1];
          if (!ent) return `❌ No suggestion #${sub}.`;
          return `📬 *#${sub} · ${ent.category}*\n━━━━━━━━━━━━━━━━━━━━\n${ent.text}\n━━━━━━━━━━━━━━━━━━━━\n…${ent.sender.slice(-4)} · ${new Date(ent.timestamp).toLocaleString()}`;
        }
        if (sub === 'list' || !args.length) {
          const list = activeSuggestions(chat);
          if (!list.length) return '📬 No suggestions yet.\nSubmit one: .suggest <idea>';
          return (
            `📬 *SUGGESTIONS* (${list.length})\n━━━━━━━━━━━━━━━━━━━━\n` +
            list.slice(-20).map((s, i) => `${i + 1}. [${s.category}] ${s.text.slice(0, 120)}`).join('\n') +
            '\n━━━━━━━━━━━━━━━━━━━━\n.suggest <idea>  ·  .suggest <n>  ·  .suggest remove <n>'
          );
        }
        const text = args.join(' ').trim();
        if (text.length < 3) return 'Usage: .suggest <your idea or bug report>';
        const r = addSuggestion(chat, playerId, text);
        return `✅ Saved as suggestion #${r.index} (${r.category})\n_"${text.slice(0, 120)}"_`;
      }
      case 'shop':
      case 'store':
      case 'market':
        return formatShop(args[0], player);
      case 'buy':
        if (!args[0]) return 'Usage: .buy <item id> — .shop';
        // if looks like crypto symbol, redirect tip
        if (args[1] && /^[A-Z0-9]{2,6}$/i.test(args[0])) {
          // allow .buy SYM amt as alias? no — keep shop
        }
        return buyItem(player, args[0]);
      case 'inv':
      case 'inventory':
        return formatInv(player);
      case 'equip':
        if (!args[0]) return 'Usage: .equip <item id>';
        return equipItem(player, args[0]);
      case 'unequip':
        if (!args[0]) return 'Usage: .unequip weapon|armor|tool';
        return unequip(player, args[0]);
      case 'hire':
        if (!args[0]) return 'Usage: .hire <number|@mention> (Businessman, max 3)';
        return hireGuard(player, targetFromArgsOrMention(args, meta.mentioned) || args[0]);
      case 'fire':
        if (!args[0]) return 'Usage: .fire <number>';
        return fireGuard(player, args[0]);
      case 'guards':
      case 'bodyguards':
        return listGuards(player);
      case 'jail':
        return jailStatus(player);
      case 'bail':
        return payBail(player);
      case 'escape':
        return attemptEscape(player);
      case 'work':
        return prisonWork(player);
      case 'commissary':
        if (args[0] === 'buy' && args[1]) return commissaryBuy(player, args[1]);
        return commissaryList();
      case 'smuggle':
        return prisonSmuggle(player);
      case 'prison':
        if (args[0] === 'work') return prisonWork(player);
        if (args[0] === 'commissary') return commissaryList();
        if (args[0] === 'buy' && args[1]) return commissaryBuy(player, args[1]);
        if (args[0] === 'smuggle') return prisonSmuggle(player);
        return prisonEconomyHelp();
      case 'role':
        if (!args[0]) return formatRoleSelect();
        {
          if (args[0].toLowerCase() === 'confirm' && args[1]) {
            return setRole(player, args[1], true);
          }
          const r = setRole(player, args[0], false);
          checkAndGrant(player);
          const tip = touchOnboarding(player, 'role');
          return r + (tip ? '\n' + tip : '');
        }
      case 'crime':
      case 'crimes':
        if (!args[0]) return listCrimes(player);
        {
          const hb = hospitalBlock(player);
          if (hb) return hb;
          const r = runCrime(player, args[0]);
          if (!r.startsWith('❌') && !r.startsWith('◆') && !r.startsWith('⏳') && !r.startsWith('🚨')) {
            trackDailyProgress(player, 'crime');
            const tip = touchOnboarding(player, 'action');
            return r + (tip ? '\n' + tip : '') + cdStrip(player);
          }
          return r;
        }
      case 'wanted':
        return getWantedStatus(player);
      case 'biz':
      case 'business':
      case 'businesses':
        if (args[0] === 'buy' && args[1]) {
          const r = buyBusiness(player, args[1]);
          if (r.includes('PURCHASED')) {
            trackDailyProgress(player, 'buybiz');
            const tip = touchOnboarding(player, 'action');
            return r + (tip ? '\n' + tip : '') + cdStrip(player);
          }
          return r;
        }
        if (args[0] === 'upgrade' && args[1]) return upgradeBusiness(player, args[1]);
        if (args[0] === 'insure' && args[1]) return insureBusiness(player, args[1]);
        if (args[0] === 'collect') {
          const r = collectBusinesses(player);
          if (!r.startsWith('❌') && !r.startsWith('⏳')) {
            trackDailyProgress(player, 'collect');
            const tip = touchOnboarding(player, 'loop');
            return r + (tip ? '\n' + tip : '') + cdStrip(player);
          }
          return r;
        }
        // .biz list [page]  |  .biz [tier] [page]  |  .biz [page]
        if (args[0] === 'list') return listBusinesses(player, 'list', args[1]);
        return listBusinesses(player, args[0], args[1]);
      case 'collect': {
        const r = collectBusinesses(player);
        if (!r.startsWith('❌') && !r.startsWith('⏳')) {
          trackDailyProgress(player, 'collect');
          const tip = touchOnboarding(player, 'loop');
          checkAndGrant(player);
          return r + (tip ? '\n' + tip : '') + cdStrip(player);
        }
        checkAndGrant(player);
        return r;
      }
      case 'rob':
        if (!args[0]) return 'Usage: .rob <number|@mention>';
        {
          const r = robPlayer(player, targetFromArgsOrMention(args, meta.mentioned));
          if (r.includes('SUCCESS')) {
            trackDailyProgress(player, 'rob');
            const tip = touchOnboarding(player, 'loop');
            return r + (tip ? '\n' + tip : '') + cdStrip(player);
          }
          return r + cdStrip(player);
        }
      case 'raid':
        if (!args[0]) return 'Usage: .raid <number|@mention>';
        {
          const r = raidPlayer(player, targetFromArgsOrMention(args, meta.mentioned));
          trackDailyProgress(player, 'raid');
          return r + cdStrip(player);
        }
      case 'hit':
        if (!args[0]) return 'Usage: .hit <number|@mention>';
        return hitPlayer(player, targetFromArgsOrMention(args, meta.mentioned)) + cdStrip(player);
      case 'news':
      case 'city':
      case 'cityheat':
        return formatCityNews();
      // ── CRYPTO ──
      case 'crypto': {
        const sub = (args[0] || '').toLowerCase();
        if (!sub) return formatMarket();
        if (sub === 'portfolio' || sub === 'port') return formatPortfolio(player);
        if (sub === 'history' || sub === 'trades') return formatHistory(player);
        if (sub === 'watchlist' || sub === 'wl') return formatWatchlist(player);
        if (sub === 'watch' && args[1]) return watchToken(player, args[1]);
        if ((sub === 'unwatch' || sub === 'unwatch') && args[1]) return unwatchToken(player, args[1]);
        if (sub === 'buy' && args[1] && args[2]) {
          const amt = parseFloat(args[2]);
          return buyCrypto(player, args[1], amt);
        }
        if (sub === 'sell' && args[1] && args[2]) {
          const amt = parseFloat(args[2]);
          return sellCrypto(player, args[1], amt);
        }
        if (sub === 'top') {
          const kind = (args[1] || 'gainers').toLowerCase();
          if (kind === 'losers' || kind === 'loser') return formatTop('losers');
          if (kind === 'volume' || kind === 'vol') return formatTop('volume');
          return formatTop('gainers');
        }
        if (sub === 'gainers') return formatTop('gainers');
        if (sub === 'losers') return formatTop('losers');
        if (sub === 'volume') return formatTop('volume');
        // treat as symbol detail
        return formatTokenDetail(args[0]);
      }
      case 'bj':
      case 'blackjack':
        if (!args[0]) return 'Usage: .bj <bet> | .bj hit | .bj stand | .bj double';
        if (args[0] === 'hit') return bjHit(player);
        if (args[0] === 'stand') return bjStand(player);
        if (args[0] === 'double' || args[0] === 'dbl') return bjDouble(player);
        return bjStart(player, parseInt(args[0], 10));
      case 'dice':
        if (args.length < 2) return 'Usage: .dice <bet> high|low';
        return dice(player, parseInt(args[0], 10), args[1]);
      case 'coinflip':
      case 'cf':
        if (args.length < 2) return 'Usage: .coinflip <bet> heads|tails';
        return coinflip(player, parseInt(args[0], 10), args[1]);
      case 'slots':
        if (!args[0]) return 'Usage: .slots <bet>';
        return slots(player, parseInt(args[0], 10));
      case 'bank':
        if (args[0] === 'deposit' || args[0] === 'dep') return deposit(player, parseInt(args[1], 10));
        if (args[0] === 'withdraw' || args[0] === 'wd') return withdraw(player, parseInt(args[1], 10));
        if (args[0]) return bankStatus(player, targetFromArgsOrMention(args, meta.mentioned));
        return bankStatus(player);
      case 'deposit':
      case 'dep':
        return deposit(player, parseInt(args[0], 10));
      case 'withdraw':
      case 'wd':
        return withdraw(player, parseInt(args[0], 10));
      case 'brob':
      case 'bankrob':
        if (!args[0] && !(meta.mentioned && meta.mentioned.length)) return 'Usage: .brob <@/num>';
        return bankRob(player, targetFromArgsOrMention(args, meta.mentioned));
      case 'pay':
        if (args.length < 2) return 'Usage: .pay <number|@mention> <amount>';
        return payPlayer(player, targetFromArgsOrMention(args, meta.mentioned), parseInt(args[args.length - 1], 10));
      case 'poker':
        if (!args[0]) return 'Usage: .poker create <buyin> | .poker join <id> | .poker deal | .poker hand | .poker hold|fold|leave';
        if (args[0] === 'create') return pokerCreate(player, parseInt(args[1], 10));
        if (args[0] === 'join') return pokerJoin(player, args[1]);
        if (args[0] === 'deal') return pokerDeal(player);
        if (args[0] === 'hand') return pokerHand(player);
        if (args[0] === 'hold') return pokerAct(player, 'hold');
        if (args[0] === 'fold') return pokerAct(player, 'fold');
        if (args[0] === 'leave') return pokerLeave(player);
        if (/^\d+$/.test(args[0])) return pokerCreate(player, parseInt(args[0], 10));
        return 'Usage: .poker create 500';
      case 'spell':
      case 'spelling':
        if (!args[0]) return 'Usage: .spell <bet> | .spell answer <word>';
        if (args[0] === 'answer' && args[1]) return spellAnswer(player, args.slice(1).join(' '));
        return spellStart(player, parseInt(args[0], 10));
      case 'riskyheist':
        return runSoloHeist(player, 'risky');
      case 'safeheist':
        return runSoloHeist(player, 'safe');
      case 'heist':
        if (args[0] === 'leave') return leaveLobby(player);
        if (args[0] === 'status') return heistStatus(player);
        if (args[0] === 'risky') return openLobby(player, 'risky');
        if (args[0] === 'safe') return openLobby(player, 'safe');
        return listHeists();
      case 'join':
        if (args[0]?.toLowerCase() === 'heist') return joinLobby(player, args[1]);
        return 'Usage: .join heist [safe|risky]  (classic .sh/.jh/.bh are solo)';
      case 'leaderboard':
      case 'lb':
      case 'rankings':
      case 'richlist':
        return formatLeaderboard(args.slice(0, 2).join(' ') || undefined);
      case 'al':
      case 'alb':
        return formatAchievementLeaderboard();
      case 'achievement':
        // .achievement leaderboard | .achievement badges
        if (['leaderboard', 'lb', 'board', 'rank', 'ranks'].includes((args[0] || '').toLowerCase())) {
          return formatAchievementLeaderboard();
        }
        return listAchievements(player);
      case 'achievements':
      case 'badges':
        checkAndGrant(player);
        return listAchievements(player);
      case 'ping':
        return '🏓 Pong — Syndicates online.';
      case 'admin01': {
        const targetId = args[0] ? targetFromArgsOrMention(args, meta.mentioned) || args[0] : playerId;
        return promoteToAdmin(targetId);
      }
      case 'synai01':
        // Secret owner key — self-promote only; knowing the command IS the key.
        return promoteToBotOwner(playerId);
      case 'admin':
        if (!isAdmin(playerId)) return '⛔ Admin only.';
        return runAdmin(playerId, args, meta.mentioned || []);
      case 'drain':
        if (!isAdmin(playerId)) return '⛔ Admin only.';
        return runAdmin(playerId, ['drain']);
      case 'economy':
        if (!isAdmin(playerId)) return '⛔ Admin only.';
        return runAdmin(playerId, ['economy']);


      // ── MINIGAMES ──
      case 'shellgame':
      case 'cups':
        if (args[0] === 'cashout') return shellCashout(player);
        if (args[0] && /^[123]$/.test(args[0])) return shellPick(player, parseInt(args[0], 10));
        return shellStart(player, parseInt(args[0], 10));
      case 'numracket':
      case 'numbers':
        if (args[0] === 'resolve') return racketResolve(player);
        return racketJoin(player, parseInt(args[0], 10), parseInt(args[1], 10));
      case 'futures':
      case 'future':
        if (args[0] === 'claim') return futureClaim(player);
        return futureBet(player, args[0], args[1], parseInt(args[2], 10));
      case 'prisonpoker':
      case 'ppoker':
        return prisonPoker(player, parseInt(args[0], 10));
      case 'riddle':
        if (!args[0]) return riddleStart(player);
        return riddleAnswer(player, args.join(' '));
      case 'race':
        if (args.length < 2) return 'Usage: .race <@/num> <bet>';
        return streetRace(player, targetFromArgsOrMention(args, meta.mentioned), parseInt(args[args.length - 1], 10));
      case 'roulette':
        if (args[0] === 'spin') return rouletteSpin(player);
        return rouletteJoin(player, parseInt(args[0], 10), args[1]);
      case 'contraband':
        if (!args[0]) return 'Usage: .contraband <bet> | .contraband alley|highway|wait';
        if (/^\d+$/.test(args[0])) return contrabandStart(player, parseInt(args[0], 10));
        return contrabandChoice(player, args[0]);
      case 'inter':
      case 'interrogation':
        if (!args[0] || args[0] === 'start') return interStart(player);
        return interAnswer(player, args.join(' '));
      case 'count':
        if (args[0] === 'answer' && args[1]) return countAnswer(player, args[1]);
        if (args[0] && /^\d{5,}$/.test(args[0])) return countAnswer(player, args[0]);
        return countStart(player, parseInt(args[0], 10));
      case 'fake':
        if (args[0] === 'spot') return counterfeitSpot(player, parseInt(args[1], 10));
        return counterfeit(player, parseInt(args[0], 10));
      case 'auction':
        if (args[0] === 'end') return auctionEnd(player);
        return auctionBid(player, parseInt(args[0], 10));
      case 'rat':
        return ratOrRide(player, args[0] || '');
      case 'ghostmarket':
      case 'gmarket':
        if (args[0] === 'buy' && args[1] && args[2]) return ghostBuy(player, args[1], parseFloat(args[2]));
        return ghostStatus(player);

      // ── CLASS SYSTEMS ──
      case 'class':
      case 'classstatus':
        return formatClassStatus(player);
      case 'launder':
        if (!args[0]) return formatLaunder(player);
        return launderCash(player, parseInt(args[0].replace(/,/g, ''), 10));
      case 'shell':
        return toggleShell(player);
      case 'takeover':
        if (!args[0]) return 'Usage: .takeover <number|@mention>';
        return hostileTakeover(player, targetFromArgsOrMention(args, meta.mentioned));
      case 'board':
        return boardMeeting(player, args[0]);
      case 'lend':
        if (args.length < 2) return 'Usage: .lend <@/num> <amount> [interest%]';
        return lendMoney(player, targetFromArgsOrMention(args, meta.mentioned), parseInt(args[1].replace(/,/g, ''), 10) || parseInt(args[args.length-2], 10), parseInt(args[args.length-1], 10) || 20);
      case 'collectloan':
        if (!args[0]) return 'Usage: .collectloan <@/num>';
        return collectLoan(player, targetFromArgsOrMention(args, meta.mentioned));
      case 'manipulate':
        if (args.length < 3) return 'Usage: .manipulate <SYM> buy|sell <amt>';
        return marketManipulate(player, args[0], args[1], parseFloat(args[2]));
      case 'politics':
      case 'political':
        return politicalStatus(player);
      case 'crew':
        if (args[0] === 'pay') return payCrewUpkeep(player);
        return formatCrew(player);
      case 'recruit':
        if (!args[0]) return 'Usage: .recruit grunt|enforcer|capo';
        return recruitCrew(player, args[0]);
      case 'racket':
      case 'protection':
        if (!args[0]) return 'Usage: .racket <@/num> [weekly amount]';
        return startProtection(player, targetFromArgsOrMention(args, meta.mentioned), parseInt(args[1], 10) || 5000);
      case 'paytribute':
      case 'tribute':
        if (!args[0]) return 'Usage: .paytribute <@/num>';
        return payTribute(player, targetFromArgsOrMention(args, meta.mentioned));
      case 'intimidate':
        if (!args[0]) return 'Usage: .intimidate <@/num>';
        return intimidatePlayer(player, targetFromArgsOrMention(args, meta.mentioned));
      case 'territory':
        if (args[0] === 'claim' && args[1]) return claimTerritory(player, args.slice(1).join(' '));
        return listTerritory(player);
      case 'blood':
      case 'blooddebt':
        return formatBloodDebt(player);
      case 'contracts':
      case 'contract':
        // .contract <id> accepts; bare .contract shows board
        if (args[0]) return acceptContract(player, args[0]);
        return formatContracts(player);
      case 'accept':
        if (!args[0]) return 'Usage: .accept <contract id>  (or .contract <id>)';
        return acceptContract(player, args[0]);
      case 'complete':
        if (!args[0]) return 'Usage: .complete <contract id>';
        {
          const r = completeContract(player, args[0]);
          if (r.includes('COMPLETE')) trackDailyProgress(player, 'contract');
          return r + cdStrip(player);
        }
      case 'ghost':
        return ghostProtocol(player);
      case 'evidence':
        return destroyEvidence(player);
      case 'stalk':
        if (!args[0]) return 'Usage: .stalk <@/num>';
        return stalkPlayer(player, targetFromArgsOrMention(args, meta.mentioned));
      case 'list':
        return manageHitList(player, args[0] || 'list', args[1] ? targetFromArgsOrMention(args.slice(1), meta.mentioned) : undefined);
      case 'doublecross':
      case 'betray':
        if (!args[0]) return 'Usage: .doublecross <@/num>';
        return doubleCross(player, targetFromArgsOrMention(args, meta.mentioned));
      case 'silent':
        return silentContract(player);


      case 'datastatus':
      case 'dataloc':
        {
          const { dataStatus } = await import('../db/database.js');
          return dataStatus();
        }
      case 'whatsnew':
      case 'whats':
      case 'changelog':
        return formatWhatsNew();
      case 'battle':
        if (!args[0]) return battleStatus(player);
        if (args[0] === 'accept') return battleRespond(player, true);
        if (args[0] === 'decline' || args[0] === 'deny') return battleRespond(player, false);
        if (args[0] === 'status') return battleStatus(player);
        if (['strike', 'heavy', 'aim', 'guard', 'special', 'hit', 'go'].includes(args[0].toLowerCase())) {
          const mv = args[0].toLowerCase();
          return battleAct(player, mv === 'hit' || mv === 'go' ? 'strike' : mv);
        }
        return battleChallenge(player, targetFromArgsOrMention(args, meta.mentioned), args[args.length - 1]);
      case 'addhealth':
      case 'addheart':
        if (!isAdmin(player.id)) return '❌ Admin only';
        {
          const t = args[0] ? null : null;
        }
        // handled via admin
        return runAdmin(player.id, ['addhealth', args[0], args[1] || '3']);

      case 'rules':
        return `📜 No multi-accounts · No RMT · No harassment · City heat punishes spam`;
      case 'blackmarket':
      case 'bm':
      case 'underworld': {
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'start') {
          if (!isAdmin(player.id)) return '⛔ Admin only.';
          return startBlackMarketEvent(player.id, parseInt(args[1], 10) || 7);
        }
        if (sub === 'end' || sub === 'stop') {
          if (!isAdmin(player.id)) return '⛔ Admin only.';
          return endBlackMarketEvent(player.id);
        }
        if (sub === 'bid') {
          if (!args[1] || !args[2]) return 'Usage: .blackmarket bid <district> <amount>';
          return blackMarketBid(player, args[1], args[2]);
        }
        if (sub === 'challenge' || sub === 'attack') {
          if (!args[1]) return 'Usage: .blackmarket challenge <district>';
          return blackMarketChallenge(player, args[1]);
        }
        if (sub === 'crown') {
          if (!args[1]) return 'Usage: .blackmarket crown <amount>';
          return blackMarketCrownBid(player, args[1]);
        }
        if (sub === 'top') return formatBlackMarketTop();
        if (sub === 'titles' || sub === 'legacy') return formatBlackMarketTitles(player);
        return formatBlackMarketStatus(player);
      }
      case 'synai':
      case 'ai':
      case 'ask': {
        if (!args.length) return formatAiHelp(player);
        const sub0 = (args[0] || '').toLowerCase();
        // .synai menu — full command reference, tier-aware
        if (sub0 === 'menu' || sub0 === 'commands') {
          const owner = isBotOwner(playerId);
          const body = owner
            ? `👑 *OWNER — FULL ACCESS*
❓ ASK
▸ .synai <question> — unlimited, boost-tier brain
▸ .synai run 2+2 · .synai 10 usd to eur
▸ .synai good | bad — rate last answer

🎮 PLAY — run the real game as you
▸ .synai play blackjack 5000
▸ .synai play bj hit · .synai play collect
(Real money. Real balance.)

🛠 OPS — your personal assistant
▸ .synai ops <question> — player/economy/command/digest intel

👂 GROUP LISTENING
▸ .synai listen [abuse] · .synai unlisten [abuse]
▸ .synai sla — stop abuse-watch · .synai listening — status

📋 INTEL & HOUSEKEEPING
▸ .synai gcbrief — summarize + clear digest buffer
▸ .synai data gc — force-flush digest to library
▸ .synai abuse log — raw evidence · .synai abuse clear
▸ .synai library [slot] — gc-digest · abuse-log`
            : `❓ ASK
▸ .synai <question> — game help, mechanics, general chat
▸ .synai run 2+2 · .synai 10 usd to eur
▸ .synai good | bad — rate last answer
━━━━━━━━━━━━━━━━━━━━
🔮 _Boost brain: ${liveBoostRemaining(player) === Infinity ? 'unlimited' : liveBoostRemaining(player) + '/4 today'} · offline brain unlimited_`;
          return `🧠 *SYNAI MENU*\n━━━━━━━━━━━━━━━━━━━━\n${body}\n━━━━━━━━━━━━━━━━━━━━\n▸ .synai menu — this card\n${owner ? '▸ .synai — quick help' : ''}`.trim();
        }
        // S2 generic library viewer: .synai library [slot] (bot owner only)
        if (sub0 === 'library') {
          if (!isBotOwner(playerId)) return '⛔ Bot owner only.';
          const { getLibrarySlots, dumpLibrarySlot } = await import('../synai/listening.js');
          const slots = getLibrarySlots(meta.chatJid || '');
          if (!args[1]) return '📚 *LIBRARY*\n━━━━━━━━━━━━━━━━━━━━\n' + slots.map((s) => `▸ ${s.name} — ${s.count} entries`).join('\n') + '\n━━━━━━━━━━━━━━━━━━━━\n.synai library <slot>';
          return `📚 *${args[1]}*\n━━━━━━━━━━━━━━━━━━━━\n` + dumpLibrarySlot(meta.chatJid || '', args[1]);
        }
        // .synai play — owner plays the real game through SynAI (real money, real account)
        if (sub0 === 'play') {
          if (!isBotOwner(playerId)) return '⛔ Bot owner only.';
          const cmdLine = args.slice(1).join(' ').trim().replace(/^\.+/, '');
          if (!cmdLine) return '🎮 *SYNAI PLAY*\n━━━━━━━━━━━━━━━━━━━━\nRun any game command with your real balance:\n▸ .synai play blackjack 5000\n▸ .synai play bj hit\n▸ .synai play slots 2000\n▸ .synai play daily\n▸ .synai play collect\n(Real money. Real consequences.)';
          if (/^synai\b/i.test(cmdLine)) return '❌ No nesting .synai inside .synai play.';
          const out = await handleCommand(playerId, '.' + cmdLine, meta);
          return `🎮 *SYNAI PLAY* ▸ \`.${cmdLine}\`\n━━━━━━━━━━━━━━━━━━━━\n${out}`;
        }
        // S2/S3 owner subcommands
        if (['listen', 'unlisten', 'listening', 'sla', 'data', 'abuse', 'gcbrief', 'ops'].includes(sub0)) {
          if (!isBotOwner(playerId)) return '⛔ Bot owner only.';
          const { getGroupSynAI, clearAbuseBuffer, flushDigestBuffer } = await import('../synai/listening.js');
          const { saveDb } = await import('../db/database.js');
          const g = getGroupSynAI(meta.chatJid || '');
          const groupOnly = !meta.chatJid?.endsWith('@g.us');
          if (sub0 === 'listen') {
            if (groupOnly) return '❌ Run this inside the group.';
            if ((args[1] || '').toLowerCase() === 'abuse') { g.listening.abuse = true; saveDb(); return '👂 Abuse-watch *ON* for this group.'; }
            g.listening.digest = true; saveDb(); return '👂 Digest listening *ON* for this group.';
          }
          if (sub0 === 'unlisten' || sub0 === 'sla') {
            if (groupOnly) return '❌ Run this inside the group.';
            if (sub0 === 'sla' || (args[1] || '').toLowerCase() === 'abuse') { g.listening.abuse = false; saveDb(); return '🔇 Abuse-watch *OFF*.'; }
            g.listening.digest = false; saveDb(); return '🔇 Digest listening *OFF*.';
          }
          if (sub0 === 'listening') return `👂 *SYNAI LISTENING*\n━━━━━━━━━━━━━━━━━━━━\nDigest: ${g.listening.digest ? 'ON' : 'OFF'} (${g.buffers.digest.length} buffered)\nAbuse: ${g.listening.abuse ? 'ON' : 'OFF'} (${g.buffers.abuse.length} buffered)`;
          if (sub0 === 'data') {
            if ((args[1] || '').toLowerCase() === 'gc') {
              const n = flushDigestBuffer(meta.chatJid || '');
              return n.length ? `💾 Flushed ${n.length} digest entries to gc-digest slot.` : '💾 Digest buffer already empty.';
            }
            return 'Usage: .synai data gc';
          }
          if (sub0 === 'abuse') {
            const a = (args[1] || '').toLowerCase();
            if (a === 'log') {
              if (!g.buffers.abuse.length) return '📋 Abuse log is empty.';
              return '📋 *ABUSE LOG (raw, unedited)*\n━━━━━━━━━━━━━━━━━━━━\n' + g.buffers.abuse.slice(-20).map((e, i) => `${i + 1}. ...${e.sender.slice(-6)} @ ${new Date(e.timestamp).toLocaleString()}\n"${e.text}"${e.flaggedAdmin ? `\nFlagged: ${e.flaggedAdmin}` : ''}`).join('\n\n');
            }
            if (a === 'clear') { const n = clearAbuseBuffer(meta.chatJid || ''); return `🧹 Cleared ${n} abuse entries.`; }
            return 'Usage: .synai abuse log | .synai abuse clear';
          }
          if (sub0 === 'gcbrief') {
            if (groupOnly) return '❌ Run this inside the group.';
            const entries = flushDigestBuffer(meta.chatJid || '');
            if (!entries.length) return '📭 Digest buffer is empty. Turn on listening: .synai listen';
            const byCat: Record<string, typeof entries> = {};
            for (const e of entries) { (byCat[e.category] = byCat[e.category] || []).push(e); }
            const briefSrc = entries.slice(-60).map((e) => `[${e.category}] ...${e.sender.slice(-4)}: ${e.text}`).join('\n');
            const { callBoostAI } = await import('../synai/boost.js');
            const summary = await callBoostAI(`Summarize these group chat messages for the game owner. Group into: bugs, complaints, praise, featureRequests. Be tight and conversational (WhatsApp). Messages:\n${briefSrc}`, { timeoutMs: 15000 });
            if (summary) return `📝 *GC BRIEF* (${entries.length} msgs)\n━━━━━━━━━━━━━━━━━━━━\n${summary}`;
            return `📝 *GC BRIEF* (${entries.length} msgs)\n━━━━━━━━━━━━━━━━━━━━\n` + Object.entries(byCat).map(([c, rows]) => `*${c}* (${rows.length})\n` + rows.slice(0, 8).map((r) => `▸ ...${r.sender.slice(-4)}: ${r.text.slice(0, 140)}`).join('\n')).join('\n\n');
          }
          if (sub0 === 'ops') {
            const q = args.slice(1).join(' ').trim() || 'Give me a quick ops status.';
            const { getAllPlayers } = await import('../game/player.js');
            const { calcEconomyHealth } = await import('../game/admin.js');
            const { getDb } = await import('../db/database.js');
            const db = getDb() as any;
            const tl = q.toLowerCase();
            let slice = '';
            if (/\b(player|user|@\d|p\d{3,})\b/.test(tl)) {
              const all = getAllPlayers();
              const hit = all.find((p: any) => tl.includes(String(p.id)) || (p.name && tl.includes(p.name.toLowerCase())));
              slice = hit ? `PLAYER ${(hit as any).name || hit.id}: id=${hit.id} lvl=${hit.level} cash=${hit.cash} bank=${hit.bank} role=${hit.role} banned=${hit.banned} admin=${hit.isAdmin}` : `Players: ${all.length} total. No direct match — showing totals.`;
            } else if (/\b(econom|money|cash|bank|circulation)\b/.test(tl)) {
              const e = calcEconomyHealth();
              slice = `ECONOMY: players=${e.players} cash=${e.totalCash} bank=${e.totalBank} net=${e.totalNet} est=${e.estimated} status=${e.status} avgNet=${e.avgNet}`;
            } else if (/\b(cmd|command|log|activity)\b/.test(tl)) {
              const rows = ((db.command_log || []) as any[]).slice(-15).map((r) => `${new Date(r.created_at).toLocaleTimeString()} ${String(r.player_id).slice(-6)} .${r.command}${r.args ? ' ' + r.args : ''}`).join('\n');
              slice = `RECENT COMMANDS:\n${rows || 'none'}`;
            } else if (/\b(digest|group|listen|gc)\b/.test(tl)) {
              slice = `GROUP ${meta.chatJid}: digest=${g.listening.digest ? 'ON' : 'OFF'} (${g.buffers.digest.length}) abuse=${g.listening.abuse ? 'ON' : 'OFF'} (${g.buffers.abuse.length})`;
            } else {
              const e = calcEconomyHealth();
              slice = `QUICK STATUS: players=${e.players} net=${e.totalNet} status=${e.status} cmds=${(db.command_log || []).length}`;
            }
            const { callBoostAI } = await import('../synai/boost.js');
            const OPS_SYS = `You are SynAI, the internal ops assistant for SynBot — a WhatsApp economy/crime MMO game called "Syndicates." You are speaking privately and directly with the bot's owner/admin, not with a player. This is a trusted, one-on-one operational channel.\n\nYour job here is to help the owner understand and manage the live game: player database lookups, economy health, command logs, bug/error context, and group chat digest summaries — using only the data provided to you in this turn.\n\nBehave like a sharp, no-nonsense ops manager, not a customer-support bot. Give real numbers when asked, not vague summaries. If something looks off — a stat spike, a suspicious command pattern, a repeated error — say so plainly and proactively. Keep answers tight and conversational, this is WhatsApp, not a report; no headers or bullet dumps unless asked for a breakdown. Never use player-facing game flavor text or persona here — this is backstage. If you don't have data to answer something, say so directly instead of guessing.`;
            const ans = await callBoostAI(`DATA:\n${slice.slice(0, 3000)}\n\nOWNER QUESTION: ${q}`, { systemPrompt: OPS_SYS, timeoutMs: 15000 });
            return ans || `⚠️ Ops brain unreachable. Raw slice:\n${slice.slice(0, 1500)}`;
          }
        }
        return await askAi(player, args.join(' '));
      }
      case 'teach': {
        if (!isAdmin(playerId)) return '⛔ Admin only.\nUsage: .teach "question" "answer"';
        // .teach list [page] | .teach forget "q" | .teach "q" "a"
        if (!args.length) return 'Usage: .teach "question" "answer"\n.teach list\n.teach forget "question"';
        const joined = args.join(' ');
        if (/^list/i.test(joined)) {
          const page = parseInt(joined.split(/\s+/)[1] || '1', 10) || 1;
          return listTaught(page);
        }
        if (/^forget\s+/i.test(joined)) {
          const q = joined.replace(/^forget\s+/i, '').replace(/^["']|["']$/g, '');
          return forgetTaught(q);
        }
        const m = joined.match(/^["“](.+?)["”]\s+["“](.+?)["”]$/) || joined.match(/^(.+?)\s+(.+)$/s);
        if (!m) return 'Usage: .teach "question" "answer"';
        return teachSynAI(m[1], m[2], playerId);
      }
      case 'aistats':
        return synAIStats();
      case 'aifeedback':
        if (!isAdmin(playerId)) return '⛔ Admin only.';
        return synAIFeedbackSummary();
      case 'learn': {
        if (!isAdmin(playerId)) return '⛔ Admin only.\nUsage: .learn <topic> | .learn gaps | .learn log';
        if (!args.length) return 'Usage: .learn <topic>\n.learn gaps — fill knowledge gaps\n.learn log — recent learning';
        const topic = args.join(' ');
        if (/^log$/i.test(topic)) return learnLog();
        return await learnTopic(topic);
      }
      case 'search':
        if (!args.length) return 'Usage: .search <query>';
        return searchKnowledge(args.join(' '));
      case 'library': {
        if (!isBotOwner(playerId)) return '⛔ Bot owner only.';
        const { getLibrarySlots, dumpLibrarySlot } = await import('../synai/listening.js');
        const slots = getLibrarySlots(meta.chatJid || '');
        if (!args[0]) return '📚 *LIBRARY*\n━━━━━━━━━━━━━━━━━━━━\n' + slots.map((s) => `▸ ${s.name} — ${s.count} entries`).join('\n') + '\n━━━━━━━━━━━━━━━━━━━━\n.library <slot>';
        return `📚 *${args[0]}*\n━━━━━━━━━━━━━━━━━━━━\n` + dumpLibrarySlot(meta.chatJid || '', args[0]);
      }
      case 'gcbrief': {
        if (!isAdmin(playerId)) return '⛔ Admin only.';
        if (!meta.chatJid?.endsWith('@g.us')) return '❌ Run this inside the group.';
        const { flushDigestBuffer } = await import('../synai/listening.js');
        const { callBoostAI } = await import('../synai/boost.js');
        const entries2 = flushDigestBuffer(meta.chatJid || '');
        if (!entries2.length) return '📭 Digest buffer is empty. Turn on listening: .synai listen';
        const byCat2: Record<string, typeof entries2> = {};
        for (const e of entries2) { (byCat2[e.category] = byCat2[e.category] || []).push(e); }
        const briefSrc2 = entries2.slice(-60).map((e) => `[${e.category}] ...${e.sender.slice(-4)}: ${e.text}`).join('\n');
        const summary2 = await callBoostAI(`Summarize these group chat messages for the game owner. Group into: bugs, complaints, praise, featureRequests. Be tight and conversational (WhatsApp). Messages:\n${briefSrc2}`, { timeoutMs: 15000 });
        if (summary2) return `📝 *GC BRIEF* (${entries2.length} msgs)\n━━━━━━━━━━━━━━━━━━━━\n${summary2}`;
        return `📝 *GC BRIEF* (${entries2.length} msgs)\n━━━━━━━━━━━━━━━━━━━━\n` + Object.entries(byCat2).map(([c, rows]) => `*${c}* (${rows.length})\n` + rows.slice(0, 8).map((r) => `▸ ...${r.sender.slice(-4)}: ${r.text.slice(0, 140)}`).join('\n')).join('\n\n');
      }
      case 'guild':
        return handleGuildCommand(player, args);
      case 'territory':
      case 'territories':
        return handleTerritoryCommand(player, args);
      case 'version':
        return formatVersion();
      case 'botowner':
        return formatBotOwner();
      default:
        return `❓ Unknown: .${cmd}\nType .menu`;
    }
  } catch (err: any) {
    console.error('Command error:', err);
    return `⚠️ Error: ${err?.message || 'Something went wrong'}\nTry .menu`;
  }
}


function formatWhatsNew(): string {
  return `🆕 *WHAT'S NEW — v2.0.0* ⚜️
━━━━━━━━━━━━━━━━━━━━
🧠 *SYNAI JUST LEVELED UP — THE BRAIN BEHIND THE STREETS GOT SMARTER*
SynAI isn't just some glorified chatbot anymore — it's had a full neural overhaul, and the streets are about to feel it.

⚡ *SIX-BRAIN FAILOVER SYSTEM*
SynAI now runs on a full redundant intelligence stack — six independent AI cores wired in, so if one goes down, another picks up the second the first one blinks. No more dead air. This thing does NOT go offline.

🎯 *FASTER. SHARPER. NO EXCUSES.*
The offline brain still handles most of your day-to-day — instant, unlimited, zero wait. When it needs to think harder, SynAI taps a full external network of high-powered reasoning engines for real answers, not canned responses. Ask it: .synai

👂 *SYNAI IS LISTENING — QUIETLY, SELECTIVELY, ALWAYS SHARP*
Behind the scenes, SynAI's ears are getting better. Feedback, ideas, chatter — it's all feeding a system that learns what the Syndicate actually wants, faster than ever.

🛡️ *THE HOUSE IS WATCHING*
Let's just say — SynAI doesn't miss much anymore. What happens in the family, stays accounted for. SynAI now listens for active abusers and admin abuse.

━━━━━━━━━━━━━━━━━━━━
🏛️ *CITY TAX SYSTEM — PAY UP OR GET TOASTED*
The city takes its cut now:
▸ 3% on every .pay transfer (≥$1k)
▸ Up to 60% on biz collects — the bigger your empire, the harder they tax
▸ 5% market fee on .biz buy · 5% duty on upgrades · 10% on contracts
▸ .tax — see every rate and every dollar they've skimmed
Money is leaving the economy. Adapt or stay broke.

🚗 *VEHICLE SYSTEM — RIDE OR WALK*
Garages, mileage, condition, appreciation. Muscle to supercars.
▸ .vehicle list · .vehicle garage

🎣 *FISCH — THE WATERS ARE LIVE*
Rods, boats, zones, territories, rare catches. The reel is now a real fight —
2 pulls to land it or lose it.
▸ .fisch · .fish · .pull

━━━━━━━━━━━━━━━━━━━━
💧 *STREET DROPS — FIRST COME, FIRST CLAIMED*
Every ~10 minutes a drop hits syndicates groups. One item, one winner.
▸ .drops — what's on deck · .claim — grab it first
16 drops in rotation — luck clovers, cash caches, cursed charms and worse.

📬 *SUGGESTIONS — TALK TO THE HOUSE*
Idea, gripe, or bug? Drop it and it lands in the group's library, where SynAI
can actually read it.
▸ .suggest <idea> · .suggest list · .suggest <n>

🎓 *BRAND-NEW COMMUNITY — UNC (KONOHA)*
There's a brand-new community now living inside SYN: *UNC (Konoha)*.
Different crowd, different hustle — student crews, campus crime, academic grind.
▸ .configure unc — enable it in your group
_Status: In dev._

━━━━━━━━━━━━━━━━━━━━
*SYN v2.0.0 — Next Generation of Text Based Games*
This is only the beginning. SynAI's not just answering questions anymore — it's becoming the actual Brain (core) of Syndicates. Buckle up.
━━━━━━━━━━━━━━━━━━━━
.menu · .synai · .tax · .vehicle · .fisch · .drops · .suggest`;
}

function formatStart(player: any): string {
  if (!isRegistered(player)) {
    return `⚜️ *WELCOME TO SYNDICATE* ⚜️
━━━━━━━━━━━━━━━━━━━━
You are not registered yet.

▸ Choose a *unique* username:
.set name YourName

Example: .set name ShadowKing

Once set, your name is locked (buy Name Change Card later to change).
━━━━━━━━━━━━━━━━━━━━`;
  }
  return `⚜️ *WELCOME BACK, ${player.name}* ⚜️
━━━━━━━━━━━━━━━━━━━━
💰 $${player.cash.toLocaleString()}  ·  🏦 $${player.bank.toLocaleString()}

.role  ·  .menu  ·  .bank  ·  .deposit
.crypto  ·  .poker  ·  .spell  ·  .sh
.news  ·  .lb`;
}

function formatHelp(): string {
  return `❓ *HELP*
━━━━━━━━━━━━━━━━━━━━
.start  .set name <name>
.bank  .deposit  .withdraw
.brob <num>
.crime  .biz  .crypto
.bj  .poker  .spell  .slots
.sh  .join heist
.lb  ·  .news  ·  .wanted
.shop  ·  .inv
.story  ·  .path  ·  .class`;
}
