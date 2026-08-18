// ─────────────────────────────────────────────────────────────────────────
// Brainbox Gig AI — background service worker
//
// Owner: Brainbox Ecom Lab
//
// Security notes ("no API leaks"):
//   - Keys live ONLY in chrome.storage.sync / chrome.storage.local, which
//     Chrome encrypts at rest and syncs only to the user's own signed-in
//     Chrome profile. They are never written to any Brainbox server,
//     analytics endpoint, or third-party domain.
//   - This file is the ONLY place network requests are made. It only ever
//     talks to api.anthropic.com and api.groq.com — the two hosts declared
//     in manifest.json. There is no telemetry, no logging service, and no
//     "phone home" call anywhere in this codebase. Market research reuses
//     Claude's own web_search tool (still just api.anthropic.com) plus a
//     same-origin fetch to fiverr.com made from content.js — never a new
//     third-party host.
//   - Keys are never included in console.log output. If you need to debug,
//     log response status codes, not headers or payloads.
//
// Claude sampling-parameter note (read before touching callClaudeWithKey):
//   As of Claude Opus 4.7+ and Claude Sonnet 5, the Messages API returns a
//   hard 400 invalid_request_error ("`temperature` is deprecated for this
//   model") for ANY non-default temperature/top_p/top_k — not just extreme
//   values. That's the "X `temperature` is deprecated for this" pill you
//   see on the gig-editor buttons if this file sends the field at all.
//   Anthropic's own guidance is to omit the parameter entirely and steer
//   variety through prompting instead — so Claude requests below never
//   include temperature/top_p/top_k, period. Where the caller asked for a
//   creative vs. precise pass (the old `temperature` argument), we fold
//   that intent into a one-line instruction appended to the system prompt.
//   Groq is unaffected and keeps using temperature normally.
// ─────────────────────────────────────────────────────────────────────────

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5';
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'AI_REQUEST':
      handleAIRequest(msg.payload).then(sendResponse).catch(err => sendResponse({ error: err.message }));
      return true;

    case 'MARKET_RESEARCH':
      handleMarketResearch(msg.payload).then(sendResponse).catch(() => sendResponse({ result: '' }));
      return true;

    // Legacy message type kept so nothing silently breaks if an older
    // popup/content script instance is still cached by Chrome.
    case 'GROQ_REQUEST':
      handleAIRequest(msg.payload).then(sendResponse).catch(err => sendResponse({ error: err.message }));
      return true;
  }
});

// Groq deprecated llama-3.3-70b-versatile (announced June 17, 2026, shut off
// mid-August 2026). Anyone who saved it before the deprecation would silently
// keep hitting a dead model forever without this — migrate it once, in place.
const DEPRECATED_GROQ_MODELS = {
  'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
  'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
  'qwen/qwen3-32b': 'openai/gpt-oss-120b',
  'meta-llama/llama-4-scout-17b-16e-instruct': 'openai/gpt-oss-120b',
};

function getSettings() {
  return new Promise(r => chrome.storage.sync.get(
    ['anthropicKeys', 'anthropicApiKey', 'groqKeys', 'groqApiKey',
     'provider', 'model', 'groqModel', 'temperature'],
    async (stored) => {
      const replacement = DEPRECATED_GROQ_MODELS[stored.groqModel];
      if (replacement) {
        stored.groqModel = replacement;
        chrome.storage.sync.set({ groqModel: replacement }); // persist the fix, not just this call
      }
      r(stored);
    }
  ));
}

function keyList(arrKey, singleKey, stored) {
  const arr = stored[arrKey] || (stored[singleKey] ? [stored[singleKey]] : []);
  return arr.filter(Boolean);
}

// Turns a 0.0–1.0 "temperature" intent into a plain-English instruction,
// since Claude no longer accepts the numeric sampling parameter directly.
function creativityHint(temperature) {
  if (temperature === undefined || temperature === null) return '';
  if (temperature >= 0.75) return '\n\nVary your wording, structure, and specific phrasing from anything you may have generated before for this niche — favor a fresh, creative angle over a safe/generic one.';
  if (temperature <= 0.35) return '\n\nBe precise, literal, and consistent. Prefer the most direct, unambiguous phrasing over creative variation.';
  return '';
}

// ── Claude (Anthropic) ──────────────────────────────────────────────────

async function callClaudeWithKey(apiKey, { prompt, systemPrompt, model, temperature, tools, maxTokens }) {
  const finalSystem = (systemPrompt || '') + creativityHint(temperature);

  // Deliberately no temperature/top_p/top_k here — see the note at the top
  // of this file. Sending any of them 400s on Sonnet 5 / Opus 4.7+.
  const body = {
    model: model || DEFAULT_CLAUDE_MODEL,
    max_tokens: maxTokens || 4096,
    system: finalSystem || undefined,
    messages: [{ role: 'user', content: prompt }],
  };
  if (tools && tools.length) body.tools = tools;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429 || res.status === 401 || res.status === 403) return null; // let caller rotate/fallback
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Claude API error ${res.status}`);
  }

  const data = await res.json();
  // Concatenate every text block (Sonnet 5 runs adaptive thinking by
  // default, and web_search can add extra turns, so there can be several
  // content blocks). Only "text" blocks are kept — "thinking" and
  // "server_tool_use"/"web_search_tool_result" blocks are intentionally
  // skipped since they're not meant to be shown to the user.
  const text = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
  return { text, raw: data };
}

async function callClaude(opts, keys) {
  for (const key of keys) {
    const result = await callClaudeWithKey(key, opts);
    if (result !== null) return result;
  }
  return null; // all Claude keys exhausted/invalid
}

// ── Groq (free fallback) ────────────────────────────────────────────────
// Groq's OpenAI-compatible endpoint still accepts temperature normally —
// no equivalent deprecation there, so this path is untouched.

async function callGroqWithKey(apiKey, { prompt, systemPrompt, model, temperature, maxTokens }) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_GROQ_MODEL,
      temperature: temperature ?? 0.7,
      // Groq's free-tier rate limiter counts prompt_tokens + max_tokens (the
      // requested CEILING, not actual usage) against the TPM budget before
      // the call even runs. The old hardcoded 8000 here was already at (or
      // over, once any prompt was added) the entire 8000 TPM cap for
      // openai/gpt-oss-120b on the free tier -- every single call was
      // guaranteed to fail with a "Requested X > Limit 8000" error,
      // regardless of prompt size. None of this extension's completions
      // (the longest is the full JSON gig description, generously under
      // 1000 tokens) need anywhere near that -- 2048 leaves comfortable
      // headroom under 8000 for the prompt itself.
      max_tokens: maxTokens || 2048,
      messages: [
        { role: 'system', content: systemPrompt || '' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (res.status === 429 || res.status === 401) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq API error ${res.status}`);
  }

  const data = await res.json();
  return { text: data.choices[0].message.content.trim() };
}

async function callGroq(opts, keys) {
  for (const key of keys) {
    const result = await callGroqWithKey(key, opts);
    if (result !== null) return result;
  }
  return null;
}

// ── Text generation entry point (gig fields, bio, FAQs, etc.) ──────────

async function handleAIRequest(payload) {
  const stored = await getSettings();
  const provider = stored.provider || 'claude'; // 'claude' | 'groq'
  const temperature = payload.temperature ?? stored.temperature;

  const claudeKeys = keyList('anthropicKeys', 'anthropicApiKey', stored);
  const groqKeys = keyList('groqKeys', 'groqApiKey', stored);
  if (payload.apiKey && !groqKeys.includes(payload.apiKey)) groqKeys.push(payload.apiKey); // back-compat

  const opts = {
    prompt: payload.prompt,
    systemPrompt: payload.systemPrompt,
    temperature, // used verbatim for Groq; converted to a text hint for Claude
    model: stored.model,
    maxTokens: payload.maxTokens, // undefined falls through to each provider's own safe default
  };

  const order = provider === 'groq' ? ['groq', 'claude'] : ['claude', 'groq'];

  for (const p of order) {
    if (p === 'claude' && claudeKeys.length) {
      const r = await callClaude(opts, claudeKeys);
      if (r) return { result: r.text };
    }
    if (p === 'groq' && groqKeys.length) {
      const r = await callGroq({ ...opts, model: stored.groqModel || DEFAULT_GROQ_MODEL }, groqKeys);
      if (r) return { result: r.text };
    }
  }

  if (!claudeKeys.length && !groqKeys.length) {
    throw new Error('No API key set. Open the extension popup → AI Provider tab and add a Claude and/or Groq key.');
  }
  throw new Error('All configured API keys were rate-limited, invalid, or unreachable. Try again shortly, or add a backup key.');
}

// ── Live market research (Claude web_search tool) ───────────────────────
// This is a secondary, qualitative signal layer — NOT the primary source of
// pricing/ranking data. The primary source is content.js's own interception
// of Fiverr's search-results page for the niche (real, first-party, live
// prices/tags/titles from what's actually ranking). This function fills in
// what that can't see: recent buyer sentiment, seasonal angles, category
// trend context. See content.js researchMarket() for how the two combine.
async function handleMarketResearch(payload) {
  const stored = await getSettings();
  const claudeKeys = keyList('anthropicKeys', 'anthropicApiKey', stored);
  if (!claudeKeys.length) {
    // Web search is a Claude-only tool (Groq has no equivalent here) — if no
    // Claude key is configured, just skip this layer silently. Callers treat
    // a null/empty result as "no qualitative context available" and proceed
    // with whatever first-party Fiverr data they already scraped.
    return { result: '' };
  }

  const opts = {
    prompt: payload.prompt,
    systemPrompt: payload.systemPrompt,
    model: stored.model,
    maxTokens: payload.maxTokens || 1024,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
  };

  for (const key of claudeKeys) {
    const result = await callClaudeWithKey(key, opts);
    if (result) return { result: result.text };
  }
  // All keys failed/rate-limited — degrade gracefully, don't block the gig
  // generation flow over an optional enrichment step.
  return { result: '' };
}
