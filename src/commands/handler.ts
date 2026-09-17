import { getOrCreatePlayer, formatProfile, setUsername, getPlayer, playerExists, isRegistered, linkIdentities } from '../game/player.js';
import { runCrime, listCrimes, getWantedStatus } from '../game/crime.js';
import { formatMenu } from '../game/menu.js';
import { formatPlatformMenu, formatVersion, formatBotOwner } from '../game/platform.js';
import { handleGuildCommand, handleTerritoryCommand } from '../game/guild.js';

import { formatGuide, formatStory } from '../game/guide.js';
import { isAdmin, runAdmin, promoteToAdmin } from '../game/admin.js';
import { listAchievements, checkAndGrant, tryGrantFounder, formatBadgeLine } from '../game/achievements.js';
import { logCommand } from '../systems/commandLogger.js';
import { formatRoleSelect, setRole } from '../game/roles.js';
import { listBusinesses, buyBusiness, collectBusinesses, upgradeBusiness, insureBusiness } from '../game/businesses.js';
import { robPlayer, raidPlayer, hitPlayer, revengeRob, launderPlayer } from '../game/pvp.js';
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
import { askAi, formatAiHelp } from '../game/ai.js';
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
      case 'claim':
        // bounty claim if looks like p#; else contract accept path may conflict — prefer bounty when p*
        if (args[0] && /^p/i.test(args[0])) return claimBounty(player, args[0]);
        if (!args[0]) return 'Usage: .claim <bounty id>  or  .accept <contract id>';
        return claimBounty(player, args[0]);
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
      case 'ask':
        if (!args.length) return formatAiHelp(player);
        return await askAi(player, args.join(' '));
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
  return `🆕 *WHAT'S NEW — v2.1.0*
━━━━━━━━━━━━━━━━━━━━
• SYN platform: .menu game list
• .configure syndicates|utility (max 2)
• Konoha module — coming soon
• Channel brand footer on menu
• .utility 40+ tools · polished UI
• .count number auto-deletes in 2s
• .sticker download hardened
• .guild · .territory · guild battle
• .version · .botowner (Exodial)
━━━━━━━━━━━━━━━━━━━━
.menu · .configure status · .utility`;
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
