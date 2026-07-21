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
//     talks to api.anthropic.com, api.groq.com, and api.openai.com — the
//     three hosts declared in manifest.json. There is no telemetry, no
//     logging service, and no "phone home" call anywhere in this codebase.
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
const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';

const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'AI_REQUEST':
      handleAIRequest(msg.payload).then(sendResponse).catch(err => sendResponse({ error: err.message }));
      return true;

    case 'AI_IMAGE':
      handleImageRequest(msg.payload).then(sendResponse).catch(err => sendResponse({ error: err.message }));
      return true;

    // Legacy message type kept so nothing silently breaks if an older
    // popup/content script instance is still cached by Chrome.
    case 'GROQ_REQUEST':
      handleAIRequest(msg.payload).then(sendResponse).catch(err => sendResponse({ error: err.message }));
      return true;
  }
});

function getSettings() {
  return new Promise(r => chrome.storage.sync.get(
    ['anthropicKeys', 'anthropicApiKey', 'groqKeys', 'groqApiKey', 'openaiKeys', 'openaiApiKey',
     'provider', 'model', 'groqModel', 'imageModel', 'temperature'],
    r
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

async function callGroqWithKey(apiKey, { prompt, systemPrompt, model, temperature }) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_GROQ_MODEL,
      temperature: temperature ?? 0.7,
      max_tokens: 8000,
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

// ── Gig thumbnail image generation ──────────────────────────────────────
// Two-step pipeline: Claude (or Groq) writes the creative prompt, then the
// OpenAI Images API renders it. Returns a base64 PNG the content script
// turns into a real File and drops into Fiverr's gallery upload input.

async function handleImageRequest(payload) {
  const stored = await getSettings();
  const openaiKeys = keyList('openaiKeys', 'openaiApiKey', stored);
  if (!openaiKeys.length) {
    throw new Error('Image generation requires an OpenAI API key (used only for image rendering). Add one in the Images tab.');
  }

  let lastErr = null;
  for (const key of openaiKeys) {
    try {
      const res = await fetch(OPENAI_IMAGES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: stored.imageModel || 'gpt-image-1',
          prompt: payload.prompt,
          size: payload.size || '1536x1024',
          n: 1,
        }),
      });

      if (res.status === 429 || res.status === 401) { lastErr = new Error(`Image API error ${res.status}`); continue; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Image API error ${res.status}`);
      }

      const data = await res.json();
      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) throw new Error('Image API returned no image data.');
      return { result: b64 };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(lastErr?.message || 'Image generation failed on all configured keys.');
}
