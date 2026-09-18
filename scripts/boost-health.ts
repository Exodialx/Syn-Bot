/**
 * Per-provider health check for the SynAI boost chain.
 * Usage: npx tsx scripts/boost-health.ts
 * callBoostAI() stops at the first success, so this hits each provider
 * individually to confirm every key is present AND valid.
 */
import '../src/config/env.ts';

const TIMEOUT = 15_000;

async function check(name: string, url: string, headers: Record<string, string>, body: unknown, parse: (j: any) => string | undefined) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: c.signal });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
    if (!res.ok) {
      console.log(`✗ ${name}: HTTP ${res.status} — ${text.slice(0, 160).replace(/\s+/g, ' ')}`);
      return;
    }
    const out = parse(json);
    if (out) {
      console.log(`✓ ${name}: OK — "${out.slice(0, 90).replace(/\s+/g, ' ')}"`);
      return;
    }
    // Diagnose: where did the text actually go?
    const msg = json?.choices?.[0]?.message;
    const alt = msg?.reasoning || msg?.reasoning_content || json?.choices?.[0]?.text || (typeof json?.result === 'string' ? json.result : json?.result?.response);
    console.log(`✓ ${name}: HTTP 200 — content empty${alt ? `, text in alt field: "${String(alt).slice(0, 80).replace(/\s+/g, ' ')}"` : `; raw: ${text.slice(0, 220).replace(/\s+/g, ' ')}`}`);
  } catch (e: any) {
    console.log(`✗ ${name}: ${e?.name === 'AbortError' ? `timeout after ${TIMEOUT}ms` : e?.message || e}`);
  } finally {
    clearTimeout(timer);
  }
}

const msgs = [{ role: 'user', content: 'Reply with exactly: pong' }];

async function main() {
  const g = (n: string) => (process.env[n] || '').trim();
  const oaiBody = { messages: msgs, max_tokens: 300, temperature: 0 };
  const oaiParse = (j: any) => j?.choices?.[0]?.message?.content;

  // Cloudflare: verify the token itself first (independent of account/permissions)
  if (g('CLOUDFLARE_API_TOKEN')) {
    try {
      const v = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', { headers: { Authorization: `Bearer ${g('CLOUDFLARE_API_TOKEN')}` } });
      const vj: any = await v.json().catch(() => null);
      console.log(`— cloudflare token verify: HTTP ${v.status} success=${vj?.success} status=${vj?.result?.status || '-'} errors=${JSON.stringify(vj?.errors || []).slice(0, 120)}`);
    } catch (e: any) { console.log(`— cloudflare token verify failed: ${e?.message || e}`); }
  }

  if (!g('GROQ_API_KEY')) console.log('✗ groq: GROQ_API_KEY not set');
  else await check('groq', 'https://api.groq.com/openai/v1/chat/completions', { Authorization: `Bearer ${g('GROQ_API_KEY')}` }, { ...oaiBody, model: 'openai/gpt-oss-20b' }, oaiParse);

  if (!g('OPENROUTER_API_KEY')) console.log('✗ openrouter: OPENROUTER_API_KEY not set');
  else await check('openrouter', 'https://openrouter.ai/api/v1/chat/completions', { Authorization: `Bearer ${g('OPENROUTER_API_KEY')}` }, { ...oaiBody, model: 'openrouter/free', reasoning: { exclude: true } }, oaiParse);

  if (!g('CLOUDFLARE_API_TOKEN') || !g('CLOUDFLARE_ACCOUNT_ID')) console.log('✗ cloudflare: CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not set');
  else await check('cloudflare', `https://api.cloudflare.com/client/v4/accounts/${g('CLOUDFLARE_ACCOUNT_ID')}/ai/run/@cf/meta/llama-3.1-8b-instruct`, { Authorization: `Bearer ${g('CLOUDFLARE_API_TOKEN')}` }, { messages: msgs, max_tokens: 20 }, (j) => (typeof j?.result === 'string' ? j.result : j?.result?.response));

  if (!g('NVIDIA_API_KEY')) console.log('✗ nvidia: NVIDIA_API_KEY not set');
  else await check('nvidia', 'https://integrate.api.nvidia.com/v1/chat/completions', { Authorization: `Bearer ${g('NVIDIA_API_KEY')}` }, { ...oaiBody, model: 'nvidia/nemotron-3-super-120b-a12b' }, oaiParse);

  if (!g('CEREBRAS_API_KEY')) console.log('✗ cerebras: CEREBRAS_API_KEY not set');
  else await check('cerebras', 'https://api.cerebras.ai/v1/chat/completions', { Authorization: `Bearer ${g('CEREBRAS_API_KEY')}` }, { ...oaiBody, model: 'qwen-3.8-27b' }, oaiParse);

  if (!g('HUGGINGFACE_API_KEY')) console.log('✗ huggingface: HUGGINGFACE_API_KEY not set');
  else await check('huggingface', 'https://router.huggingface.co/v1/chat/completions', { Authorization: `Bearer ${g('HUGGINGFACE_API_KEY')}` }, { ...oaiBody, model: 'meta-llama/Llama-3.3-70B-Instruct' }, oaiParse);
}

main();
