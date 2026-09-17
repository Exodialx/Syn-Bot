import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  WAMessage,
  Browsers,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import {
  styleOutbound,
  REPLY_DELAY_MS,
  reactionForCommand,
  sleep,
  CHANNEL_LINK,
} from './messageStyle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_DIR = path.join(process.cwd(), 'auth_info_baileys');
const QR_IMAGE_PATH = path.join(process.cwd(), 'qr.png');

const LOGO_PATH = path.join(process.cwd(), 'assets', 'logo.jpg');
const CITY_PATH = path.join(process.cwd(), 'assets', 'city-heat.jpg');
const PROFILE_PATH = path.join(process.cwd(), 'assets', 'profile.jpg');
const ACHIEVEMENTS_LB_PATH = path.join(process.cwd(), 'assets', 'achievements-lb.jpg');
const STORE_PATH = path.join(process.cwd(), 'assets', 'store.jpg');
const CRYPTO_PATH = path.join(process.cwd(), 'assets', 'crypto.jpg');

export type MessageHandler = (
  chatJid: string,
  senderId: string,
  text: string,
  raw: WAMessage,
  sock: WASocket
) => Promise<void>;

let sock: WASocket | null = null;
let messageHandler: MessageHandler | null = null;

const botStartedAt = Date.now();

let socketOnlineAt = 0;
const seenMsgKeys = new Set<string>();

let startingWhatsApp = false;
let whatsappAuthenticated = false;

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

let restartAttempts = 0;

export function setMessageHandler(handler: MessageHandler) {
  messageHandler = handler;
}

export function cleanId(jidOrParticipant: string | null | undefined): string {
  if (!jidOrParticipant) return '';
  return String(jidOrParticipant).replace(/@.*/, '').replace(/[^0-9]/g, '');
}

function isLikelyPhone(id: string): boolean {
  return /^[0-9]{10,15}$/.test(id);
}

export function resolveSenderId(msg: WAMessage): string {
  const key: any = msg.key || {};
  const candidates: string[] = [];

  const push = (raw: any) => {
    const id = cleanId(raw);
    if (id && id.length >= 8 && !candidates.includes(id)) {
      candidates.push(id);
    }
  };

  const isGroup = String(key.remoteJid || '').endsWith('@g.us');

  if (isGroup) {
    push(key.participant);
    push(key.participantAlt);
    push(key.participantPn);
    push((msg as any).participant);
  } else {
    push(key.remoteJid);
    push(key.remoteJidAlt);
    push(key.senderPn);
    push(key.participant);
  }

  push((msg as any).participant);
  push((msg as any).sender);
  push(key.senderLid);
  push(key.participantLid);

  if (!candidates.length) return '';

  const phone = candidates.find(isLikelyPhone);
  if (phone) return phone;

  return candidates.sort((a, b) => b.length - a.length)[0];
}

export function resolveSenderCandidates(msg: WAMessage): string[] {
  const key: any = msg.key || {};
  const out: string[] = [];

  const push = (raw: any) => {
    if (typeof raw === 'string' && raw.toLowerCase().endsWith('@g.us')) return;
    const id = cleanId(raw);
    if (id && id.length >= 8 && id.length <= 16 && !out.includes(id)) {
      out.push(id);
    }
  };

  push(key.participant);
  push(key.participantAlt);
  push(key.participantPn);
  push(key.senderPn);
  push((msg as any).participant);

  return out;
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function getDisconnectStatus(error: any): number | undefined {
  return error?.output?.statusCode;
}

function logDisconnect(lastDisconnect: any, state: any) {
  console.error('');
  console.error('========== FULL WHATSAPP DISCONNECT ==========');

  try {
    console.error(
      JSON.stringify(lastDisconnect?.error, Object.getOwnPropertyNames(lastDisconnect?.error || {}), 2)
    );
  } catch {
    console.error(lastDisconnect?.error);
  }

  const statusCode = getDisconnectStatus(lastDisconnect?.error);

  console.error('WhatsApp status code:', statusCode);
  console.error('WhatsApp authenticated:', whatsappAuthenticated);
  console.error('Credentials registered:', state?.creds?.registered);
  console.error('==============================================');
  console.error('');
}

function scheduleReconnect(delay = 1500) {
  if (reconnectTimer) return;

  startingWhatsApp = false;
  sock = null;

  console.log('');
  console.log(`WhatsApp restart scheduled in ${delay}ms...`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startWhatsApp().catch((error) => {
      console.error('WhatsApp restart failed:', error);
    });
  }, delay);
}

export async function startWhatsApp() {
  if (startingWhatsApp) {
    console.log('WhatsApp startup already in progress.');
    return sock;
  }

  if (sock) {
    console.log('WhatsApp socket already exists.');
    return sock;
  }

  if (reconnectTimer) {
    console.log('WhatsApp reconnect already scheduled.');
    return sock;
  }

  startingWhatsApp = true;

  try {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    whatsappAuthenticated = Boolean(state.creds.registered);

    let waWebVersion: [number, number, number] | undefined;

    try {
      const latest = await fetchLatestBaileysVersion();
      waWebVersion = latest.version as [number, number, number];

      console.log('');
      console.log('======================================');
      console.log('   WHATSAPP WEB VERSION');
      console.log('======================================');
      console.log(`   Version: ${waWebVersion.join('.')}`);
      console.log(`   Latest: ${latest.isLatest}`);
      console.log('======================================');
      console.log('');
    } catch (versionError) {
      console.error('');
      console.error('Could not fetch latest WhatsApp Web version.');
      console.error('Continuing with Baileys default version.');
      console.error(versionError);
      console.error('');
    }

    const socketConfig: any = {
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: Browsers.ubuntu('Chrome'),
      printQRInTerminal: false, // we handle QR rendering ourselves below
      syncFullHistory: false,
      markOnlineOnConnect: true,
      shouldSyncHistoryMessage: () => false,
      getMessage: async () => undefined,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
    };

    if (waWebVersion) {
      socketConfig.version = waWebVersion;
    }

    const newSocket = makeWASocket(socketConfig);
    sock = newSocket;

    sock.ev.on('creds.update', async () => {
      try {
        await saveCreds();
      } catch (error) {
        console.error('Failed to save WhatsApp credentials:', error);
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Primary: write a real PNG so it can be viewed over HTTP —
        // avoids the terminal log viewer mangling the ASCII grid.
        QRCode.toFile(QR_IMAGE_PATH, qr, { width: 400, margin: 2 }).catch((err) => {
          console.error('Failed to write qr.png:', err);
        });

        // Fallback: still print to terminal in case you're tailing logs
        // with a real terminal (Railway CLI, ssh, etc) rather than the
        // web dashboard.
        console.log('');
        console.log('======= SCAN THIS QR WITH WHATSAPP =======');
        console.log('(or open the /qr page served by this bot for a clean image)');
        qrcode.generate(qr, { small: true });
        console.log('===========================================');
        console.log('WhatsApp → Settings → Linked Devices → Link a Device');
        console.log('');
      }

      if (connection === 'open') {
        clearReconnectTimer();

        socketOnlineAt = Date.now();
        whatsappAuthenticated = true;
        startingWhatsApp = false;
        restartAttempts = 0;

        // No longer needed once logged in — remove so the /qr page
        // doesn't serve a stale, expired code.
        try {
          if (fs.existsSync(QR_IMAGE_PATH)) fs.unlinkSync(QR_IMAGE_PATH);
        } catch {}

        console.log('');
        console.log('======================================');
        console.log('   SYNDICATES WHATSAPP CONNECTED');
        console.log('======================================');
        console.log('   Authentication successful.');
        console.log('   Bot is ONLINE and ready.');
        console.log('======================================');
        console.log('');

        // Resolve the actual WhatsApp newsletter JID once the socket is online.
        // This enables the native channel attribution/follow presentation for
        // every outbound branded message without requiring a Railway env var.
        await resolveChannelMetadata();

        return;
      }

      if (connection === 'close') {
        logDisconnect(lastDisconnect, state);

        const statusCode = getDisconnectStatus(lastDisconnect?.error);
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        const restartRequired = statusCode === DisconnectReason.restartRequired;

        /*
         * 515 restart-required: WhatsApp asks for a fresh socket right
         * after a successful pairing. Credentials are fine — just
         * reconnect, don't touch auth_info_baileys.
         */
        if (restartRequired && state.creds.registered) {
          whatsappAuthenticated = false;
          startingWhatsApp = false;
          sock = null;
          restartAttempts++;

          console.log('');
          console.log('======================================');
          console.log('   WHATSAPP 515 RESTART REQUIRED');
          console.log('======================================');
          console.log('Credentials are registered. Reconnecting...');
          console.log(`Restart attempt: ${restartAttempts}`);
          console.log('======================================');
          console.log('');

          const delay = Math.min(1500 + restartAttempts * 1000, 5000);
          scheduleReconnect(delay);
          return;
        }

        /*
         * Was fully authenticated and connected before, dropped for
         * some other reason (network blip, server-side session hiccup,
         * etc). Reconnect using the saved session.
         */
        if (whatsappAuthenticated || state.creds.registered) {
          startingWhatsApp = false;
          sock = null;
          restartAttempts++;

          console.log('');
          console.log('Authenticated WhatsApp connection lost.');
          console.log('Reconnecting in 5 seconds...');
          console.log('');

          scheduleReconnect(5000);
          return;
        }

        /*
         * WhatsApp forced a logout — the session is dead server-side.
         * No amount of reconnecting fixes this. Auth folder must be
         * deleted and a fresh QR scanned.
         */
        if (loggedOut) {
          startingWhatsApp = false;
          sock = null;

          console.error('');
          console.error('======================================');
          console.error('   WHATSAPP LOGGED OUT');
          console.error('======================================');
          console.error('A fresh WhatsApp authentication is required.');
          console.error('Delete auth_info_baileys before restarting.');
          console.error('======================================');
          console.error('');

          return;
        }

        /*
         * Not yet authenticated, closed for some other reason (e.g. QR
         * expired before being scanned). This is normal — just retry
         * and a new QR will be generated.
         */
        startingWhatsApp = false;
        sock = null;
        restartAttempts++;

        console.log('');
        console.log('Not yet authenticated. Retrying to get a new QR...');
        console.log('');

        scheduleReconnect(2000);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (!messageHandler || !sock) return;
      if (type !== 'notify') return;
      if (!socketOnlineAt) return;

      for (const msg of messages) {
        if (msg.key?.fromMe) continue;

        const kid = `${msg.key?.remoteJid}|${msg.key?.id}|${msg.key?.participant || ''}`;
        if (seenMsgKeys.has(kid)) continue;
        seenMsgKeys.add(kid);

        if (seenMsgKeys.size > 5000) {
          const first = seenMsgKeys.values().next().value;
          if (first) seenMsgKeys.delete(first);
        }

        const ts = Number(msg.messageTimestamp || 0) * 1000;
        const gate = Math.max(botStartedAt, socketOnlineAt) - 5000;
        if (ts && ts < gate) continue;
        if (ts && Date.now() - ts > 120_000) continue;

        const chatJid = msg.key.remoteJid;
        if (!chatJid) continue;

        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption ||
          msg.message?.buttonsResponseMessage?.selectedDisplayText ||
          msg.message?.listResponseMessage?.title ||
          '';

        const trimmed = (text || '').trim();
        const isGroupMsg = chatJid.endsWith('@g.us');
        if (!trimmed) continue;
        if (!isGroupMsg && !trimmed.startsWith('.')) continue;

        const senderId = resolveSenderId(msg);
        if (!senderId || senderId.length < 8) continue;

        try {
          await messageHandler(chatJid, senderId, trimmed, msg, sock);
        } catch (err) {
          console.error('Handler error:', err);
          try {
            await sock.sendMessage(chatJid, { text: '⚠️ Something went wrong. Try again.' }, { quoted: msg });
          } catch {}
        }
      }
    });

    return sock;
  } catch (error) {
    startingWhatsApp = false;
    sock = null;
    console.error('WhatsApp startup failed:', error);
    throw error;
  } finally {
    startingWhatsApp = false;
  }
}

const CHANNEL_JID_ENV = process.env.CHANNEL_JID || '';
const CHANNEL_NAME = process.env.CHANNEL_NAME || 'SYN';
const CHANNEL_URL = process.env.CHANNEL_URL || CHANNEL_LINK;

let resolvedChannelJid = CHANNEL_JID_ENV;
let resolvedChannelName = CHANNEL_NAME;
let channelMetadataResolved = false;

export type SendTextOptions = {
  quoted?: WAMessage;
  channelBrand?: boolean;
  skipFooter?: boolean;
  skipChannel?: boolean;
  raw?: boolean;
};

export function buildChannelContextInfo(): Record<string, unknown> {
  const info: Record<string, unknown> = {
    forwardingScore: 999999,
    isForwarded: true,
  };

  if (resolvedChannelJid) {
    info.forwardedNewsletterMessageInfo = {
      newsletterJid: resolvedChannelJid,
      newsletterName: resolvedChannelName,
      contentType: 3,
      serverMessageId: -1,
      accessibilityText: `View ${resolvedChannelName} channel`,
    };
  }

  return info;
}

function extractChannelInviteCode(url: string): string | null {
  const match = String(url || '').match(/whatsapp\.com\/channel\/([^/?#\s]+)/i);
  return match?.[1] || null;
}

export async function resolveChannelMetadata(): Promise<string | null> {
  if (channelMetadataResolved) return resolvedChannelJid || null;

  if (resolvedChannelJid) {
    channelMetadataResolved = true;
    return resolvedChannelJid;
  }

  if (!sock || typeof (sock as any).newsletterMetadata !== 'function') return null;

  const invite = extractChannelInviteCode(CHANNEL_URL);
  if (!invite) return null;

  try {
    const metadata = await (sock as any).newsletterMetadata('invite', invite);
    const jid = String(metadata?.id || metadata?.jid || '');
    if (!jid.endsWith('@newsletter')) {
      throw new Error(`Invalid newsletter JID returned: ${jid || 'empty'}`);
    }

    resolvedChannelJid = jid;
    if (metadata?.name) resolvedChannelName = String(metadata.name);
    channelMetadataResolved = true;

    console.log('');
    console.log('======================================');
    console.log('   SYN CHANNEL METADATA RESOLVED');
    console.log('======================================');
    console.log(`   Name: ${resolvedChannelName}`);
    console.log(`   JID:  ${resolvedChannelJid}`);
    console.log('   Native channel card: ENABLED');
    console.log('======================================');
    console.log('');

    return resolvedChannelJid;
  } catch (error) {
    channelMetadataResolved = true;
    console.warn('Could not resolve SYN channel metadata:', (error as any)?.message || error);
    console.warn('Set CHANNEL_JID=<your @newsletter JID> in Railway Variables to skip invite resolution.');
    return null;
  }
}

function withForwardContext(content: any, extra?: Record<string, unknown>) {
  const ctx = {
    ...buildChannelContextInfo(),
    ...(content.contextInfo || {}),
    ...(extra || {}),
  };
  content.contextInfo = ctx;
  return content;
}

/**
 * Primary text sender — delay, style, forward badge, channel link preview
 */
export async function sendText(
  chatJid: string,
  text: string,
  quotedMsg?: WAMessage | SendTextOptions,
  maybeOpts?: SendTextOptions
) {
  if (!sock) return;

  let quoted: WAMessage | undefined;
  let opts: SendTextOptions = {};
  if (quotedMsg && typeof quotedMsg === 'object' && 'key' in (quotedMsg as any) && (quotedMsg as any).key) {
    quoted = quotedMsg as WAMessage;
    opts = maybeOpts || {};
  } else if (quotedMsg && typeof quotedMsg === 'object' && !('key' in (quotedMsg as any))) {
    opts = quotedMsg as SendTextOptions;
    quoted = opts.quoted;
  }

  await sleep(REPLY_DELAY_MS);

  let body = opts.raw ? String(text || '') : styleOutbound(String(text || ''), {
    skipFooter: opts.skipFooter,
    skipChannel: opts.skipChannel && !opts.channelBrand,
  });

  if (!opts.raw && !opts.skipChannel && !channelMetadataResolved) {
    await resolveChannelMetadata();
  }

  // styleOutbound historically appends the invite URL. Once the actual
  // newsletter JID is known, remove that text URL so the native WhatsApp
  // channel presentation is the visible branding surface instead.
  if (!opts.raw && !opts.skipChannel && resolvedChannelJid) {
    body = body.replace(/\n?https:\/\/whatsapp\.com\/channel\/[^\s]+/gi, '').trim();
  }

  // Metadata resolution can fail (for example during a temporary WhatsApp
  // newsletter lookup outage). In that case retain the plain invite URL as a
  // functional fallback.
  if (!opts.raw && !opts.skipChannel && !resolvedChannelJid && !body.includes('whatsapp.com/channel/')) {
    body = `${body.trim()}\n\n${CHANNEL_URL || CHANNEL_LINK}`;
  }

  const content: any = { text: body, detectLinks: false };
  withForwardContext(content);

  const sendOpts: any = {};
  if (quoted) sendOpts.quoted = quoted;
  await sock.sendMessage(chatJid, content, sendOpts);
}

/** React to a user message (command ack) */
export async function reactToMessage(chatJid: string, msg: WAMessage, emoji: string) {
  if (!sock || !msg?.key) return;
  try {
    await sock.sendMessage(chatJid, {
      react: {
        text: emoji,
        key: msg.key,
      },
    });
  } catch (e) {
    console.warn('react failed', (e as any)?.message || e);
  }
}

export async function reactForCommand(chatJid: string, msg: WAMessage, cmd: string) {
  const emoji = reactionForCommand(cmd);
  await reactToMessage(chatJid, msg, emoji);
}

export async function replyText(chatJid: string, text: string, quotedMsg?: WAMessage) {
  await sendText(chatJid, text, quotedMsg);
}

async function sendCaptionedImage(
  chatJid: string,
  filePath: string,
  caption: string,
  quotedMsg?: WAMessage
) {
  if (!sock) return;
  await sleep(REPLY_DELAY_MS);
  let body = styleOutbound(caption || '');
  if (!channelMetadataResolved) await resolveChannelMetadata();
  if (resolvedChannelJid) {
    body = body.replace(/\n?https:\/\/whatsapp\.com\/channel\/[^\s]+/gi, '').trim();
  }
  const content: any = fs.existsSync(filePath)
    ? { image: fs.readFileSync(filePath), caption: body, detectLinks: false }
    : { text: body, detectLinks: false };
  withForwardContext(content);
  const opts = quotedMsg ? { quoted: quotedMsg } : {};
  await sock.sendMessage(chatJid, content, opts);
}

export async function sendWithLogo(chatJid: string, caption: string, quotedMsg?: WAMessage) {
  await sendCaptionedImage(chatJid, LOGO_PATH, caption, quotedMsg);
}

export async function sendWithCity(chatJid: string, caption: string, quotedMsg?: WAMessage) {
  await sendCaptionedImage(chatJid, CITY_PATH, caption, quotedMsg);
}

export async function sendWithProfile(chatJid: string, caption: string, quotedMsg?: WAMessage) {
  await sendCaptionedImage(chatJid, PROFILE_PATH, caption, quotedMsg);
}

export async function sendWithAchievementsLb(chatJid: string, caption: string, quotedMsg?: WAMessage) {
  await sendCaptionedImage(chatJid, ACHIEVEMENTS_LB_PATH, caption, quotedMsg);
}

export async function sendWithStore(chatJid: string, caption: string, quotedMsg?: WAMessage) {
  await sendCaptionedImage(chatJid, STORE_PATH, caption, quotedMsg);
}

export async function sendWithCrypto(chatJid: string, caption: string, quotedMsg?: WAMessage) {
  await sendCaptionedImage(chatJid, CRYPTO_PATH, caption, quotedMsg);
}

export function getSocket() {
  return sock;
}

export async function deleteMessage(chatJid: string, msg: WAMessage) {
  if (!sock || !msg.key) return;
  try {
    await sock.sendMessage(chatJid, { delete: msg.key });
  } catch (e) {
    console.error('deleteMessage failed', e);
  }
}

export async function sendImageFile(chatJid: string, filePath: string, caption = '', quotedMsg?: WAMessage) {
  if (!sock) return;
  await sleep(REPLY_DELAY_MS);
  const body = styleOutbound(caption || '');
  const opts = quotedMsg ? { quoted: quotedMsg } : {};
  const buf = fs.readFileSync(filePath);
  const content: any = { image: buf, caption: body };
  withForwardContext(content);
  await sock.sendMessage(chatJid, content, opts);
}

export async function sendStickerBuffer(chatJid: string, buf: Buffer, quotedMsg?: WAMessage) {
  if (!sock) return;
  await sleep(REPLY_DELAY_MS);
  const opts = quotedMsg ? { quoted: quotedMsg } : {};

  // Sticker payloads MUST be webp. We were previously sending the raw
  // downloaded JPEG/PNG bytes straight through as `sticker`, which is why
  // stickers rendered blank — WhatsApp expects webp-encoded media here, not
  // whatever format the source photo happened to be in.
  let stickerBuf: Buffer;
  try {
    const sticker = new Sticker(buf, {
      pack: CHANNEL_NAME || 'SYN',
      author: 'SYN Bot',
      type: StickerTypes.FULL,
      quality: 70,
    });
    stickerBuf = await sticker.toBuffer();
  } catch (e) {
    console.error('[sticker] webp conversion failed, sending raw buffer as last resort', (e as any)?.message || e);
    stickerBuf = buf;
  }

  const content: any = { sticker: stickerBuf };
  withForwardContext(content);
  await sock.sendMessage(chatJid, content, opts);
}

export async function sendStickerFile(chatJid: string, filePath: string, quotedMsg?: WAMessage) {
  if (!sock) return;
  const buf = fs.readFileSync(filePath);
  await sendStickerBuffer(chatJid, buf, quotedMsg);
}

export async function groupParticipantAction(
  chatJid: string,
  action: 'promote' | 'demote' | 'remove',
  targetJids: string[]
) {
  if (!sock) throw new Error('Socket offline');
  await sock.groupParticipantsUpdate(chatJid, targetJids, action);
}

export function jidFromPhone(phone: string, chatJid: string): string {
  const num = String(phone).replace(/[^0-9]/g, '');
  return `${num}@s.whatsapp.net`;
}