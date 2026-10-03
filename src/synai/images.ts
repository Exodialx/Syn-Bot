/**
 * Image intent detection + generation.
 * Prefers OPENAI_API_KEY (DALL·E) when present.
 * Without it, returns a clear text fallback — does not fake images.
 */
export function isImageRequest(text: string): boolean {
  const t = (text || '').toLowerCase().trim();
  if (!t) return false;

  // Explicit image vocabulary
  if (
    /\b(generate|create|make|draw|paint|render)\b.{0,60}\b(image|picture|pic|logo|art|illustration|photo|wallpaper)\b/.test(
      t
    )
  ) {
    return true;
  }
  if (/\b(image|picture|pic|logo)\b.{0,30}\b(of|for)\b/.test(t)) return true;
  if (/^(draw|paint|imagine)\s+/i.test(t)) return true;

  // "generate a futuristic black hypercar" / "make me a cyberpunk city"
  // Visual object requests without the word "image"
  if (
    /\b(generate|create|draw|paint|render)\b\s+(me\s+)?(an?\s+)?/.test(t) &&
    /\b(car|hypercar|logo|city|skyline|portrait|character|gang|crew|robot|dragon|castle|scene|poster|banner|icon)\b/.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\bmake me\b/.test(t) &&
    /\b(car|hypercar|logo|city|picture|image|art)\b/.test(t)
  ) {
    return true;
  }

  return false;
}

export function extractImagePrompt(text: string): string {
  let t = text.trim();
  t = t.replace(
    /^(please\s+)?(can you\s+)?(generate|create|make|draw|paint|render)\s+(me\s+)?(an?\s+)?(image|picture|pic|logo|art|illustration)\s*(of|for)?\s*/i,
    ''
  );
  t = t.replace(/^(please\s+)?(can you\s+)?(generate|create|make|draw|paint|render|imagine)\s+(me\s+)?(an?\s+)?/i, '');
  return t.trim() || text.trim();
}

export type ImageGenResult =
  | { ok: true; buffer: Buffer; mime: string; prompt: string }
  | { ok: false; reason: string };


/** Free route: Cloudflare Workers AI (FLUX.1 schnell) using CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID. */
async function viaCloudflareImage(prompt: string): Promise<ImageGenResult | null> {
  const tok = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
  const acct = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (!tok || !acct) return null;
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.slice(0, 1000), steps: 6 }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      console.error('[image] cloudflare failed', res.status, (await res.text().catch(() => '')).slice(0, 200));
      return null;
    }
    const data = (await res.json()) as { result?: { image?: string } };
    const b64 = data?.result?.image;
    if (!b64) return null;
    return { ok: true, buffer: Buffer.from(b64, 'base64'), mime: 'image/jpeg', prompt };
  } catch (e) {
    console.error('[image] cloudflare error', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function generateImage(prompt: string): Promise<ImageGenResult> {
  const cfImg = await viaCloudflareImage(prompt);
  if (cfImg) return cfImg;
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (!key) {
    return {
      ok: false,
      reason:
        'Image generation failed (Cloudflare image model unavailable and no OPENAI_API_KEY set). Try again shortly.',
    };
  }
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt.slice(0, 1000),
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, reason: `Image API ${res.status}: ${body.slice(0, 120)}` };
    }
    const data = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) return { ok: false, reason: 'No image data returned.' };
    return {
      ok: true,
      buffer: Buffer.from(b64, 'base64'),
      mime: 'image/png',
      prompt,
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Image generation failed.' };
  }
}
