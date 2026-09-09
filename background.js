// ─────────────────────────────────────────────────────────────────────────
// Brainbox Gig AI — background service worker / Firefox MV3 event page
//
// Network policy:
//   - AI requests go only to api.anthropic.com and api.groq.com.
//   - Fiverr market research is same-origin and happens in content.js.
//   - API keys are never logged or sent to Brainbox servers.
//
// Claude sampling note:
//   Claude Sonnet 5 and Opus 4.7+ reject non-default temperature/top_p/top_k.
//   We therefore omit those parameters for Claude and translate the user's
//   creativity setting into a prompt instruction instead.
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

    // Legacy message type kept so older cached content scripts do not break.
    case 'GROQ_REQUEST':
      handleAIRequest(msg.payload).then(sendResponse).catch(err => sendResponse({ error: err.message }));
      return true;
  }
});

// Groq deprecated these IDs in 2026. Migrate saved settings automatically.
const DEPRECATED_GROQ_MODELS = {
  'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
  'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
  'qwen/qwen3-32b': 'openai/gpt-oss-120b',
  'meta-llama/llama-4-scout-17b-16e-instruct': 'openai/gpt-oss-120b',
};

function getSettings() {
  return new Promise(resolve => chrome.storage.sync.get(
    ['anthropicKeys', 'anthropicApiKey', 'groqKeys', 'groqApiKey',
     'provider', 'model', 'groqModel', 'temperature'],
    stored => {
      const replacement = DEPRECATED_GROQ_MODELS[stored.groqModel];
      if (replacement) {
        stored.groqModel = replacement;
        chrome.storage.sync.set({ groqModel: replacement });
      }
      resolve(stored);
    }
  ));
}

function keyList(arrKey, singleKey, stored) {
  const arr = stored[arrKey] || (stored[singleKey] ? [stored[singleKey]] : []);
  return arr.filter(Boolean);
}

function creativityHint(temperature) {
  if (temperature === undefined || temperature === null) return '';
  if (temperature >= 0.75) {
    return '\n\nVary your wording, structure, and specific phrasing from anything you may have generated before for this niche — favor a fresh, creative angle over a safe/generic one.';
  }
  if (temperature <= 0.35) {
    return '\n\nBe precise, literal, and consistent. Prefer the most direct, unambiguous phrasing over creative variation.';
  }
  return '';
}

// ── Claude ───────────────────────────────────────────────────────────────

async function callClaudeWithKey(apiKey, { prompt, systemPrompt, model, temperature, tools, maxTokens }) {
  const finalSystem = (systemPrompt || '') + creativityHint(temperature);
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

  if (res.status === 429 || res.status === 401 || res.status === 403) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Claude API error ${res.status}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
  return { text, raw: data };
}

async function callClaude(opts, keys) {
  for (const key of keys) {
    const result = await callClaudeWithKey(key, opts);
    if (result !== null) return result;
  }
  return null;
}

// ── Groq ─────────────────────────────────────────────────────────────────

function reasoningParamsFor(model) {
  if (/gpt-oss/i.test(model || '')) return { reasoning_effort: 'low' };
  if (/qwen/i.test(model || '')) return { reasoning_effort: 'none' };
  return {};
}

async function callGroqWithKey(apiKey, { prompt, systemPrompt, model, temperature, maxTokens }) {
  const finalModel = model || DEFAULT_GROQ_MODEL;
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: finalModel,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens || 3000,
      ...reasoningParamsFor(finalModel),
      messages: [
        { role: 'system', content: systemPrompt || '' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (res.status === 429 || res.status === 401 || res.status === 403) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq API error ${res.status}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq returned an empty response.');
  return { text: text.trim() };
}

async function callGroq(opts, keys) {
  for (const key of keys) {
    const result = await callGroqWithKey(key, opts);
    if (result !== null) return result;
  }
  return null;
}

// ── Text generation entry point ──────────────────────────────────────────

async function handleAIRequest(payload = {}) {
  const stored = await getSettings();
  const provider = stored.provider || 'claude';
  const temperature = payload.temperature ?? stored.temperature;

  const claudeKeys = keyList('anthropicKeys', 'anthropicApiKey', stored);
  const groqKeys = keyList('groqKeys', 'groqApiKey', stored);
  if (payload.apiKey && !groqKeys.includes(payload.apiKey)) groqKeys.push(payload.apiKey);

  const opts = {
    prompt: payload.prompt,
    systemPrompt: payload.systemPrompt,
    temperature,
    model: stored.model,
    maxTokens: payload.maxTokens,
  };

  // Tests can force exactly one provider. Normal generation keeps the saved
  // provider priority and automatic fallback behavior.
  const order = payload.forceProvider === 'claude'
    ? ['claude']
    : payload.forceProvider === 'groq'
      ? ['groq']
      : provider === 'groq'
        ? ['groq', 'claude']
        : ['claude', 'groq'];

  for (const selected of order) {
    if (selected === 'claude' && claudeKeys.length) {
      const result = await callClaude(opts, claudeKeys);
      if (result) return { result: result.text, provider: 'claude' };
    }
    if (selected === 'groq' && groqKeys.length) {
      const result = await callGroq({ ...opts, model: stored.groqModel || DEFAULT_GROQ_MODEL }, groqKeys);
      if (result) return { result: result.text, provider: 'groq' };
    }
  }

  if (!claudeKeys.length && !groqKeys.length) {
    throw new Error('No API key set. Open the extension popup → AI Provider tab and add a Claude and/or Groq key.');
  }

  if (payload.forceProvider === 'claude' && !claudeKeys.length) {
    throw new Error('No Claude API key is configured.');
  }
  if (payload.forceProvider === 'groq' && !groqKeys.length) {
    throw new Error('No Groq API key is configured.');
  }

  throw new Error('All configured API keys were rate-limited, invalid, or unreachable. Try again shortly, or add a backup key.');
}

// ── Live market research (Claude web_search tool) ───────────────────────

async function handleMarketResearch(payload = {}) {
  const stored = await getSettings();
  const claudeKeys = keyList('anthropicKeys', 'anthropicApiKey', stored);
  if (!claudeKeys.length) return { result: '' };

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

  return { result: '' };
}