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

    sock.ev.on('connection.update', (update) => {
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

export async function replyText(chatJid: string, text: string, quotedMsg?: WAMessage) {
  if (!sock) return;
  if (quotedMsg) {
    await sock.sendMessage(chatJid, { text }, { quoted: quotedMsg });
  } else {
    await sock.sendMessage(chatJid, { text });
  }
}

export async function sendWithLogo(chatJid: string, caption: string, quotedMsg?: WAMessage) {
  if (!sock) return;
  const opts = quotedMsg ? { quoted: quotedMsg } : {};
  if (fs.existsSync(LOGO_PATH)) {
    await sock.sendMessage(chatJid, { image: fs.readFileSync(LOGO_PATH), caption }, opts);
  } else {
    await sock.sendMessage(chatJid, { text: `⚜️ *SYNDICATE*\n\n${caption}` }, opts);
  }
}

export async function sendWithCity(chatJid: string, caption: string, quotedMsg?: WAMessage) {
  if (!sock) return;
  const opts = quotedMsg ? { quoted: quotedMsg } : {};
  if (fs.existsSync(CITY_PATH)) {
    await sock.sendMessage(chatJid, { image: fs.readFileSync(CITY_PATH), caption }, opts);
  } else {
    await sock.sendMessage(chatJid, { text: caption }, opts);
  }
}

export type SendTextOptions = {
  quoted?: WAMessage;
  /** channel-forward style branding */
  channelBrand?: boolean;
};

const CHANNEL_JID_ENV = process.env.CHANNEL_JID || '';
const CHANNEL_NAME = process.env.CHANNEL_NAME || 'SYN';
const CHANNEL_URL = process.env.CHANNEL_URL || 'https://whatsapp.com/channel/0029VbDMtb5545v3ntesmm40';

export function buildChannelContextInfo(): Record<string, unknown> {
  const info: Record<string, unknown> = {
    forwardingScore: 999999,
    isForwarded: true,
  };
  if (CHANNEL_JID_ENV) {
    info.forwardedNewsletterMessageInfo = {
      newsletterJid: CHANNEL_JID_ENV,
      newsletterName: CHANNEL_NAME,
      serverMessageId: 1,
    };
  }
  return info;
}

export async function sendText(
  chatJid: string,
  text: string,
  quotedMsg?: WAMessage | SendTextOptions,
  maybeOpts?: SendTextOptions
) {
  if (!sock) return;
  // support old signature (quotedMsg) and new opts
  let quoted: WAMessage | undefined;
  let channelBrand = false;
  if (quotedMsg && typeof quotedMsg === 'object' && 'key' in (quotedMsg as any) && (quotedMsg as any).key) {
    quoted = quotedMsg as WAMessage;
    channelBrand = maybeOpts?.channelBrand === true;
  } else if (quotedMsg && typeof quotedMsg === 'object' && !('key' in (quotedMsg as any))) {
    const o = quotedMsg as SendTextOptions;
    quoted = o.quoted;
    channelBrand = o.channelBrand === true;
  }

  let body = text;
  // append channel link on branded messages if not already present
  if (channelBrand && !body.includes('whatsapp.com/channel/')) {
    body = `${body}

—
SYN v2.1.0 • Next Generation of Text Based Games
${CHANNEL_URL}`;
  }

  const content: any = { text: body };
  if (channelBrand) {
    content.contextInfo = buildChannelContextInfo();
  }
  const opts = quoted ? { quoted } : {};
  await sock.sendMessage(chatJid, content, opts);
}

export async function sendWithProfile(chatJid: string, caption: string, quotedMsg?: WAMessage) {
  if (!sock) return;
  const opts = quotedMsg ? { quoted: quotedMsg } : {};
  if (fs.existsSync(PROFILE_PATH)) {
    await sock.sendMessage(chatJid, { image: fs.readFileSync(PROFILE_PATH), caption }, opts);
  } else {
    await sock.sendMessage(chatJid, { text: caption }, opts);
  }
}

export async function sendWithAchievementsLb(chatJid: string, caption: string, quotedMsg?: WAMessage) {
  if (!sock) return;
  const opts = quotedMsg ? { quoted: quotedMsg } : {};
  if (fs.existsSync(ACHIEVEMENTS_LB_PATH)) {
    await sock.sendMessage(chatJid, { image: fs.readFileSync(ACHIEVEMENTS_LB_PATH), caption }, opts);
  } else {
    await sock.sendMessage(chatJid, { text: caption }, opts);
  }
}

export async function sendWithStore(chatJid: string, caption: string, quotedMsg?: WAMessage) {
  if (!sock) return;
  const opts = quotedMsg ? { quoted: quotedMsg } : {};
  if (fs.existsSync(STORE_PATH)) {
    await sock.sendMessage(chatJid, { image: fs.readFileSync(STORE_PATH), caption }, opts);
  } else {
    await sock.sendMessage(chatJid, { text: caption }, opts);
  }
}

export async function sendWithCrypto(chatJid: string, caption: string, quotedMsg?: WAMessage) {
  if (!sock) return;
  const opts = quotedMsg ? { quoted: quotedMsg } : {};
  if (fs.existsSync(CRYPTO_PATH)) {
    await sock.sendMessage(chatJid, { image: fs.readFileSync(CRYPTO_PATH), caption }, opts);
  } else {
    await sock.sendMessage(chatJid, { text: caption }, opts);
  }
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
  const opts = quotedMsg ? { quoted: quotedMsg } : {};
  const buf = fs.readFileSync(filePath);
  await sock.sendMessage(chatJid, { image: buf, caption }, opts);
}

export async function sendStickerFile(chatJid: string, filePath: string, quotedMsg?: WAMessage) {
  if (!sock) return;
  const opts = quotedMsg ? { quoted: quotedMsg } : {};
  const buf = fs.readFileSync(filePath);
  await sock.sendMessage(chatJid, { sticker: buf }, opts);
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
