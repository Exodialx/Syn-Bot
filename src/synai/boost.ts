/**
 * SynAI provider fallback chain - section 1 of spec.
 * Entry: callBoostAI(prompt, opts). Tries providers in order,
 * next on ANY failure. Keys from env at CALL time, never hardcoded.
 */
export type BoostOpts = {
  systemPrompt?: string;
  timeoutMs?: number;
  ctx?: { name?: string; role?: string };
};
const DEFAULT_TIMEOUT_MS = 10_000;
const UNUSABLE_RE =
  /user safety|safety categor|content polic|community guidelines|i (?:can(?:'|no)?t|cannot|won'?t|will not) (?:help|assist|provide|engage)|i must decline|as an ai (?:language )?model/i;
function env(name: string): string {
  return (process.env[name] || '').trim();
}
function usable(t: string | null | undefined): string | null {
  const s = (t || '').trim();
  if (!s) return null;
  if (UNUSABLE_RE.test(s)) return null;
  return s;
}
type ChatMsg = { role: 'system' | 'user'; content: string };
async function postChat(url: string, headers: Record<string, string>, body: unknown, tMs: number) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), tMs);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: c.signal });
    const text = await res.text().catch(() => '');
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { ok: res.ok, status: res.status, json, text };
  } finally { clearTimeout(timer); }
}
function openAIContent(d: any): string | null {
  return usable(d?.choices?.[0]?.message?.content);
}
function baseSystem(ctx?: { name?: string; role?: string }): string {
  const who = ctx?.name ? `The player's name is ${ctx.name}.` : '';
  const role = ctx?.role ? `Their role is ${ctx.role}.` : '';
  return ['You are SynAI, the in-game assistant for Syndicates - a WhatsApp economy/crime MMO.', 'Answer briefly for WhatsApp (no headers, no markdown tables). Never claim to be another model.', who, role].filter(Boolean).join('\n');
}
function messagesFor(opts: BoostOpts, prompt: string): ChatMsg[] {
  const sys = opts.systemPrompt ? `${opts.systemPrompt}\n\n${baseSystem(opts.ctx)}` : baseSystem(opts.ctx);
  return [{ role: 'system', content: sys }, { role: 'user', content: prompt.slice(0, 2000) }];
}
async function viaGroq(p: string, o: BoostOpts, t: number): Promise<string | null> {
  const k = env('GROQ_API_KEY');
  if (!k) return null;
  try {
    const r = await postChat('https://api.groq.com/openai/v1/chat/completions', { Authorization: `Bearer ${k}` }, { model: 'openai/gpt-oss-20b', messages: messagesFor(o, p), max_tokens: 500, temperature: 0.7 }, t);
    if (!r.ok) { console.error(`[boost] groq failed: ${r.status} ${r.text.slice(0, 200)}`); return null; }
    return openAIContent(r.json);
  } catch (e) { console.error('[boost] groq error', (e as any)?.message || e); return null; }
}
async function viaOpenRouter(p: string, o: BoostOpts, t: number): Promise<string | null> {
  const k = env('OPENROUTER_API_KEY');
  if (!k) return null;
  const model = env('OPENROUTER_MODEL') || 'openrouter/free';
  try {
    const r = await postChat('https://openrouter.ai/api/v1/chat/completions', { Authorization: `Bearer ${k}`, 'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://github.com/Exodialx/Syn-Bot', 'X-Title': process.env.OPENROUTER_TITLE || 'Syn Bot' }, { model, messages: messagesFor(o, p), max_tokens: 500, temperature: 0.7, reasoning: { exclude: true } }, t);
    if (!r.ok) { console.error(`[boost] openrouter failed: ${r.status} ${r.text.slice(0, 200)}`); return null; }
    return openAIContent(r.json);
  } catch (e) { console.error('[boost] openrouter error', (e as any)?.message || e); return null; }
}
async function viaCloudflare(p: string, o: BoostOpts, t: number): Promise<string | null> {
  const tok = env('CLOUDFLARE_API_TOKEN');
  const acct = env('CLOUDFLARE_ACCOUNT_ID');
  if (!tok || !acct) return null;
  try {
    const r = await postChat(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/meta/llama-3.1-8b-instruct`, { Authorization: `Bearer ${tok}` }, { messages: messagesFor(o, p), max_tokens: 500 }, t);
    if (!r.ok) { console.error(`[boost] cloudflare failed: ${r.status} ${r.text.slice(0, 200)}`); return null; }
    const direct = usable(r.json?.result?.response);
    if (direct) return direct;
    if (typeof r.json?.result === 'string') return usable(r.json.result);
    return openAIContent(r.json);
  } catch (e) { console.error('[boost] cloudflare error', (e as any)?.message || e); return null; }
}
async function viaNvidia(p: string, o: BoostOpts, t: number): Promise<string | null> {
  const k = env('NVIDIA_API_KEY');
  if (!k) return null;
  try {
    const r = await postChat('https://integrate.api.nvidia.com/v1/chat/completions', { Authorization: `Bearer ${k}` }, { model: 'nvidia/nemotron-3-super-120b-a12b', messages: messagesFor(o, p), max_tokens: 500, temperature: 0.7 }, t);
    if (!r.ok) { console.error(`[boost] nvidia failed: ${r.status} ${r.text.slice(0, 200)} (if 404 persists the model ID was retired - health-check NIM catalog)`); return null; }
    return openAIContent(r.json);
  } catch (e) { console.error('[boost] nvidia error', (e as any)?.message || e); return null; }
}
async function viaCerebras(p: string, o: BoostOpts, t: number): Promise<string | null> {
  const k = env('CEREBRAS_API_KEY');
  if (!k) return null;
  try {
    const r = await postChat('https://api.cerebras.ai/v1/chat/completions', { Authorization: `Bearer ${k}` }, { model: 'qwen-3.8-27b', messages: messagesFor(o, p), max_tokens: 500, temperature: 0.7 }, t);
    if (!r.ok) { console.error(`[boost] cerebras failed: ${r.status} ${r.text.slice(0, 200)}`); return null; }
    return openAIContent(r.json);
  } catch (e) { console.error('[boost] cerebras error', (e as any)?.message || e); return null; }
}
async function viaHF(p: string, o: BoostOpts, t: number): Promise<string | null> {
  const k = env('HUGGINGFACE_API_KEY');
  if (!k) return null;
  try {
    const r = await postChat('https://router.huggingface.co/v1/chat/completions', { Authorization: `Bearer ${k}` }, { model: 'meta-llama/Llama-3.3-70B-Instruct', messages: messagesFor(o, p), max_tokens: 500, temperature: 0.7 }, t);
    if (!r.ok) { console.error(`[boost] huggingface failed: ${r.status} ${r.text.slice(0, 200)}`); return null; }
    return openAIContent(r.json);
  } catch (e) { console.error('[boost] hf error', (e as any)?.message || e); return null; }
}
export async function callBoostAI(prompt: string, opts: BoostOpts = {}): Promise<string | null> {
  const q = (prompt || '').trim();
  if (!q) return null;
  const t = Math.max(2000, Math.min(30000, opts.timeoutMs || DEFAULT_TIMEOUT_MS));
  const chain: Array<[string, (p: string, o: BoostOpts, x: number) => Promise<string | null>]> = [['groq', viaGroq], ['openrouter', viaOpenRouter], ['cloudflare', viaCloudflare], ['nvidia', viaNvidia], ['cerebras', viaCerebras], ['huggingface', viaHF]];
  for (const [name, fn] of chain) {
    const a = await fn(q, opts, t);
    if (a) { console.log(`[boost] answered via ${name}`); return a; }
  }
  console.error('[boost] all providers failed');
  return null;
}
export function logBoostEnvStatus(): void {
  const names = ['GROQ_API_KEY', 'OPENROUTER_API_KEY', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'NVIDIA_API_KEY', 'CEREBRAS_API_KEY', 'HUGGINGFACE_API_KEY'];
  const seen = names.filter((n) => !!env(n));
  console.log(seen.length ? `Boost chain keys present: ${seen.join(', ')}` : 'Boost chain: NO provider keys set - offline brain only.');
}

