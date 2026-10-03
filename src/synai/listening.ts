/**
 * Group listening buffers (digest / abuse) — lightweight store.
 * Used by .synai listen / ops; does not auto-reply.
 */
type GroupState = {
  listening: { digest: boolean; abuse: boolean };
  buffers: { digest: { sender: string; text: string; timestamp: number }[]; abuse: any[] };
};

const groups = new Map<string, GroupState>();

function ensure(chatJid: string): GroupState {
  let g = groups.get(chatJid);
  if (!g) {
    g = {
      listening: { digest: false, abuse: false },
      buffers: { digest: [], abuse: [] },
    };
    groups.set(chatJid, g);
  }
  return g;
}

export function getGroupSynAI(chatJid: string): GroupState {
  return ensure(chatJid);
}

export function ingestGroupMessage(
  chatJid: string,
  sender: string,
  text: string
): 'abuse' | null {
  const g = ensure(chatJid);
  if (g.listening.digest && text && !text.startsWith('.')) {
    g.buffers.digest.push({ sender, text: text.slice(0, 400), timestamp: Date.now() });
    if (g.buffers.digest.length > 200) g.buffers.digest.shift();
  }
  return null;
}

export function flushDigestBuffer(chatJid: string): string {
  const g = ensure(chatJid);
  const lines = g.buffers.digest.map(
    (e) => `…${e.sender.slice(-4)}: ${e.text}`
  );
  g.buffers.digest = [];
  return lines.join('\n');
}

export function lastAbuseEntry(_chatJid?: string): any | null {
  return null;
}

export function setListening(chatJid: string, mode: 'digest' | 'abuse', on: boolean): void {
  const g = ensure(chatJid);
  g.listening[mode] = on;
}

export function getLibrarySlots(_chatJid: string): { name: string; count: number }[] {
  return [{ name: 'gc-digest', count: 0 }, { name: 'abuse-log', count: 0 }];
}
export function dumpLibrarySlot(_chatJid: string, slot: string): string {
  return `(empty) ${slot}`;
}
export function clearAbuseBuffer(_chatJid: string): void {}
