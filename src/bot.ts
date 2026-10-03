import './config/env.js'; // loads git-ignored .env FIRST (OPENROUTER_API_KEY etc.)
import {
  startWhatsApp,
  setMessageHandler,
  setInteractionHandler,
  resolveSenderCandidates,
  sendWithLogo,
  sendWithCity,
  sendText,
  sendWithProfile,
  sendWithAchievementsLb,
  sendWithStore,
  sendWithCrypto,
  sendWithMenu,
  deleteMessage,
  sendImageFile,
  sendStickerBuffer,
  sendStickerWithMeta,
  groupParticipantAction,
  getSocket,
  reactForCommand,
} from './connection/whatsapp.js';
import { dispatchInteraction } from './systems/interactions.js';
import {
  sendGif,
  pickSynAiGif,
  canSendSynAiGif,
  markSynAiGifSent,
} from './systems/gifLibrary.js';
import { startQrServer } from './connection/qrServer.js';
import { runLoadingAnimation, finalizeWithEdit } from './connection/loadingAnimation.js';
import { hasAiGif, startAiGif, stopAiGif } from './synai/aiGif.js';
import { logLiveBoostEnvStatus } from './game/ai.js';
import { getOrCreatePlayer, linkIdentities } from './game/player.js';
import { isAdmin, isBotOwner } from './game/admin.js';
import { startDrops } from './game/drops.js';
import {
  registerAllButtonHandlers,
  REEL_PULL_BUTTON,
  BITE_REEL_BUTTON,
  STRUGGLE_BUTTONS,
  DUEL_BUTTONS,
  KRAKEN_BUTTONS,
  BOSS_ATTACK_BUTTON,
  BJ_BUTTONS,
  SLOT_BUTTONS,
  DICE_BUTTONS,
  COIN_BUTTONS,
} from './systems/buttonHandlers.js';
import { sendButtonMessage } from './systems/interactions.js';
import { generateFollowUpButtons } from './synai/followups.js';
import { recordUserTurn, recordAssistantTurn, conversationMessagesForPrompt, expandPercentFollowUp, markBotMessage } from './synai/conversation.js';
import { isImageRequest, extractImagePrompt, generateImage } from './synai/images.js';
import { buildSyndicatesContext } from './synai/playerContext.js';
import { HEIST_JOIN_BUTTON, MERCHANT_EXCHANGE_BUTTON } from './systems/buttonHandlers.js';
import { sendWantedBoard } from './systems/wantedBoard.js';
import { startSeasonalEvents } from './systems/seasonalEvents.js';
import { sendRandomGif } from './systems/gifLibrary.js';
import { handleCommand } from './commands/handler.js';
import {
  shouldDeleteForAntiword,
  nsfwCmd,
  formatModMenu,
  antiwordCmd,
} from './game/groupTools.js';
import {
  formatAnnouncement,
  formatEventStatus,
  startGiftboxEvent,
  stopEvent,
  getActiveEvent,
} from './game/events.js';
import { dataStatus, forceBackup, getDbPath, getDb } from './db/database.js';
import {
  formatPlatformMenu,
  configureGroup,
  commandAllowed,
  formatVersion,
  formatBotOwner,
  hasModule,
  SYN_TAGLINE,
  CHANNEL_URL,
} from './game/platform.js';
import { runUtility, formatUtilityMenu } from './game/utilityPack.js';
import { handleGuildCommand, handleTerritoryCommand } from './game/guild.js';

import fs from 'fs';
import path from 'path';
import { downloadContentFromMessage, downloadMediaMessage } from '@whiskeysockets/baileys';

const LB_PATH = path.join(process.cwd(), 'assets', 'leaderboard.jpg');

// Load economy (prefers syndicates-LIVE.json when richer)
const _db = getDb();
console.log(`
⚜️  S Y N D I C A T E  ⚜️
WhatsApp Criminal MMO Bot
Data: ${getDbPath()}
Players: ${Object.keys(_db.players || {}).length}
`);

async function sendWithLeaderboard(chatJid: string, caption: string, sock: any, quotedMsg?: any) {
  const opts = quotedMsg ? { quoted: quotedMsg } : {};
  if (fs.existsSync(LB_PATH)) {
    await sock.sendMessage(chatJid, { image: fs.readFileSync(LB_PATH), caption }, opts);
  } else {
    await sock.sendMessage(chatJid, { text: caption }, opts);
  }
}


// ── Group helpers (LID-safe) ─────────────────────────────────────────────
const jidDigits = (j: any) => String(j || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
/** Find a group participant by any id form (phone jid, @lid, or phoneNumber). */
function findParticipant(meta: any, ...ids: any[]) {
  const wanted = ids.map(jidDigits).filter(Boolean);
  if (!wanted.length) return undefined;
  return (meta?.participants || []).find((p: any) =>
    [p.id, p.lid, p.phoneNumber].some((v: any) => v && wanted.includes(jidDigits(v))));
}
/** Raw mentioned JIDs + replied-to author, untouched (keeps @lid ids intact). */
function targetJidsFromMessage(raw: any): string[] {
  const msg = raw?.message || {};
  const ctx = msg.extendedTextMessage?.contextInfo || msg.imageMessage?.contextInfo || msg.videoMessage?.contextInfo;
  const out: string[] = [...(ctx?.mentionedJid || [])];
  if (!out.length && ctx?.participant) out.push(ctx.participant);
  return out.map(String);
}

function mentionedPhones(raw: any): string[] {
  const mentioned: string[] = [];
  try {
    const msg = raw.message || {};
    const ctx =
      msg.extendedTextMessage?.contextInfo ||
      msg.imageMessage?.contextInfo ||
      msg.videoMessage?.contextInfo ||
      msg.stickerMessage?.contextInfo ||
      msg.buttonsResponseMessage?.contextInfo ||
      msg.listResponseMessage?.contextInfo ||
      msg.templateButtonReplyMessage?.contextInfo;
    const mj = ctx?.mentionedJid || [];
    for (const j of mj) {
      const num = String(j).replace(/@.*/, '').replace(/[^0-9]/g, '');
      if (num) mentioned.push(num);
    }
    // Also harvest @digits from body text as fallback
    const body =
      msg.extendedTextMessage?.text ||
      msg.conversation ||
      msg.imageMessage?.caption ||
      '';
    for (const m of String(body).matchAll(/@(\d{7,15})/g)) {
      if (!mentioned.includes(m[1])) mentioned.push(m[1]);
    }
  } catch {}
  return mentioned;
}

function extractQuotedImage(raw: any): any | null {
  const msg = raw.message || {};
  const ctx =
    msg.extendedTextMessage?.contextInfo ||
    msg.imageMessage?.contextInfo ||
    msg.viewOnceMessage?.message?.imageMessage;
  const quoted = ctx?.quotedMessage;
  if (quoted?.imageMessage) return quoted.imageMessage;
  if (quoted?.viewOnceMessage?.message?.imageMessage) return quoted.viewOnceMessage.message.imageMessage;
  if (quoted?.viewOnceMessageV2?.message?.imageMessage) return quoted.viewOnceMessageV2.message.imageMessage;
  if (quoted?.stickerMessage) return quoted.stickerMessage;
  if (msg.imageMessage) return msg.imageMessage;
  return null;
}

async function downloadImageBuffer(raw: any, img: any): Promise<Buffer> {
  // Prefer full media download helper when available
  try {
    if (typeof downloadMediaMessage === 'function' && raw) {
      const buff = await downloadMediaMessage(
        raw,
        'buffer',
        {},
        {
          logger: undefined as any,
          reuploadRequest: async (msg: any) => {
            const s = getSocket();
            if (!s) throw new Error('Socket offline');
            return s.updateMediaMessage(msg);
          },
        }
      );
      if (buff && Buffer.isBuffer(buff) && buff.length > 100) return buff;
    }
  } catch (e) {
    console.error('downloadMediaMessage fail', e);
  }
  const stream = await downloadContentFromMessage(img, img.mimetype?.includes('webp') ? 'sticker' : 'image');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

// Button-tap path — does not go through handleCommand()
setInteractionHandler(async (chatJid, senderId, interactionId, raw, sock) => {
  await dispatchInteraction(chatJid, senderId, interactionId, raw, sock);
});

setMessageHandler(async (chatJid, senderId, text, raw, sock) => {
  const isGroup = chatJid.endsWith('@g.us');
  let lower = (text || '').toLowerCase().trim();
  let cmd = lower.split(/\s+/)[0] || '';
  let args = (text || '').trim().split(/\s+/).slice(1);

  // Antiword on ALL group text (before command handling)
  if (isGroup && text && shouldDeleteForAntiword(chatJid, text)) {
    try {
      await deleteMessage(chatJid, raw);
      // optional silent delete — no reply (avoids spam). Uncomment to warn:
      // await sendText(chatJid, '🚫 Word blocked.', raw);
    } catch (e) {
      console.error('antiword delete failed — is bot group admin?', e);
    }
    return;
  }

  // React to every command message (special emoji per command)
  if (cmd.startsWith('.')) {
    try {
      await reactForCommand(chatJid, raw, cmd);
    } catch (e) {
      console.warn('react skip', e);
    }
  }

  const mentioned = mentionedPhones(raw);
  const candidates = resolveSenderCandidates(raw);
  if (senderId && !candidates.includes(senderId)) candidates.unshift(senderId);
  const canonicalId = candidates.length ? linkIdentities(candidates) : senderId;
  const playerId = String(canonicalId || senderId || '').replace(/[^0-9]/g, '');

  // ── Utility / mod commands ──
  // NOTE: .utility/.util is intentionally NOT handled here — it has its own
  // gated handler further down (platform-lock aware). Handling it here too
  // was shadowing that handler entirely, so .utility never reached the real
  // logic and always hit formatModMenu() below instead.
  if (cmd === '.mod' || cmd === '.tools' || cmd === '.tool') {
    await sendText(chatJid, formatModMenu(), raw);
    return;
  }

  if (cmd === '.ping') {
    await sendText(chatJid, `🏓 Pong · ${Date.now() % 1000}ms vibe`, raw);
    return;
  }

  if (cmd === '.bounties' && (args[0]?.toLowerCase() === 'board')) {
    await sendWantedBoard(sock, chatJid);
    return;
  }

  if (cmd === '.runtime' || cmd === '.uptime') {
    const s = Math.floor(process.uptime());
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    await sendText(chatJid, `⏱️ Runtime: ${h}h ${m}m`, raw);
    return;
  }

  if (cmd === '.botstatus' || cmd === '.status') {
    await sendText(chatJid, `🤖 Syn-Bot online\n${dataStatus()}`, raw);
    return;
  }

  if (cmd === '.owner') {
    await sendText(chatJid, formatBotOwner(), raw, { channelBrand: true });
    return;
  }

  if (cmd === '.say' && args.length) {
    await sendText(chatJid, args.join(' '), undefined as any);
    return;
  }

  if (cmd === '.antiword') {
    await sendText(chatJid, antiwordCmd(chatJid, args), raw);
    return;
  }

  if (cmd === '.nsfw') {
    const res = nsfwCmd(chatJid, args);
    if (res.imagePath && fs.existsSync(res.imagePath)) {
      try {
        await sendImageFile(chatJid, res.imagePath, res.text || '', raw);
      } catch (e: any) {
        await sendText(chatJid, `❌ Failed to send image.\n${e?.message || e}`, raw);
      }
    } else {
      await sendText(chatJid, res.text || '❌ NSFW unavailable.', raw);
    }
    return;
  }

  if (cmd === '.announcement' || cmd === '.announce') {
    await sendText(chatJid, formatAnnouncement(), raw);
    return;
  }

  if (cmd === '.event') {
    const sub = (args[0] || 'status').toLowerCase();
    if (sub === 'status') {
      await sendText(chatJid, formatEventStatus() + '\n\n' + formatAnnouncement(), raw);
      return;
    }
    if (sub === 'stop') {
      if (!playerId || !isAdmin(playerId)) {
        await sendText(chatJid, '⛔ Admin only.', raw);
        return;
      }
      await sendText(chatJid, stopEvent(), raw);
      return;
    }
    if (sub === 'start') {
      if (!playerId || !isAdmin(playerId)) {
        await sendText(chatJid, '⛔ Admin only.', raw);
        return;
      }
      const kind = (args[1] || 'giftbox').toLowerCase();
      const hours = parseFloat(args[2] || '10') || 10;
      if (kind.includes('gift')) {
        await sendText(chatJid, startGiftboxEvent(playerId, hours), raw);
      } else {
        await sendText(chatJid, 'Usage: .event start giftbox 10', raw);
      }
      return;
    }
    await sendText(chatJid, formatEventStatus(), raw);
    return;
  }

  if (cmd === '.kick' || cmd === '.promote' || cmd === '.demote') {
    if (!isGroup) {
      await sendText(chatJid, '❌ Groups only.', raw);
      return;
    }
    const action = cmd === '.kick' ? 'remove' : cmd === '.promote' ? 'promote' : 'demote';
    let meta: any;
    try {
      meta = await sock.groupMetadata(chatJid);
    } catch (e: any) {
      await sendText(chatJid, `❌ Couldn't read group info.\n${e?.message || ''}`, raw);
      return;
    }
    const botP = findParticipant(meta, sock.user?.id, (sock.user as any)?.lid);
    const issuer = findParticipant(meta, raw.key?.participant, playerId);
    if (!(issuer?.admin || (playerId && isAdmin(playerId)))) {
      await sendText(chatJid, '⛔ Group *admins* only.', raw);
      return;
    }
    if (!botP?.admin) {
      await sendText(chatJid, '❌ Make the bot a *group admin* first, then retry.', raw);
      return;
    }
    // Targets: @mentions / replied-to user first, then phone numbers typed in args.
    const found = new Map<string, any>();
    for (const j of targetJidsFromMessage(raw)) {
      const part = findParticipant(meta, j);
      if (part) found.set(part.id, part);
    }
    if (!found.size) {
      for (const a of args) {
        const num = String(a).replace(/[^0-9]/g, '');
        if (num.length >= 7) {
          const part = findParticipant(meta, num);
          if (part) found.set(part.id, part);
        }
      }
    }
    if (!found.size) {
      await sendText(chatJid, `Usage: reply to someone or: ${cmd} @user\nOr: ${cmd} <phone number>\n(They must be in this group.)`, raw);
      return;
    }
    const targets: string[] = [];
    const skipped: string[] = [];
    for (const [id, part] of found) {
      const isBot = botP && String(botP.id) === String(id);
      if (isBot || part.admin === 'superadmin' || (action === 'remove' && part.admin && !isAdmin(playerId))) {
        skipped.push(jidDigits(id));
      } else if (action === 'promote' && part.admin) {
        skipped.push(jidDigits(id));
      } else if (action === 'demote' && !part.admin) {
        skipped.push(jidDigits(id));
      } else {
        targets.push(id);
      }
    }
    if (!targets.length) {
      await sendText(chatJid, `⚠️ Nothing to do — skipped ${skipped.length} (bot, owner, admin rules, or already ${action === 'promote' ? 'admin' : 'a member'}).`, raw);
      return;
    }
    try {
      const res: any = await groupParticipantAction(chatJid, action as any, targets);
      const failed = (Array.isArray(res) ? res : []).filter((r: any) => String(r?.status) !== '200');
      const okCount = targets.length - failed.length;
      let msg = okCount > 0 ? `✅ ${cmd.slice(1)} OK · ${okCount} user(s)` : `❌ ${cmd.slice(1)} failed`;
      if (failed.length) msg += `\n⚠️ ${failed.length} failed (code ${failed[0]?.status}).`;
      if (skipped.length) msg += `\nSkipped ${skipped.length}.`;
      await sendText(chatJid, msg, raw);
    } catch (e: any) {
      await sendText(chatJid, `❌ Failed: ${e?.message || 'unknown error'}`, raw);
    }
    return;
  }

  if (cmd === '.tagall' || cmd === '.hidetag' || cmd === '.everyone') {
    if (!isGroup) {
      await sendText(chatJid, '❌ Groups only.', raw);
      return;
    }
    try {
      const meta = await sock.groupMetadata(chatJid);
      const parts = meta.participants || [];
      const textBody = args.join(' ') || (cmd === '.hidetag' ? '‎' : '📢 Attention');
      const mentions = parts.map((p: any) => p.id);
      const hide = cmd === '.hidetag';
      const visible = hide
        ? textBody
        : textBody + '\n\n' + parts.map((p: any) => '@' + String(p.id).split('@')[0]).join(' ');
      await sock.sendMessage(chatJid, { text: visible, mentions }, { quoted: raw });
    } catch (e: any) {
      await sendText(chatJid, `❌ tag failed: ${e?.message || e}`, raw);
    }
    return;
  }

  if (cmd === '.grouplink' || cmd === '.invite') {
    if (!isGroup) {
      await sendText(chatJid, '❌ Groups only.', raw);
      return;
    }
    try {
      const code = await sock.groupInviteCode(chatJid);
      await sendText(chatJid, `🔗 https://chat.whatsapp.com/${code}`, raw);
    } catch (e: any) {
      await sendText(chatJid, `❌ Need admin rights.\n${e?.message || ''}`, raw);
    }
    return;
  }

  if (cmd === '.revoke') {
    if (!isGroup) {
      await sendText(chatJid, '❌ Groups only.', raw);
      return;
    }
    try {
      await sock.groupRevokeInvite(chatJid);
      const code = await sock.groupInviteCode(chatJid);
      await sendText(chatJid, `🔄 Link revoked.\nNew: https://chat.whatsapp.com/${code}`, raw);
    } catch (e: any) {
      await sendText(chatJid, `❌ ${e?.message || e}`, raw);
    }
    return;
  }

  if (cmd === '.listadmins' || cmd === '.admins') {
    if (!isGroup) {
      await sendText(chatJid, '❌ Groups only.', raw);
      return;
    }
    try {
      const meta = await sock.groupMetadata(chatJid);
      const admins = (meta.participants || []).filter((p: any) => p.admin);
      const lines = admins.map((p: any) => `▸ @${String(p.id).split('@')[0]}`).join('\n') || 'None';
      await sock.sendMessage(
        chatJid,
        { text: `👮 *Admins*\n${lines}`, mentions: admins.map((p: any) => p.id) },
        { quoted: raw }
      );
    } catch (e: any) {
      await sendText(chatJid, `❌ ${e?.message || e}`, raw);
    }
    return;
  }



  

  if (cmd === '.gcinfo' || cmd === '.groupinfo') {
    if (!isGroup) {
      await sendText(chatJid, '❌ Groups only.', raw);
      return;
    }
    try {
      const meta = await sock.groupMetadata(chatJid);
      const parts = meta.participants || [];
      const admins = parts.filter((p: any) => p.admin);
      const out = `📋 *GROUP INFO*
━━━━━━━━━━━━━━━━━━━━
Name: *${meta.subject || '—'}*
Members: *${parts.length}*
Admins: *${admins.length}*
Created: ${meta.creation ? new Date(meta.creation * 1000).toLocaleDateString() : '—'}
Desc: ${(meta.desc || '—').slice(0, 120)}
━━━━━━━━━━━━━━━━━━━━`;
      await sendText(chatJid, out, raw);
    } catch (e: any) {
      await sendText(chatJid, `❌ ${e?.message || e}`, raw);
    }
    return;
  }

  if (cmd === '.open') {
    if (!isGroup) {
      await sendText(chatJid, '❌ Groups only.', raw);
      return;
    }
    try {
      await sock.groupSettingUpdate(chatJid, 'not_announcement');
      await sendText(chatJid, '🔓 Group *opened* — everyone can send messages.', raw);
    } catch (e: any) {
      await sendText(chatJid, `❌ Failed. Bot must be *group admin*.\n${e?.message || ''}`, raw);
    }
    return;
  }

  if (cmd === '.close') {
    if (!isGroup) {
      await sendText(chatJid, '❌ Groups only.', raw);
      return;
    }
    try {
      await sock.groupSettingUpdate(chatJid, 'announcement');
      await sendText(chatJid, '🔒 Group *closed* — only admins can send messages.', raw);
    } catch (e: any) {
      await sendText(chatJid, `❌ Failed. Bot must be *group admin*.\n${e?.message || ''}`, raw);
    }
    return;
  }

if (cmd === '.del' || cmd === '.delete' || cmd === '.delete') {
    if (!isGroup) {
      await sendText(chatJid, '❌ Groups only.', raw);
      return;
    }
    // Bot must be admin; issuer should be group admin
    let allowed = false;
    try {
      const meta = await sock.groupMetadata(chatJid);
      const botId = sock.user?.id || '';
      const botNum = String(botId).split(':')[0].replace(/[^0-9]/g, '');
      const botP = meta.participants?.find((x: any) => String(x.id).includes(botNum));
      if (!botP?.admin) {
        await sendText(chatJid, '❌ Bot must be *group admin* to delete messages.', raw);
        return;
      }
      const issuer = meta.participants?.find(
        (x: any) => String(x.id).includes(playerId) || String(x.id).startsWith(playerId)
      );
      allowed = Boolean(issuer?.admin) || isAdmin(playerId);
    } catch {
      allowed = isAdmin(playerId);
    }
    if (!allowed) {
      await sendText(chatJid, '⛔ Group *admins* only.\nReply to a message with `.del`', raw);
      return;
    }
    const ctx = raw.message?.extendedTextMessage?.contextInfo;
    if (!ctx?.stanzaId) {
      await sendText(chatJid, '❌ *Reply* to the message you want deleted.\n`.del`', raw);
      return;
    }
    try {
      const key = {
        remoteJid: chatJid,
        fromMe: Boolean(ctx.participant === undefined && ctx.stanzaId),
        id: ctx.stanzaId,
        participant: ctx.participant,
      };
      // fromMe false for others' messages
      key.fromMe = false;
      if (ctx.participant) key.participant = ctx.participant;
      await sock.sendMessage(chatJid, { delete: key });
      // also try delete the command message
      try { await deleteMessage(chatJid, raw); } catch {}
    } catch (e: any) {
      await sendText(chatJid, `❌ Could not delete.\n${e?.message || e}`, raw);
    }
    return;
  }


  if (cmd === '.sticker' || cmd === '.s') {
    try {
      console.log('[sticker] start');
      const msg = raw.message || {};
      const ctx =
        msg.extendedTextMessage?.contextInfo ||
        msg.imageMessage?.contextInfo ||
        msg.videoMessage?.contextInfo ||
        msg.stickerMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;

      // Prefer quoted media; fall back to captioned image on the same message
      let mediaType: 'image' | 'sticker' | 'video' = 'image';
      let mediaNode: any = null;
      if (quoted?.imageMessage) {
        mediaNode = quoted.imageMessage;
        mediaType = 'image';
      } else if (quoted?.stickerMessage) {
        mediaNode = quoted.stickerMessage;
        mediaType = 'sticker';
      } else if (quoted?.videoMessage) {
        mediaNode = quoted.videoMessage;
        mediaType = 'video';
      } else if (quoted?.viewOnceMessage?.message?.imageMessage || quoted?.viewOnceMessageV2?.message?.imageMessage) {
        mediaNode =
          quoted.viewOnceMessage?.message?.imageMessage ||
          quoted.viewOnceMessageV2?.message?.imageMessage;
        mediaType = 'image';
      } else if (msg.imageMessage) {
        mediaNode = msg.imageMessage;
        mediaType = 'image';
      }

      if (!mediaNode) {
        console.log('[sticker] no media node');
        await sendText(
          chatJid,
          '❌ Reply to a *photo* with `.sticker`\nTip: normal photos work best (not view-once).',
          raw
        );
        return;
      }
      console.log('[sticker] media node found', mediaType, mediaNode.mimetype);

      let buf: Buffer | null = null;

      // Build a proper WAMessage for downloadMediaMessage (quoted content + keys)
      const downloadMsg: any = {
        key: {
          remoteJid: chatJid,
          id: ctx?.stanzaId || raw.key?.id,
          fromMe: false,
          participant: ctx?.participant || raw.key?.participant,
        },
        message:
          mediaType === 'image'
            ? { imageMessage: mediaNode }
            : mediaType === 'sticker'
              ? { stickerMessage: mediaNode }
              : { videoMessage: mediaNode },
      };

      try {
        console.log('[sticker] downloadMediaMessage…');
        const out = await downloadMediaMessage(
          downloadMsg,
          'buffer',
          {},
          {
            logger: undefined as any,
            reuploadRequest: sock.updateMediaMessage.bind(sock),
          }
        );
        if (Buffer.isBuffer(out) && out.length > 100) {
          buf = out;
          console.log('[sticker] download ok', buf.length, 'bytes');
        }
      } catch (e: any) {
        console.error('[sticker] downloadMediaMessage failed', e?.message || e);
      }

      if (!buf) {
        try {
          console.log('[sticker] stream fallback…');
          const kind = mediaType === 'sticker' ? 'sticker' : mediaType === 'video' ? 'video' : 'image';
          const stream = await downloadContentFromMessage(mediaNode, kind as any);
          const chunks: Buffer[] = [];
          for await (const chunk of stream) chunks.push(Buffer.from(chunk));
          buf = Buffer.concat(chunks);
          console.log('[sticker] stream ok', buf.length, 'bytes');
        } catch (e2: any) {
          console.error('[sticker] stream failed', e2?.message || e2);
        }
      }

      // Last resort: full original message download
      if (!buf && msg.imageMessage) {
        try {
          const out = await downloadMediaMessage(
            raw as any,
            'buffer',
            {},
            { logger: undefined as any, reuploadRequest: sock.updateMediaMessage.bind(sock) }
          );
          if (Buffer.isBuffer(out) && out.length > 100) buf = out;
        } catch (e3) {
          console.error('[sticker] raw download fail', e3);
        }
      }

      if (!buf || buf.length < 100) {
        await sendText(
          chatJid,
          '❌ Media not available.\n• Reply directly to a *photo*\n• Re-send the image, then `.sticker`\n• Avoid view-once / restricted forwards',
          raw
        );
        return;
      }

      console.log('[sticker] send…', buf.length);
      try {
        await sendStickerBuffer(chatJid, buf, raw);
        console.log('[sticker] sent');
      } catch (sendErr: any) {
        console.error('[sticker] sticker send failed', sendErr?.message || sendErr);
        await sock.sendMessage(
          chatJid,
          { image: buf, caption: '📎 Could not encode sticker — sent as image' },
          { quoted: raw }
        );
      }
    } catch (e: any) {
      console.error('[sticker] fatal', e);
      await sendText(chatJid, `❌ Sticker error: ${e?.message || e}`, raw);
    }
    return;
  }

  if (cmd === '.steal' || cmd === '.toimg') {
    try {
      const m = raw.message || {};
      const ctx = m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo || m.videoMessage?.contextInfo;
      const quotedSticker = ctx?.quotedMessage?.stickerMessage;
      if (!quotedSticker) {
        await sendText(chatJid, `❌ Reply to a *sticker* with \`${cmd}\``, raw);
        return;
      }
      let buf: Buffer | null = null;
      try {
        const out = await downloadMediaMessage(
          { key: { remoteJid: chatJid, id: ctx?.stanzaId, fromMe: false, participant: ctx?.participant }, message: { stickerMessage: quotedSticker } } as any,
          'buffer', {}, { logger: undefined as any, reuploadRequest: sock.updateMediaMessage.bind(sock) }
        );
        if (Buffer.isBuffer(out) && out.length > 100) buf = out;
      } catch { /* try stream below */ }
      if (!buf) {
        const stream = await downloadContentFromMessage(quotedSticker, 'sticker' as any);
        const chunks: Buffer[] = [];
        for await (const c of stream) chunks.push(Buffer.from(c));
        buf = Buffer.concat(chunks);
      }
      if (!buf || buf.length < 100) {
        await sendText(chatJid, '❌ Could not download that sticker.', raw);
        return;
      }
      if (cmd === '.steal') {
        const pack = (args.join(' ').trim() || raw.pushName || 'SYN').slice(0, 40);
        await sendStickerWithMeta(chatJid, buf, pack, 'SYN Bot', raw);
      } else {
        let png: Buffer = buf;
        try {
          const sharp = (await import('sharp')).default;
          png = await sharp(buf).png().toBuffer();
        } catch (e: any) {
          console.error('[toimg] sharp convert failed, sending original', e?.message || e);
        }
        await sock.sendMessage(chatJid, { image: png, caption: '🖼️ Sticker → image' }, { quoted: raw });
      }
    } catch (e: any) {
      console.error('[steal/toimg] failed', e);
      await sendText(chatJid, `❌ Failed: ${e?.message || e}`, raw);
    }
    return;
  }

  if (cmd === '.version') {
    await sendText(chatJid, formatVersion(), raw, { channelBrand: true });
    return;
  }
  if (cmd === '.botowner' || cmd === '.creator') {
    await sendText(chatJid, formatBotOwner(), raw, { channelBrand: true });
    return;
  }
  if (cmd === '.channel' || cmd === '.support') {
    await sendText(chatJid, `📢 *SYN Channel*\n${CHANNEL_URL}\n\n${SYN_TAGLINE}`, raw, { channelBrand: true });
    return;
  }
  if (cmd === '.configure' || cmd === '.config') {
    if (!playerId) {
      await sendText(chatJid, '❌ Identity error', raw);
      return;
    }
    // group admin check soft — bot isAdmin OR always allow if isAdmin(player)
    let allowed = isAdmin(playerId);
    if (!allowed && isGroup) {
      try {
        const meta = await sock.groupMetadata(chatJid);
        const me = meta.participants?.find((x: any) => String(x.id).includes(playerId) || String(x.id).startsWith(playerId));
        allowed = Boolean(me?.admin);
      } catch { /* */ }
    }
    if (!allowed) {
      await sendText(chatJid, '⛔ Group admin or bot owner only.\n.configure status', raw);
      return;
    }
    await sendText(chatJid, configureGroup(chatJid, playerId, args), raw, { channelBrand: true });
    return;
  }
  if (cmd === '.utility' || cmd === '.util') {
    if (isGroup && !hasModule(chatJid, 'utility') && !hasModule(chatJid, 'syndicates')) {
      // hasModule returns true if unlocked
    }
    if (isGroup) {
      const gate = commandAllowed(chatJid, 'utility');
      if (!gate.ok) {
        await sendText(chatJid, gate.msg || 'Locked', raw);
        return;
      }
    }
    await sendText(chatJid, formatUtilityMenu(), raw, { channelBrand: true });
    return;
  }


  // Game commands (passive SynAI listening removed — only .synai invokes SynAI)

  // Passive attention (@syn / replies / follow-ups) removed — only explicit .synai
  if (!text) return;
  if (!text.startsWith('.') && !/^\.synai\b/i.test(text)) return;

  // Spec S2/S3 handlers live BEFORE the platform gate (admin ops tools
  // must work even in locked groups). Plain .synai Q&A still flows below.
  if (/^\.synai\s+ops\b/i.test(text)) {
    if (!isBotOwner(canonicalId || senderId)) { await sendText(chatJid, '⛔ Bot owner only.', raw); return; }
    // .synai ops
    const q = text.replace(/^\.synai\s+ops\b/i, '').trim() || 'Give me a quick ops status.';
    let opsWorking = true;
    const animP2 = runLoadingAnimation(sock, chatJid, raw, { keepAlive: () => opsWorking });
    try {
      const { getAllPlayers } = await import('./game/player.js');
      const { calcEconomyHealth } = await import('./game/admin.js');
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
        const rows = ((_db.command_log || []) as any[]).slice(-15).map((r) => `${new Date(r.created_at).toLocaleTimeString()} ${String(r.player_id).slice(-6)} .${r.command}${r.args ? ' ' + r.args : ''}`).join('\n');
        slice = `RECENT COMMANDS:\n${rows || 'none'}`;
      } else if (/\b(digest|group|listen|gc)\b/.test(tl)) {
        const { getGroupSynAI: gg } = await import('./synai/listening.js');
        const gs = gg(chatJid);
        slice = `GROUP ${chatJid}: digest=${gs.listening.digest ? 'ON' : 'OFF'} (${gs.buffers.digest.length}) abuse=${gs.listening.abuse ? 'ON' : 'OFF'} (${gs.buffers.abuse.length})`;
      } else {
        const e = calcEconomyHealth();
        slice = `QUICK STATUS: players=${e.players} net=${e.totalNet} status=${e.status} cmds=${(_db.command_log || []).length}`;
      }
      const { callBoostAI } = await import('./synai/boost.js');
      const OPS_SYS = `You are SynAI, the internal ops assistant for SynBot — a WhatsApp economy/crime MMO game called "Syndicates." You are speaking privately and directly with the bot's owner/admin, not with a player. This is a trusted, one-on-one operational channel.\n\nYour job here is to help the owner understand and manage the live game: player database lookups, economy health, command logs, bug/error context, and group chat digest summaries — using only the data provided to you in this turn.\n\nBehave like a sharp, no-nonsense ops manager, not a customer-support bot. Give real numbers when asked, not vague summaries. If something looks off — a stat spike, a suspicious command pattern, a repeated error — say so plainly and proactively. Keep answers tight and conversational, this is WhatsApp, not a report; no headers or bullet dumps unless asked for a breakdown. Never use player-facing game flavor text or persona here — this is backstage. If you don't have data to answer something, say so directly instead of guessing.`;
      const ans = await callBoostAI(`DATA:\n${slice.slice(0, 3000)}\n\nOWNER QUESTION: ${q}`, { systemPrompt: OPS_SYS, timeoutMs: 15000 });
      opsWorking = false;
      const k2 = await animP2;
      await finalizeWithEdit(sock, chatJid, k2, ans || `⚠️ Ops brain unreachable. Raw slice:\n${slice.slice(0, 1500)}`, raw);
    } catch (e) { opsWorking = false; console.error('ops failed', e); await sendText(chatJid, '⚠️ Ops failed.', raw); }
    return;
  }

  // platform gate
  const bareCmd = cmd.replace(/^\./, '');
  const gate = commandAllowed(chatJid, bareCmd);
  if (!gate.ok) {
    await sendText(chatJid, gate.msg || '🔒 Locked for this group', raw);
    return;
  }

  // utility pack quick commands
  const utilOut = runUtility(bareCmd, args, { text, mentioned });
  if (utilOut) {
    await sendText(chatJid, utilOut, raw, { channelBrand: true });
    return;
  }

  // ── SynAI: one live brain. A gif (assets/aiasset) loops while it thinks; it is deleted
  //    when the answer is ready and the answer is sent as a fresh message. No limits. ──
  if (cmd === '.synai' && args.length) {
    const question = expandPercentFollowUp(chatJid, playerId, args.join(' ').trim());
    const useGif = hasAiGif();
    const gifP: Promise<any | null> = useGif ? startAiGif(sock, chatJid, raw) : Promise.resolve(null);
    let stillWorking = true;
    const animKeyPromise: Promise<any | null> = useGif
      ? Promise.resolve(null)
      : runLoadingAnimation(sock, chatJid, raw, { keepAlive: () => stillWorking });
    const clearLoading = async (): Promise<any | null> => {
      stillWorking = false;
      const animKey = await animKeyPromise;
      await stopAiGif(sock, chatJid, await gifP);
      return animKey;
    };

    // Image route (explicit image asks only)
    if (isImageRequest(question)) {
      const img = await generateImage(extractImagePrompt(question));
      const animKey = await clearLoading();
      if (!img.ok) {
        await finalizeWithEdit(sock, chatJid, animKey, `⚠️ ${(img as any).reason}`, raw);
        return;
      }
      if (animKey) { try { await sock.sendMessage(chatJid, { delete: animKey }); } catch { /* */ } }
      try {
        await sock.sendMessage(chatJid, { image: img.buffer, caption: `🎨 *SynAI*\n_${img.prompt.slice(0, 200)}_` }, { quoted: raw });
      } catch {
        await sendText(chatJid, '⚠️ Could not send the image.', raw);
      }
      return;
    }

    let aiReply: string | null = null;
    try {
      aiReply = await handleCommand(canonicalId || senderId, text, { isGroup, mentioned, chatJid });
    } finally {
      stillWorking = false;
    }
    const animKey = await clearLoading();
    if (!aiReply) return;

    // Send the answer (edit the text-animation bubble if that was used, else a new message)
    let sentId: string | undefined;
    if (animKey) {
      await finalizeWithEdit(sock, chatJid, animKey, aiReply, raw);
      sentId = (animKey as any)?.id || (animKey as any)?.key?.id;
    } else {
      try {
        const sent: any = await sock.sendMessage(chatJid, { text: aiReply }, { quoted: raw });
        sentId = sent?.key?.id;
      } catch { await sendText(chatJid, aiReply, raw); }
    }

    // Conversation memory (enables reply-to-answer + follow-ups) and follow-up buttons
    try {
      recordUserTurn(chatJid, playerId, question);
      recordAssistantTurn(chatJid, playerId, aiReply);
      if (sentId) markBotMessage(chatJid, playerId, String(sentId));
    } catch {}
    const followBtns = generateFollowUpButtons(playerId, question, aiReply);
    if (followBtns.length >= 2) {
      try { await sendButtonMessage(sock, chatJid, playerId, '▸ quick follow-ups', followBtns, raw); } catch { /* */ }
    }
    return;
  }

  const reply = await handleCommand(canonicalId || senderId, text, { isGroup, mentioned, chatJid });
  if (!reply) return;

  // .count ephemeral: delete bot message after 2s
  if (reply.startsWith('__COUNT_EPHEMERAL__')) {
    const body = reply.replace('__COUNT_EPHEMERAL__\n', '').replace('__COUNT_EPHEMERAL__', '');
    const sent = await sock.sendMessage(chatJid, { text: body }, { quoted: raw });
    setTimeout(async () => {
      try {
        if (sent?.key) await sock.sendMessage(chatJid, { delete: sent.key });
      } catch (e) {
        console.error('count delete failed', e);
      }
    }, 2000);
    return;
  }

  // Menu messages carry the assets image (falls back to plain text if missing).
  if (cmd === '.start' || cmd === '.menu' || cmd === '.games' || cmd === '.syn') {
    await sendWithMenu(chatJid, reply, raw);
    return;
  }
  if (cmd === '.help' || lower.startsWith('.guide') || lower.startsWith('.story')) {
    await sendText(chatJid, reply, raw, { channelBrand: true });
    return;
  }
  if (cmd === '.profile' || cmd === '.whoami') {
    await sendWithProfile(chatJid, reply, raw);
    return;
  }
  if (cmd === '.news' || cmd === '.city' || cmd === '.cityheat') {
    await sendWithCity(chatJid, reply, raw);
    return;
  }
  if (cmd === '.leaderboard' || cmd === '.lb' || cmd === '.rankings' || cmd === '.richlist') {
    if (lower.includes('achievement') || lower.includes('badge') || lower === '.lb al') {
      await sendWithAchievementsLb(chatJid, reply, raw);
      return;
    }
    await sendWithLeaderboard(chatJid, reply, sock, raw);
    return;
  }
  if (cmd === '.al' || cmd === '.alb') {
    await sendWithAchievementsLb(chatJid, reply, raw);
    return;
  }
  if (cmd === '.shop' || cmd === '.store' || cmd === '.inv' || cmd === '.inventory' || cmd === '.buy') {
    await sendWithStore(chatJid, reply, raw);
    return;
  }
  if (cmd === '.crypto') {
    await sendWithCrypto(chatJid, reply, raw);
    return;
  }

  // Attach interactive buttons when a session-opening reply is detected.
  // Text commands keep working; buttons are additive UI only.
  const pid = canonicalId || senderId;
  const base = cmd.replace(/^\./, '');
  try {
    // Cast → bite stage (⚡ REEL), optional bite GIF
    if ((base === 'fish' || base === 'fisch') && (reply.toLowerCase().includes('took the bait') || reply.toLowerCase().includes('something bit'))) {
      sendRandomGif(sock, chatJid, 'fisch', 'bite').catch(() => {});
      await sendButtonMessage(sock, chatJid, pid, reply, BITE_REEL_BUTTON(pid), raw);
      return;
    }
    // Struggle decision
    if (reply.toLowerCase().includes('fighting hard')) {
      sendRandomGif(sock, chatJid, 'fisch', 'struggle').catch(() => {});
      await sendButtonMessage(sock, chatJid, pid, reply, STRUGGLE_BUTTONS(pid), raw);
      return;
    }
    // Active reeling
    if (base === 'pull' && !reply.startsWith('❌') && !reply.includes('*CATCH*') && !reply.includes('line snaps') && !reply.includes('SOMETHING BIT')) {
      await sendButtonMessage(sock, chatJid, pid, reply, REEL_PULL_BUTTON(pid), raw);
      return;
    }
    if ((base === 'fish' || base === 'fisch') && reply.includes('*REELING*')) {
      await sendButtonMessage(sock, chatJid, pid, reply, REEL_PULL_BUTTON(pid), raw);
      return;
    }
    if (base === 'duel' && !reply.startsWith('⚠️') && !reply.startsWith('❌')) {
      await sendButtonMessage(sock, chatJid, pid, reply, DUEL_BUTTONS(pid), raw);
      return;
    }
    if (base === 'kraken' && !reply.startsWith('❌') && !reply.includes('snaps')) {
      await sendButtonMessage(sock, chatJid, pid, reply, KRAKEN_BUTTONS(pid), raw);
      return;
    }
    if ((base === 'attack' || base === 'boss') && !reply.startsWith('❌')) {
      await sendButtonMessage(sock, chatJid, 'boss', reply, BOSS_ATTACK_BUTTON, raw);
      return;
    }
    if ((base === 'bj' || base === 'blackjack') && reply.includes('BLACKJACK') && !reply.includes('BUST') && !reply.includes('WIN') && !reply.includes('Lost') && !reply.includes('PUSH')) {
      await sendButtonMessage(sock, chatJid, pid, reply, BJ_BUTTONS(pid), raw);
      return;
    }
    if (base === 'slots' && !reply.startsWith('❌') && !reply.startsWith('Usage')) {
      const bet = parseInt(text.trim().split(/\s+/)[1], 10);
      if (Number.isFinite(bet) && bet > 0) {
        await sendButtonMessage(sock, chatJid, pid, reply, SLOT_BUTTONS(pid, bet), raw);
        return;
      }
    }
    if (base === 'dice' && !reply.startsWith('Usage') && (!reply.startsWith('❌') || reply.includes('Lost'))) {
      const parts = text.trim().split(/\s+/);
      const bet = parseInt(parts[1], 10);
      const pick = (parts[2] || 'high').toLowerCase();
      if (Number.isFinite(bet) && bet > 0 && (pick === 'high' || pick === 'low')) {
        await sendButtonMessage(sock, chatJid, pid, reply, DICE_BUTTONS(pid, bet, pick), raw);
        return;
      }
    }
    if ((base === 'coinflip' || base === 'cf') && !reply.startsWith('❌') && !reply.startsWith('Usage')) {
      const parts = text.trim().split(/\s+/);
      const bet = parseInt(parts[1], 10);
      const side = (parts[2] || '').toLowerCase();
      if (Number.isFinite(bet) && bet > 0 && (side === 'heads' || side === 'tails')) {
        await sendButtonMessage(sock, chatJid, pid, reply, COIN_BUTTONS(pid, bet, side), raw);
        return;
      }
    }
    // Heist lobby just opened — offer a JOIN button (same reply .safe/.risky already send)
    if ((base === 'safe' || base === 'risky') && reply.includes('LOBBY OPEN')) {
      await sendButtonMessage(sock, chatJid, `heistlobby:${base}`, reply, HEIST_JOIN_BUTTON(base), raw);
      return;
    }
    if ((base === 'merchant') && reply.includes('FISCH MERCHANT')) {
      await sendButtonMessage(sock, chatJid, pid, reply, MERCHANT_EXCHANGE_BUTTON(pid), raw);
      return;
    }
  } catch (e) {
    console.warn('Button attach failed, falling back to text:', (e as any)?.message || e);
  }

  await sendText(chatJid, reply, raw);
});

startQrServer();

// Live-boost credential check — the host injects env vars before the process
// starts, so this line shows at boot whether the key actually reached the bot.
logLiveBoostEnvStatus();

// SynAI background learning (hourly auto-learn + gap fill, unref'd timers)

// Street drops — every 1 hour a random item drops to syndicates-enabled groups
startDrops();
(async () => {
  const { getSocket } = await import('./connection/whatsapp.js');
  const { getDb } = await import('./db/database.js');
  const sock = getSocket();
  if (sock) {
    startSeasonalEvents(sock, () => {
      const groups = (getDb() as any).platformGroups || {};
      return Object.keys(groups).filter((gid) => {
        const mods = Array.isArray(groups[gid]?.modules) ? groups[gid].modules : [];
        return mods.length === 0 || mods.includes('syndicates');
      });
    });
  }
})();


// Interactive button handlers (Fisch reel/duel/kraken/boss, blackjack)
registerAllButtonHandlers();

startWhatsApp().catch((err) => {
  console.error('Failed to start WhatsApp:', err);
  process.exit(1);
});
