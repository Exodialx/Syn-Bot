import {
  startWhatsApp,
  setMessageHandler,
  resolveSenderCandidates,
  sendWithLogo,
  sendWithCity,
  sendText,
  sendWithProfile,
  sendWithAchievementsLb,
  sendWithStore,
  sendWithCrypto,
  deleteMessage,
  sendImageFile,
  sendStickerBuffer,
  groupParticipantAction,
  getSocket,
  reactForCommand,
} from './connection/whatsapp.js';
import { startQrServer } from './connection/qrServer.js';
import { linkIdentities } from './game/player.js';
import { isAdmin } from './game/admin.js';
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

function mentionedPhones(raw: any): string[] {
  const mentioned: string[] = [];
  try {
    const ctx =
      raw.message?.extendedTextMessage?.contextInfo ||
      raw.message?.imageMessage?.contextInfo ||
      raw.message?.videoMessage?.contextInfo;
    const mj = ctx?.mentionedJid || [];
    for (const j of mj) {
      const num = String(j).replace(/@.*/, '').replace(/[^0-9]/g, '');
      if (num) mentioned.push(num);
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
        { reuploadRequest: getSocket()?.updateMediaMessage }
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

setMessageHandler(async (chatJid, senderId, text, raw, sock) => {
  const isGroup = chatJid.endsWith('@g.us');
  const lower = (text || '').toLowerCase().trim();
  const cmd = lower.split(/\s+/)[0] || '';
  const args = (text || '').trim().split(/\s+/).slice(1);

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
  if (cmd === '.mod' || cmd === '.tools' || cmd === '.utility' || cmd === '.tool') {
    await sendText(chatJid, formatModMenu(), raw);
    return;
  }

  if (cmd === '.ping') {
    await sendText(chatJid, `🏓 Pong · ${Date.now() % 1000}ms vibe`, raw);
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
    const targets = mentioned.length ? mentioned.map(n => `${n}@s.whatsapp.net`) : [];
    if (!targets.length) {
      await sendText(chatJid, `Usage: ${cmd} @user`, raw);
      return;
    }
    try {
      await groupParticipantAction(chatJid, action as any, targets);
      await sendText(chatJid, `✅ ${cmd.slice(1)} OK`, raw);
    } catch (e: any) {
      await sendText(chatJid, `❌ Failed. Bot must be *group admin*.\n${e?.message || ''}`, raw);
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
      const botNum = String(botId).split(':')[0].replace(/[^0-9]/g);
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


  // Game commands
  if (!text || !text.startsWith('.')) return;

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

  if (cmd === '.start' || cmd === '.menu' || cmd === '.help' || lower.startsWith('.guide') || lower.startsWith('.story')) {
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
  await sendText(chatJid, reply, raw);
});

startQrServer();

startWhatsApp().catch((err) => {
  console.error('Failed to start WhatsApp:', err);
  process.exit(1);
});
