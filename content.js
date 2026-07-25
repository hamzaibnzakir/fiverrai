const GIG_PATTERN     = /fiverr\.com\/users\/[^/]+\/manage_gigs/;
const PROFILE_PATTERN = /fiverr\.com\/sellers\/[^/]+\/edit/;

let faiKeywords = '';
let faiEnabled = true;
let faiResearchEnabled = true;
let _faiStop = false;

// Appended to the prose-writing prompts so output reads like a real seller
// wrote it, not an AI template. Kept in one place so the "voice" stays
// consistent across title, description, FAQs, bio, and work-experience.
const HUMAN_VOICE = `

WRITE LIKE A REAL PERSON, NOT AN AI:
- Use natural contractions (I'll, you're, it's, don't) and vary sentence length — mix short punchy lines with longer ones.
- Never open two sentences the same way, and don't line every point up in the same rhythm.
- Ban these AI-cliché words/phrases entirely: elevate, unleash, seamless, seamlessly, dive in, in today's fast-paced world, take it to the next level, unlock, robust, cutting-edge, game-changer, leverage, tailored solutions, top-notch, harness, embark, realm.
- Be concrete and specific over vague and impressive — real tool names, real numbers, real outcomes beat adjectives.
- A little natural imperfection (a casual aside, a direct "here's the deal") reads more human than flawless corporate polish.`;

chrome.storage.local.get(['faiKeywords', 'faiEnabled', 'faiResearch'], (data) => {
  faiKeywords = data.faiKeywords || '';
  faiEnabled = data.faiEnabled !== false;
  faiResearchEnabled = data.faiResearch !== false;
});

function getProfile() {
  return new Promise(r => chrome.storage.local.get(['faiName', 'faiYears', 'faiCountry'], r));
}

// Import from localStorage if fetch-lists.js just ran (saved there as bridge)
(function importLocalStorage() {
  try {
    const c = JSON.parse(localStorage.getItem('faiCompanies') || 'null');
    const s = JSON.parse(localStorage.getItem('faiSkills')    || 'null');
    if (c?.length > 0 || s?.length > 0) {
      const data = {};
      if (c?.length > 0) data.faiCompanies = c;
      if (s?.length > 0) data.faiSkills    = s;
      chrome.storage.local.set(data);
      localStorage.removeItem('faiCompanies');
      localStorage.removeItem('faiSkills');
    }
  } catch (e) {}
})();

// Load bundled lists from data/*.json — only if storage is empty (never overwrites fetched data)
async function loadBundledLists() {
  try {
    const existing = await new Promise(r => chrome.storage.local.get(['faiCompanies', 'faiSkills'], r));
    const needCompanies = !existing.faiCompanies?.length;
    const needSkills    = !existing.faiSkills?.length;
    if (!needCompanies && !needSkills) return;

    const [cRes, sRes] = await Promise.all([
      fetch(chrome.runtime.getURL('data/companies.json')),
      fetch(chrome.runtime.getURL('data/skills.json')),
    ]);
    const companies = await cRes.json();
    const skills    = await sRes.json();
    const toSet = {};
    if (needCompanies && companies?.length > 0) toSet.faiCompanies = companies;
    if (needSkills    && skills?.length > 0)    toSet.faiSkills    = skills;
    if (Object.keys(toSet).length) await new Promise(r => chrome.storage.local.set(toSet, r));
  } catch (e) {}
}
loadBundledLists();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.faiKeywords) faiKeywords = changes.faiKeywords.newValue || '';
    if (changes.faiEnabled !== undefined) {
      faiEnabled = changes.faiEnabled.newValue !== false;
      applyEnabledState();
    }
    if (changes.faiResearch !== undefined) {
      faiResearchEnabled = changes.faiResearch.newValue !== false;
    }
  }
});

function applyEnabledState() {
  document.querySelectorAll('.fai-field-btn').forEach(b => {
    b.style.display = faiEnabled ? '' : 'none';
  });
  if (faiEnabled) scanAndInject();
}

// ── Anti-detection ────────────────────────────────────────────────────────────

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms) { return _faiStop ? Promise.resolve() : new Promise(r => setTimeout(r, ms)); }
function humanDelay() { return sleep(rand(400, 900)); }

// QWERTY neighbour map — used to make the occasional typo believable (you
// almost always mis-hit an adjacent key, not a random one).
const _KEY_ADJ = {
  a:'qwsz', b:'vghn', c:'xdfv', d:'serfcx', e:'wsdr', f:'drtgvc', g:'ftyhbv',
  h:'gyujnb', i:'ujko', j:'huikmn', k:'jiolm', l:'kop', m:'njk', n:'bhjm',
  o:'iklp', p:'ol', q:'wa', r:'edft', s:'awedxz', t:'rfgy', u:'yhji',
  v:'cfgb', w:'qase', x:'zsdc', y:'tghu', z:'asx',
};
function _typoFor(ch) {
  const lower = ch.toLowerCase();
  const near = _KEY_ADJ[lower];
  if (!near) return null;
  const pick = near[Math.floor(Math.random() * near.length)];
  return (ch !== lower) ? pick.toUpperCase() : pick; // preserve caps
}

// Per-character delay: slower on word gaps, and a real "breath" after
// sentence/clause punctuation, so the cadence isn't robotically even.
function _charDelay(ch, prev) {
  let d = rand(55, 145);
  if (ch === ' ') d += rand(10, 70);
  if (/[.!?]/.test(prev)) d += rand(180, 420);
  else if (/[,;:]/.test(prev)) d += rand(90, 240);
  return d;
}

// Types like a person: adjacent-key typos that get noticed and back-spaced,
// uneven rhythm, and occasional short "thinking" pauses. Every character is
// dispatched with real keydown/input/keyup events so Fiverr's React app
// registers it as genuine user input (same reason humanType existed before).
async function humanType(el, text) {
  el.focus();
  await sleep(rand(120, 260));
  const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  const setVal = v => { nativeSetter ? nativeSetter.call(el, v) : (el.value = v); };

  setVal('');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(rand(50, 110));

  const emit = (val, key, extra) => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    setVal(val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (extra) el.dispatchEvent(extra);
    el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
  };

  let current = '';
  let prev = '';
  for (const char of text) {
    if (_faiStop) break;

    // ~4% of letters: fat-finger an adjacent key, pause, then correct it.
    if (/[a-z]/i.test(char) && Math.random() < 0.04) {
      const wrong = _typoFor(char);
      if (wrong) {
        current += wrong;
        emit(current, wrong, new InputEvent('input', { inputType: 'insertText', data: wrong, bubbles: true }));
        await sleep(rand(110, 280));                     // notice it
        current = current.slice(0, -1);                  // backspace
        emit(current, 'Backspace', new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }));
        await sleep(rand(70, 180));
      }
    }

    current += char;
    emit(current, char, new InputEvent('input', { inputType: 'insertText', data: char, bubbles: true }));

    await sleep(_charDelay(char, prev));
    if (Math.random() < 0.035) await sleep(rand(200, 560)); // mid-thought pause
    prev = char;
  }

  el.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(rand(70, 150));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

async function typeTag(input, tag) {
  await humanType(input, tag);
  await sleep(rand(150, 280));
  ['keydown', 'keypress', 'keyup'].forEach(e =>
    input.dispatchEvent(new KeyboardEvent(e, { key: 'Enter', keyCode: 13, which: 13, bubbles: true }))
  );
  await sleep(rand(280, 500));
  if (input.value.trim()) {
    ['keydown', 'keypress', 'keyup'].forEach(e =>
      input.dispatchEvent(new KeyboardEvent(e, { key: ',', keyCode: 188, which: 188, bubbles: true }))
    );
    const ns = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    ns ? ns.call(input, '') : (input.value = '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(rand(200, 380));
  }
}

// ── Groq ──────────────────────────────────────────────────────────────────────

function getKeywords() {
  if (GIG_PATTERN.test(location.href)) {
    const inp = document.getElementById('fai-gig-niche');
    // Use bar value if present, otherwise fall back to sessionStorage (persisted from earlier page)
    return (inp ? inp.value.trim() : '') || sessionStorage.getItem('faiGigNiche') || '';
  }
  return faiKeywords;
}

function setMsg() {} // no-op: status shown in button state

function isVisible(el) {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

async function ask(prompt, system, temperature) {
  const res = await chrome.runtime.sendMessage({
    type: 'AI_REQUEST',
    payload: { prompt, systemPrompt: system, temperature }
  });
  if (res.error) throw new Error(res.error);
  return res.result;
}

// ── Live market research ────────────────────────────────────────────────
// Pulls what's actually ranking on Fiverr for the current niche RIGHT NOW —
// real gig titles, tags, and package prices — straight from Fiverr's own
// search-results page, same-origin, under the seller's normal logged-in
// session. One request per research call (not a crawl), cached per-niche
// for 30 minutes, so behaviorally this looks exactly like the seller
// running one manual search — nothing that reads as scraping abuse.
//
// IMPORTANT CAVEAT: Fiverr's page markup isn't something we can inspect
// from outside a live session, so the parsing below is deliberately
// defensive — it tries a JSON-hydration strategy first, then a DOM-pattern
// fallback, and if BOTH come back empty it just returns null. Every caller
// treats null as "no live data available" and falls back to the exact
// generation behavior this extension had before this feature existed.
// This needs one real test pass on fiverr.com to confirm which strategy
// actually fires — see console.debug('[fai-research]', ...) breadcrumbs
// below if you need to debug which path matched.

const RESEARCH_TTL_MS = 30 * 60 * 1000; // 30 minutes

function researchCacheKey(kw) { return `faiResearch:${kw.toLowerCase().trim()}`; }

function getCachedResearch(kw) {
  try {
    const raw = sessionStorage.getItem(researchCacheKey(kw));
    if (!raw) return undefined;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.ts > RESEARCH_TTL_MS) return undefined;
    return cached.data; // may be null (a previous attempt found nothing) or a brief object
  } catch { return undefined; }
}

function setCachedResearch(kw, data) {
  try { sessionStorage.setItem(researchCacheKey(kw), JSON.stringify({ ts: Date.now(), data })); } catch {}
}

// Heuristically walks an arbitrary JSON tree looking for gig-shaped objects
// (a title-like string field + a price-like numeric field) without needing
// to know Fiverr's exact schema in advance — same philosophy as this file's
// existing extractStringArrays() used for the skills/companies lists.
function mineJsonForGigs(node, out = [], depth = 0) {
  if (depth > 8 || out.length >= 60 || !node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) mineJsonForGigs(item, out, depth + 1);
    return out;
  }
  const keys = Object.keys(node);
  const titleKey = keys.find(k => /title|gigTitle|name/i.test(k) && typeof node[k] === 'string' && node[k].length > 8 && node[k].length < 150);
  const priceKey = keys.find(k => /price|cost|startingPrice|packagePrice/i.test(k) &&
    (typeof node[k] === 'number' || (typeof node[k] === 'string' && /^\$?\d/.test(node[k]))));
  if (titleKey && priceKey) {
    const rawPrice = node[priceKey];
    const price = typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice).replace(/[^0-9.]/g, ''));
    if (price && price > 0 && price < 100000) out.push({ title: node[titleKey], price });
  }
  for (const k of keys) mineJsonForGigs(node[k], out, depth + 1);
  return out;
}

// DOM fallback: look for "$NN"-shaped price text near a link/heading inside
// a gig-card-ish element. Resilient to class-name changes since it doesn't
// depend on any specific selector, only on the visible price/title pattern.
function mineDomForGigs(doc) {
  const results = [];
  const priceRe = /\$\s?\d{1,4}/;
  const candidates = [...doc.querySelectorAll('a[href*="/gigs/"], a[href*="gig_id"], article, li')];
  for (const el of candidates) {
    const text = (el.textContent || '').trim();
    const priceMatch = text.match(priceRe);
    if (!priceMatch) continue;
    const titleEl = el.querySelector('h1,h2,h3,h4,p,span');
    const title = (titleEl?.textContent || '').trim().slice(0, 140);
    if (!title || title.length < 8) continue;
    const price = parseInt(priceMatch[0].replace(/[^\d]/g, ''), 10);
    if (!price || price < 3 || price > 100000) continue;
    results.push({ title, price });
    if (results.length >= 40) break;
  }
  return results;
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

const RESEARCH_STOPWORDS = new Set(['the','a','an','and','or','for','with','to','of','in','on','i','will','your','you','my','is','are','from','by']);
function topTerms(titles, n = 8) {
  const freq = {};
  for (const t of titles) {
    for (const w of t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)) {
      if (w.length < 3 || RESEARCH_STOPWORDS.has(w)) continue;
      freq[w] = (freq[w] || 0) + 1;
    }
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

// Single same-origin fetch of Fiverr's own search results for the niche —
// functionally identical to the seller typing a search and hitting enter.
async function fetchFiverrGigs(kw) {
  const url = `https://www.fiverr.com/search/gigs?query=${encodeURIComponent(kw)}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) return [];
  const html = await res.text();

  // Strategy 1: embedded hydration JSON (try the common variable names).
  for (const re of [
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/,
    /window\.__NUXT__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/,
    /<script[^>]*id=["']perseus-initial-props["'][^>]*>([\s\S]*?)<\/script>/,
  ]) {
    const m = html.match(re);
    if (!m) continue;
    try {
      const data = JSON.parse(m[1]);
      const mined = mineJsonForGigs(data);
      if (mined.length) { console.debug('[fai-research] matched via JSON hydration', mined.length); return mined; }
    } catch { /* try next strategy */ }
  }

  // Strategy 2: parse the returned HTML as a DOM and pattern-match visible cards.
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const mined = mineDomForGigs(doc);
    if (mined.length) console.debug('[fai-research] matched via DOM fallback', mined.length);
    return mined;
  } catch {
    return [];
  }
}

// Main entry point. Returns a market brief, or null if research is off,
// nothing was found, or the fetch/parse failed for any reason — callers
// must treat null as "proceed exactly like this feature doesn't exist."
async function researchMarket(kw, setStatus) {
  if (!faiResearchEnabled || !kw) return null;

  const cached = getCachedResearch(kw);
  if (cached !== undefined) return cached;

  try {
    setStatus?.('⟳ Researching market…');
    const gigs = await fetchFiverrGigs(kw);
    if (!gigs.length) { setCachedResearch(kw, null); return null; }

    setStatus?.(`⟳ Found ${gigs.length} ranking gigs, analyzing…`);
    const prices = gigs.map(g => g.price).filter(Boolean);
    const brief = {
      count: gigs.length,
      medianPrice: median(prices),
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      commonTerms: topTerms(gigs.map(g => g.title)),
      sampleTitles: gigs.slice(0, 8).map(g => g.title),
    };
    setCachedResearch(kw, brief);
    return brief;
  } catch (e) {
    console.debug('[fai-research] failed, degrading gracefully:', e.message);
    return null; // never block generation over this
  }
}

function forceRefreshResearch(kw) {
  try { sessionStorage.removeItem(researchCacheKey(kw)); } catch {}
}

// Turns a market brief into extra prompt context. Empty string if no brief
// — so every ${marketContext(...)} call site is safe to use unconditionally.
function marketContext(brief) {
  if (!brief) return '';
  const lines = [];
  if (brief.medianPrice) lines.push(`- Live median price among top-ranking gigs right now: ~$${brief.medianPrice} (range $${brief.minPrice}-$${brief.maxPrice}, sampled from ${brief.count} current results)`);
  if (brief.commonTerms?.length) lines.push(`- Terms that repeat across top-ranking titles right now: ${brief.commonTerms.join(', ')}`);
  if (brief.sampleTitles?.length) lines.push(`- A few real titles ranking right now (pattern reference only — never copy or closely mirror these): ${brief.sampleTitles.slice(0, 5).join(' | ')}`);
  if (!lines.length) return '';
  return `\n\nLIVE MARKET RESEARCH (real data just pulled from Fiverr's own search results for this niche):\n${lines.join('\n')}\nGround pricing in the real median above rather than guessing. Use the repeated terms/titles only to see what's saturated so you can differentiate — never copy them.`;
}

// Pick a random item so repeated generations for the same keyword take a different creative angle
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function findByNearbyText(selector, pattern, maxDepth = 6) {
  const all = [...document.querySelectorAll('h3,h4,h5,p,label,div,span')];
  const heading = all.find(el => el.children.length === 0 && pattern.test(el.textContent.trim()));
  if (!heading) return null;
  let node = heading;
  for (let i = 0; i < maxDepth; i++) {
    node = node.parentElement;
    if (!node) break;
    const found = node.querySelector(selector);
    if (found && isVisible(found)) return found;
  }
  return null;
}

// ── Inline button factory ─────────────────────────────────────────────────────

function makeBtn(label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'fai-field-btn';
  btn.textContent = label;
  let running = false;
  const setStatus = (text) => { if (running) btn.textContent = text; };
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    // While running → act as Stop button
    if (running) {
      _faiStop = true;
      running = false;
      btn.textContent = label;
      return;
    }
    const kw = getKeywords();
    if (!kw) {
      btn.textContent = '⚠ Set keywords first';
      setTimeout(() => { btn.textContent = label; }, 2200);
      return;
    }
    _faiStop = false;
    running = true;
    btn.textContent = '◼ Stop';
    try {
      await onClick(kw, setStatus);
      if (!_faiStop) {
        btn.textContent = '✓ Done';
        setTimeout(() => { btn.textContent = label; running = false; }, 2500);
      } else {
        btn.textContent = label;
        running = false;
      }
    } catch (err) {
      running = false;
      btn.textContent = _faiStop ? label : ('✗ ' + err.message.slice(0, 36));
      if (!_faiStop) setTimeout(() => { btn.textContent = label; }, 3500);
    }
  });
  return btn;
}

// ── Gig niche bar (injected once at top of gig editor) ────────────────────────

function injectNicheBar() {
  if (document.getElementById('fai-niche-bar')) return;
  const anchor = (
    document.querySelector('textarea[placeholder*="I will"]') ||
    document.querySelector('input[placeholder*="I will"]') ||
    document.querySelector('textarea[maxlength="80"]')
  );
  if (!anchor) return;

  // Walk up until we find the editor column container (wider than 500px)
  let container = anchor;
  for (let i = 0; i < 12; i++) {
    if (!container.parentElement) break;
    container = container.parentElement;
    if (container.offsetWidth > 500) break;
  }

  const bar = document.createElement('div');
  bar.id = 'fai-niche-bar';
  bar.className = 'fai-niche-bar';
  bar.innerHTML = `
    <label>◆ Niche</label>
    <input id="fai-gig-niche" type="text" autocomplete="off">
    <button id="fai-refresh-research" type="button" title="Refresh live market data for this niche">🔄</button>
    <span id="fai-research-status">powers all AI buttons</span>
  `;
  container.before(bar);

  // Rotate placeholder examples
  const nicheInput = bar.querySelector('#fai-gig-niche');
  const statusEl = bar.querySelector('#fai-research-status');
  const refreshBtn = bar.querySelector('#fai-refresh-research');

  refreshBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const kw = getKeywords();
    if (!kw) { statusEl.textContent = '⚠ set a niche first'; setTimeout(() => { statusEl.textContent = 'powers all AI buttons'; }, 2000); return; }
    forceRefreshResearch(kw);
    refreshBtn.disabled = true;
    const brief = await researchMarket(kw, (t) => { statusEl.textContent = t; });
    refreshBtn.disabled = false;
    statusEl.textContent = brief
      ? `✓ market data refreshed — ${brief.count} live gigs, ~$${brief.medianPrice} median`
      : '— no live market data found for this niche';
    setTimeout(() => { statusEl.textContent = 'powers all AI buttons'; }, 4000);
  });

  // Restore saved niche for this gig session
  const saved = sessionStorage.getItem('faiGigNiche');
  if (saved) nicheInput.value = saved;

  // Persist on every keystroke so it survives wizard page navigation
  nicheInput.addEventListener('input', () => {
    sessionStorage.setItem('faiGigNiche', nicheInput.value);
  });

  const examples = [
    'logo design, branding, vector art',
    'algo trading bot, MT5, Pine Script',
    'wordpress site, landing page, Elementor',
    'video editing, YouTube shorts, reels',
    'python automation, web scraping, API',
    'mobile app, React Native, Flutter',
    'SEO articles, blog writing, copywriting',
    'dropshipping, Shopify, product listing',
    'voiceover, podcast editing, audio',
    'UI/UX design, Figma, prototyping',
  ];
  let _ni = 0;
  nicheInput.placeholder = `e.g. ${examples[0]}`;
  setInterval(() => {
    if (nicheInput.value) return;
    _ni = (_ni + 1) % examples.length;
    nicheInput.placeholder = `e.g. ${examples[_ni]}`;
  }, 3000);
}

// ── Page 1: Overview ──────────────────────────────────────────────────────────

function injectPage1() {
  injectNicheBar();
  // Title
  const titleEl = (
    document.querySelector('textarea[placeholder*="I will"]') ||
    document.querySelector('input[placeholder*="I will"]') ||
    document.querySelector('textarea[maxlength="80"]') ||
    document.querySelector('input[maxlength="80"]')
  );
  if (titleEl && !titleEl.dataset.faiDone) {
    titleEl.dataset.faiDone = '1';
    const btn = makeBtn('◆ Generate Title', async (kw, setStatus) => {
      setMsg('Generating title…', 'info');
      const brief = await researchMarket(kw, setStatus);
      setStatus?.('⟳ Writing title…');
      const angle = pick([
        'Start with a strong action verb (build, develop, automate, create, design) followed by the tool/platform, then the outcome.',
        'Lead with the specific tool or platform name first, then say what you do with it.',
        'Lead with the outcome/result the buyer gets, then mention how you deliver it.',
        'Start with a strong verb, but pick a less obvious one than build/develop/create — e.g. engineer, architect, launch, deploy, optimize.',
        'Frame it around solving a specific buyer problem, then name the tool used to solve it.',
      ]);
      const text = await ask(`Keywords: ${kw}`,
        `Write a short, SEO-optimized Fiverr gig title. The field already shows "I will" — write ONLY what comes after "I will". Do NOT include "I will".
Max 60 chars. Naturally include 1-2 of these keywords: ${kw}.
${angle}
Be specific and punchy: service + tool/platform + outcome. No filler words.
Avoid defaulting to the most generic, expected phrasing — this must read differently from a typical templated gig title.
Reply with ONLY the text, no quotes.${marketContext(brief)}${HUMAN_VOICE}`,
        1.0
      );
      const clean = text.replace(/^["']|["']$/g, '').trim().replace(/^i will\s+/i, '').trim();
      await humanType(titleEl, clean.slice(0, 73));
      setMsg('Title filled!', 'success');
    });
    titleEl.closest('div')?.after(btn);
  }

  // Tags
  const tagEl = (
    findByNearbyText('input', /positive keywords/i) ||
    findByNearbyText('input', /5 tags maximum/i) ||
    document.querySelector('input[placeholder*="tag" i]')
  );
  if (tagEl && !tagEl.dataset.faiDone) {
    tagEl.dataset.faiDone = '1';
    const btn = makeBtn('◆ Generate Tags', async (kw, setStatus) => {
      setMsg('Adding tags…', 'info');
      const brief = await researchMarket(kw, setStatus);
      setStatus?.('⟳ Writing tags…');
      const raw = await ask(`Keywords: ${kw}`,
        `Generate exactly 5 Fiverr search tags. lowercase, 1-3 words each, letters and numbers only, no special chars.
Return ONLY a comma-separated list. Example: algo trading, mt5 bot, python trading, expert advisor, automated trading${marketContext(brief)}`
      );
      const tags = raw.split(',').map(t => t.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '')).filter(Boolean).slice(0, 5);
      for (const tag of tags) { await typeTag(tagEl, tag); await humanDelay(); }
      setMsg('Tags added!', 'success');
    });
    tagEl.closest('div')?.after(btn);
  }
}

// ── Page 2: Pricing ───────────────────────────────────────────────────────────

function injectPage2() {
  injectNicheBar();
  const nameFields = [...document.querySelectorAll('textarea[placeholder*="Name your package"]')].slice(0, 3);
  if (!nameFields.length) return;

  const anchor = nameFields[0].closest('table, div[class*="package"], section') || nameFields[0].closest('div');
  if (anchor && !anchor.dataset.faiDone) {
    anchor.dataset.faiDone = '1';
    const btn = makeBtn('◆ Generate Packages', async (kw, setStatus) => {
      setMsg('Generating packages…', 'info');
      const brief = await researchMarket(kw, setStatus);
      setStatus?.('⟳ Writing packages…');

      const pricingRule = brief?.medianPrice
        ? `- Prices: grounded in the live market data below — position Standard near the real median price for this niche, Basic meaningfully below it, Premium meaningfully above it. Don't undercut to rock-bottom and don't be the most expensive outlier either, unless the scope genuinely justifies it.`
        : `- Prices: realistic for the gig type and tier (basic cheapest, premium highest). No live market data was available for this niche, so use your best judgment for the category.`;

      const packagesPrompt = `Create 3 Fiverr packages for a gig about: ${kw}. Return ONLY valid JSON, no markdown code fences, no extra text:
{
  "basic":    { "name": "UNIQUE_NAME_1", "description": "...", "price": 30  },
  "standard": { "name": "UNIQUE_NAME_2", "description": "...", "price": 75  },
  "premium":  { "name": "UNIQUE_NAME_3", "description": "...", "price": 150 }
}
Rules:
- Top-level keys must be exactly "basic", "standard", "premium" (lowercase) — nothing else.
- Names: creative tier-appropriate names (NOT Basic/Standard/Premium). E.g. Starter, Growth, Pro, Elite, Essential, Advanced, Ultimate. Each must be DIFFERENT.
- Description: use the format 'This [Name] package includes [what's in it].' — 75-90 characters. Example: 'This Starter package includes a logo design with 2 revisions and the source file.' Adapt to the gig niche and tier scope.
${pricingRule}
- Escalate scope between tiers: basic = minimal, standard = full, premium = everything + extras.${marketContext(brief)}${HUMAN_VOICE}
JSON only.`;

      // Normalise whatever shape the model returns into {basic, standard, premium}
      function normalisePkgs(obj) {
        if (!obj || typeof obj !== 'object') return null;
        // Unwrap common wrapper keys
        const inner = obj.packages || obj.data || obj.result || obj;
        const lower = {};
        for (const k of Object.keys(inner)) lower[k.toLowerCase().trim()] = inner[k];
        if (lower.basic && lower.standard && lower.premium) return lower;
        return null;
      }

      async function generatePkgs() {
        const raw = await ask(`Keywords: ${kw}`, packagesPrompt);
        let parsed;
        try { parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0]); }
        catch { return null; }
        return normalisePkgs(parsed);
      }

      let pkgs = await generatePkgs();
      if (!pkgs) {
        setMsg('Retrying package generation…', 'info');
        pkgs = await generatePkgs();
      }
      if (!pkgs) throw new Error('Invalid package data — try again');

      // Re-query at click time — Fiverr React may have re-rendered since inject
      const freshNames  = [...document.querySelectorAll('textarea[placeholder*="Name your package"]')].filter(isVisible).slice(0, 3);
      const freshDescs  = [...document.querySelectorAll('textarea[placeholder*="Describe the details"]')].filter(isVisible).slice(0, 3);
      const priceInputs = [...document.querySelectorAll('input[type="number"], input[type="text"]')]
        .filter(el => el.closest('td, [class*="price"]') && isVisible(el)).slice(0, 3);

      if (!freshNames.length) throw new Error('Package fields not found — scroll to the pricing table first');

      const tiers = ['basic', 'standard', 'premium'];
      for (let i = 0; i < 3; i++) {
        const pkg = pkgs[tiers[i]];
        if (!pkg) continue;
        setMsg(`Filling ${tiers[i]}…`, 'info');
        if (freshNames[i]) { await humanType(freshNames[i], pkg.name); await humanDelay(); }
        if (freshDescs[i]) { await humanType(freshDescs[i], pkg.description.trim().slice(0, 90)); await humanDelay(); }
        if (priceInputs[i]) { await humanType(priceInputs[i], String(pkg.price)); await humanDelay(); }
      }
      setMsg('Packages done!', 'success');
    });
    anchor.before(btn);
  }
}

// ── Wait helpers ──────────────────────────────────────────────────────────────

async function waitFor(selector, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = document.querySelector(selector);
    if (el && isVisible(el)) return el;
    await sleep(200);
  }
  return null;
}

async function waitGone(selector, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = document.querySelector(selector);
    if (!el || !isVisible(el)) return true;
    await sleep(200);
  }
  return false;
}

// ── Page 3: Description & FAQ ─────────────────────────────────────────────────

function injectPage3() {
  injectNicheBar();
  // ── Description ──
  const editor = document.querySelector('.ql-editor[contenteditable="true"]');
  const toolbar = document.querySelector('.ql-toolbar');

  if (editor && toolbar && !toolbar.dataset.faiDone) {
    toolbar.dataset.faiDone = '1';
    const btn = makeBtn('◆ Generate Description', async (kw, setStatus) => {
      setMsg('Generating description…', 'info');
      const brief = await researchMarket(kw, setStatus);
      setStatus?.('⟳ Writing description…');
      const hookStyle = pick([
        'Question the buyer is likely asking themselves, followed by a short confident reassurance. E.g. "Looking for a custom Chrome extension to automate tasks? You\'re in the right place!"',
        'A bold direct claim about the outcome you deliver, no question mark. E.g. "Your workflow shouldn\'t need 10 manual steps when one Chrome extension can do it."',
        'A short relatable pain point the buyer has, stated as fact. E.g. "Repetitive browser tasks eat hours every week that a simple extension could save."',
        'A confident one-line promise of the result, framed as a statement not a question.',
      ]);
      const whyStyle = pick([
        'Start each with action words or adjectives. E.g. "Clean, scalable, well-documented code".',
        'Start each with a number or concrete specific where possible. E.g. "3+ years building production Chrome extensions".',
        'Phrase each as a short benefit to the buyer rather than a trait about you. E.g. "You get working code, not just a demo".',
      ]);

      const data = await ask(`Keywords: ${kw}`,
        `Write a Fiverr gig description for: ${kw}. Return ONLY valid JSON with these exact keys:
{
  "hook": "...",
  "intro": "...",
  "develop": ["...", "...", "...", "...", "...", "..."],
  "why": ["...", "...", "...", "..."],
  "closing": "...",
  "cta": "..."
}

FIVERR PLATFORM RULES (this field has a hard 1,200-character cap and gets flagged/truncated past it — the whole description across every field below must total roughly 900-1050 visible characters, comfortably under the cap, not up against it):
- hook: ${hookStyle} 1 sentence, max 110 chars. Never start with "I" — open on the buyer's problem or the outcome, not on yourself.
- intro: 1 sentence framed around the BUYER's situation and what they get — who this is for and what problem it solves. Do not lead with your own bio; if experience is mentioned at all, it's a trailing trust cue, not the subject of the sentence. Max 140 chars.
- develop: exactly 6 specific things you can build/deliver for this niche (not 8 — keep the section scannable and inside the char budget). Short phrases, 4-8 words each. Diverse and specific to ${kw}.
- why: exactly 4 short selling points (not 6). 4-7 words each. ${whyStyle}
- closing: 1 sentence wrapping up the offer, inviting them to order. Max 120 chars.
- cta: one direct action sentence, 50-70 chars.
- The primary keyword/service from "${kw}" must appear naturally within the hook or intro (Fiverr indexes description keywords, and early placement carries more weight) — but never stuff or repeat keywords artificially; write for the buyer first.
- Avoid the most predictable, template-sounding phrasing — this should read differently each time it's generated, not like the same gig with nouns swapped.

FIVERR COMPLIANCE — never include any of the following anywhere in the output, no exceptions:
- Any contact info or off-platform payment method: email addresses, phone numbers, WhatsApp, Telegram, Skype, Discord, PayPal, or any invitation to communicate/pay outside Fiverr.
- Unverifiable guarantees or absolute claims: "100% guaranteed," "#1," "best in the world," fake certifications, or promises you can't back up. Confidence is fine; false certainty is not.
- Emojis, excessive punctuation ("!!!" "???"), ALL-CAPS shouting, or non-standard special characters.
- Claims of official partnership/certification with a named brand or platform unless it's simply naming a tool you use (e.g. "I build with Shopify" is fine; "official Shopify partner" is not, unless literally true and stated as such elsewhere).
- Anything that could read as copied from another seller's listing — this must be original phrasing every time.

Output JSON only, no markdown, no char counts.${marketContext(brief)}${HUMAN_VOICE}`,
        0.95
      );

      let desc;
      try { desc = JSON.parse(data.match(/\{[\s\S]*\}/)?.[0]); }
      catch { throw new Error('Could not parse description — try again'); }
      if (!desc?.hook || !Array.isArray(desc.develop)) throw new Error('Bad description format — try again');
      const clean = s => String(s).replace(/\s*\(\d+.*?\)\s*/g, '').trim();
      desc.hook    = clean(desc.hook);
      desc.intro   = clean(desc.intro || '');
      desc.develop = (desc.develop || []).map(b => clean(b)).filter(Boolean).slice(0, 6);
      desc.why     = (desc.why || []).map(b => clean(b)).filter(Boolean).slice(0, 4);
      desc.closing = clean(desc.closing || '');
      desc.cta     = clean(desc.cta || '');

      editor.click();
      editor.focus();
      await sleep(rand(200, 350));

      // Clear editor
      document.execCommand('selectAll', false, null);
      await sleep(60);
      document.execCommand('delete', false, null);
      await sleep(150);
      editor.focus();
      await sleep(80);

      const esc = t => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const devHtml = desc.develop.map(b => `<li>${esc(b)}</li>`).join('');
      const whyHtml = desc.why.map(b => `<li>${esc(b)}</li>`).join('');
      const html = `<p>${esc(desc.hook)}</p><p><br></p>`
        + `<p>${esc(desc.intro)}</p><p><br></p>`
        + `<p><strong>I can develop:</strong></p><ul>${devHtml}</ul><p><br></p>`
        + `<p><strong>Why choose me?</strong></p><ul>${whyHtml}</ul><p><br></p>`
        + `<p>${esc(desc.closing)}</p><p><br></p>`
        + `<p>${esc(desc.cta)}</p>`;

      document.execCommand('insertHTML', false, html);
      await sleep(400);

      setMsg('Description filled!', 'success');
    });
    btn.style.marginBottom = '6px';
    btn.style.display = 'block';
    toolbar.before(btn);
  }

  // ── FAQs ──
  const faqHeading = [...document.querySelectorAll('h2,h3,h4,p,div,span')]
    .find(el => el.children.length === 0 && /frequently asked questions/i.test(el.textContent.trim()));

  if (faqHeading && !faqHeading.dataset.faiDone) {
    faqHeading.dataset.faiDone = '1';
    const btn = makeBtn('◆ Generate FAQs', async (kw) => {
      setMsg('Generating FAQs…', 'info');
      const concerns = [
        'How long will my project take? (give a concrete timeline with a reason)',
        'What if I need changes after delivery? (specific revision policy)',
        'What do you need from me to get started? (exact requirements)',
        'What exactly will I receive? (files, formats, source code, documentation etc.)',
        'Have you done this before? (specific past experience, tools used, numbers if possible)',
      ].sort(() => Math.random() - 0.5); // shuffle so questions don't always appear in the same order

      const voiceStyle = pick([
        'Sound confident and direct, short sentences.',
        'Sound warm and conversational, like a seller who genuinely enjoys the work.',
        'Sound efficient and no-nonsense, get straight to the specific facts.',
        'Sound like an experienced expert who has answered this a hundred times, calm and matter-of-fact.',
      ]);

      const raw = await ask(`Keywords: ${kw}`,
        `Write exactly 5 FAQs a real buyer would ask about a Fiverr gig for: ${kw}
Think like a buyer with a specific concern — not a generic template writer.
Cover these 5 real buyer concerns, in this order:
1. ${concerns[0]}
2. ${concerns[1]}
3. ${concerns[2]}
4. ${concerns[3]}
5. ${concerns[4]}
Return ONLY valid JSON array:
[
  { "question": "...", "answer": "..." },
  { "question": "...", "answer": "..." },
  { "question": "...", "answer": "..." },
  { "question": "...", "answer": "..." },
  { "question": "...", "answer": "..." }
]
RULES:
- NEVER mention email, phone, WhatsApp, Telegram, Skype, Discord, or PayPal, or invite communication/payment off-platform — Fiverr TOS violation.
- No unverifiable guarantees ("100% guaranteed," "#1," fake certifications) and no emojis or ALL-CAPS.
- Questions: written as the buyer asking, casual and direct (e.g. "How long does it take?", "What do I get?").
- Answers: confident, personal, first-person. 2 sentences max. 180-260 chars. Use real specifics — tool names, day counts, file types, numbers. Sound like a real seller, not a template.
- BAD answer: "I will deliver high-quality results in a timely manner." GOOD answer: "Most projects take 3-5 days. I'll send you the full source code, manifest, and a setup guide."
- ${voiceStyle}
- Avoid reusing the most predictable phrasing — vary sentence structure and word choice so this doesn't read like a template filled in with different nouns.${HUMAN_VOICE}
JSON only, no markdown.`,
        0.95
      );
      let faqs;
      try { faqs = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0]); }
      catch { throw new Error('Could not parse FAQs — try again'); }

      function findAddFaqBtn() {
        return [...document.querySelectorAll('a, button, span')]
          .find(el => /^\+?\s*Add FAQ$/i.test(el.textContent.trim()) && isVisible(el));
      }

      for (let i = 0; i < Math.min(faqs.length, 5); i++) {
        if (_faiStop) break;
        setMsg(`Adding FAQ ${i + 1}/5…`, 'info');

        // Wait for form to be closed first (from previous Add click)
        await waitGone('input[placeholder*="Add a Question" i]', 3000);
        await sleep(rand(300, 500));

        // Click "+ Add FAQ" to open the form
        const addBtn = findAddFaqBtn();
        if (!addBtn) { setMsg(`"+ Add FAQ" not found at entry ${i + 1}`, 'error'); break; }
        addBtn.click();

        // Wait for form inputs to appear
        const qEl = await waitFor('input[placeholder*="Add a Question" i]', 5000);
        const aEl = await waitFor('textarea[placeholder*="Add an Answer" i]', 5000);
        if (!qEl || !aEl) { setMsg(`FAQ form didn't open at entry ${i + 1}`, 'error'); break; }

        await sleep(rand(200, 400));
        await humanType(qEl, faqs[i].question);
        await humanDelay();
        await humanType(aEl, faqs[i].answer.slice(0, 265));
        await humanDelay();

        // Click "Add" to save
        const saveBtn = [...document.querySelectorAll('button')]
          .find(el => el.textContent.trim() === 'Add' && isVisible(el));
        if (!saveBtn) { setMsg(`"Add" button not found at FAQ ${i + 1}`, 'error'); break; }
        saveBtn.click();
        await sleep(rand(500, 800));
      }
      setMsg('All 5 FAQs added!', 'success');
    });
    faqHeading.after(btn);
  }
}

// ── Page 4: Requirements ─────────────────────────────────────────────────────

function injectPage4() {
  injectNicheBar();
  // Detect by the requirements textarea placeholder
  const reqTextarea = document.querySelector('textarea[placeholder*="Request necessary details" i]');
  const heading = [...document.querySelectorAll('h2,h3,h4,p,div,span')]
    .find(el => el.children.length === 0 && /your questions/i.test(el.textContent.trim()));

  const anchor = heading || reqTextarea;
  if (!anchor || anchor.dataset.faiDone) return;
  anchor.dataset.faiDone = '1';

  const btn = makeBtn('◆ Generate Requirements', async (kw) => {
    setMsg('Generating requirements…', 'info');
    const raw = await ask(`Keywords: ${kw}`,
      `Write 3 buyer requirement questions for a Fiverr gig about: ${kw}
These are questions the seller asks the buyer when they place an order.
Return ONLY valid JSON array:
[
  { "question": "...", "required": true },
  { "question": "...", "required": true },
  { "question": "...", "required": false }
]
Rules:
- Each question under 380 characters
- Ask for: 1) project specs/details, 2) technical preferences/requirements, 3) timeline or extra info
- Be specific to the gig type
- required: true for essential info, false for optional
JSON only.`
    );

    let reqs;
    try { reqs = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0]); }
    catch { throw new Error('Could not parse requirements — try again'); }

    for (let i = 0; i < reqs.length; i++) {
      if (_faiStop) break;
      setMsg(`Adding requirement ${i + 1}/${reqs.length}…`, 'info');

      if (i > 0) {
        await waitGone('textarea[placeholder*="Request necessary details" i]', 4000);
        await sleep(rand(300, 500));

        const addBtn = [...document.querySelectorAll('button, a, span')]
          .find(el => /add (a )?question/i.test(el.textContent.trim()) && isVisible(el));
        if (!addBtn) { setMsg(`"Add Question" button not found at req ${i + 1}`, 'error'); break; }
        addBtn.click();
        await sleep(rand(400, 700));
      }

      const textarea = await waitFor('textarea[placeholder*="Request necessary details" i]', 5000);
      if (!textarea) { setMsg(`Requirement form not found at entry ${i + 1}`, 'error'); break; }

      await sleep(rand(150, 300));
      await humanType(textarea, reqs[i].question.slice(0, 380));
      await humanDelay();

      // Check "Required" if needed
      if (reqs[i].required) {
        const checkbox = document.querySelector('input[type="checkbox"]');
        if (checkbox && !checkbox.checked) {
          checkbox.click();
          await sleep(rand(150, 300));
        }
      }

      // Click "Add" to save
      const saveBtn = [...document.querySelectorAll('button')]
        .find(el => el.textContent.trim() === 'Add' && isVisible(el));
      if (!saveBtn) { setMsg(`"Add" button not found at req ${i + 1}`, 'error'); break; }
      saveBtn.click();
      await sleep(rand(500, 800));
    }
    setMsg('Requirements added!', 'success');
  });

  if (heading) heading.after(btn);
  else reqTextarea.closest('div')?.before(btn);
}

// ── Page 5: Gallery — AI image prompt generator ───────────────────────────────

function injectPage5() {
  injectNicheBar();

  const heading = [...document.querySelectorAll('h1,h2,h3,h4')]
    .find(el => /gallery|show off your (best )?work|images? (&|and) video/i.test(el.textContent.trim()));
  const dropzone = document.querySelector('input[type="file"][accept*="image" i]');
  const anchor = heading || dropzone?.closest('div');
  if (!anchor || anchor.dataset.faiGalleryDone) return;
  anchor.dataset.faiGalleryDone = '1';

  // Color palettes — [background hex, name, accent hex, accent name, tone]
  // "tone" groups palettes so a niche's mood (playful vs corporate vs elegant)
  // picks a palette that actually fits it, instead of pure random.
  const PALETTES = [
    ['#05080F', 'pure deep black', '#FFB800', 'gold', 'bold'],
    ['#0A0F1E', 'deep navy', '#00D9FF', 'electric cyan', 'corporate'],
    ['#12080A', 'near-black charcoal red', '#FF3B30', 'crimson red', 'bold'],
    ['#0B0F0C', 'deep forest black', '#39FF88', 'neon green', 'playful'],
    ['#0D0A14', 'deep violet-black', '#C77DFF', 'vivid purple', 'playful'],
    ['#FFFFFF', 'pure white', '#0057FF', 'royal blue', 'corporate'],
    ['#0F0B08', 'deep espresso black', '#FF8A00', 'burnt orange', 'bold'],
    ['#FAF7F2', 'warm off-white', '#2B2118', 'deep espresso', 'elegant'],
    ['#F5F1EA', 'soft cream', '#B08D57', 'muted gold', 'elegant'],
    ['#0C1210', 'deep pine black', '#7FFFD4', 'aquamarine', 'minimal'],
    ['#111111', 'matte black', '#FFFFFF', 'pure white', 'minimal'],
    ['#1A0F1F', 'deep plum', '#FF6EC7', 'hot pink', 'playful'],
  ];

  // Layout skeletons, grouped by tone. Each returns the full prompt given
  // the content fields. Tone families let the model's chosen mood pick a
  // matching composition instead of every gig getting a random layout.
  const LAYOUTS = {
    bold: [
      // stacked two-line massive title, centered, icons scattered corners/mid-sides
      (d, bg, accent, logoLines) => `Create a premium Fiverr gig thumbnail, 1536x1024 pixels.
One unified full image. NO split panels. NO divider lines. NO cards. NO feature lists.
Bold typography center. Relevant tool/platform icons surrounding it.

BACKGROUND: ${bg[1]} (${bg[0]}) across the entire image. Completely clean and unified — no patterns, no grid, no textures, no columns.

CENTER OF IMAGE (main focal point): massive ultra-bold Anton or Montserrat Black font, 2 lines, perfectly centered:
Line 1: "${d.line1}" — pure ${bg[0] === '#FFFFFF' ? 'black' : 'white'}, absolutely enormous
Line 2: "${d.line2}" — ${accent[1]} (${accent[0]}), even bigger than line 1, dominates the image

Below title, one thin horizontal ${accent[1]} line. Below that, one single clean light gray text line: "${d.subtitle}"
That is all the text on the entire image.

ICONS/LOGOS, arranged organically around the title like planets around a center, not in a row, each large and instantly recognizable:
${logoLines}

STYLE: minimal dark tech poster, extreme negative space, clean and premium.
DO NOT include: split lines, divider panels, feature cards, stat badges, bottom logo rows, particle effects, human figures, charts, money imagery, website URL, hexagon badges, clutter of any kind.`,

      // single dominant word large, second word smaller below it, icons in a loose bottom arc
      (d, bg, accent, logoLines) => `Create a premium Fiverr gig thumbnail, 1536x1024 pixels. One unified image, no panels, no borders, no grid lines.

BACKGROUND: solid ${bg[1]} (${bg[0]}), completely flat and clean.

UPPER-CENTER TEXT: the single word "${d.line2}" in massive ultra-bold condensed sans-serif (Anton style), filling most of the horizontal width, color ${accent[1]} (${accent[0]}), with a soft ${accent[1]} glow behind it.
Directly above it, smaller: "${d.line1}" in plain white, roughly a quarter the size of the word below.
Beneath both, one small light gray line: "${d.subtitle}".

LOWER HALF: the following icons arranged in a loose, uneven arc across the bottom third of the image, varying sizes, generous spacing, none overlapping the text:
${logoLines}

STYLE: bold poster energy, like a movie title card. Premium, confident, minimal.
DO NOT include: borders, panels, grids, human figures, charts, money imagery, screenshots, watermarks, extra text beyond what is specified.`,

      // diagonal split — two color bands cutting across, title straddling the seam
      (d, bg, accent, logoLines) => `Create a premium Fiverr gig thumbnail, 1536x1024 pixels. One unified image, bold diagonal composition.

BACKGROUND: split diagonally (roughly 40/60) from top-left to bottom-right into two bands — one ${bg[1]} (${bg[0]}), the other a slightly darker variant of the same color. The diagonal seam is a clean hard edge, no gradient blur.

STRADDLING THE SEAM, large and centered: the two-line bold title:
Line 1: "${d.line1}" in white
Line 2: "${d.line2}" in ${accent[1]} (${accent[0]}), larger, with a subtle drop shadow so it pops off both bands
Beneath it: one small light gray line: "${d.subtitle}"

ICONS: scattered loosely in the emptier corners away from the title, each clear and recognizable:
${logoLines}

STYLE: dynamic, energetic, confident — like a sports/tech launch poster.
DO NOT include: more than one diagonal seam, gradients, human figures, charts, money imagery, clutter of any kind.`,
    ],
    corporate: [
      // title in a rounded badge/pill, slightly tilted, icons only in the four corners
      (d, bg, accent, logoLines) => `Create a premium Fiverr gig thumbnail, 1536x1024 pixels. One unified image, no split panels, no dividers, no feature cards.

BACKGROUND: ${bg[1]} (${bg[0]}) with an extremely subtle diagonal gradient toward a slightly darker shade of the same color — barely visible, still reads as a flat unified background.

CENTER: a rounded rectangular badge/pill shape, tilted about 4 degrees for energy, outlined with a thin ${accent[1]} border, containing the two-line bold title stacked inside it:
Line 1: "${d.line1}" in white
Line 2: "${d.line2}" in ${accent[1]} (${accent[0]}), larger than line 1
Directly beneath the badge, outside it: one small light gray line reading "${d.subtitle}".

FOUR CORNERS ONLY: place one recognizable icon in each corner, large and clear, generous margin from the edges — do not fill the corners with more than one icon each:
${logoLines}

STYLE: confident, modern, slightly dynamic due to the tilt. Premium poster energy, extreme cleanliness elsewhere.
DO NOT include: extra badges, stat lines, charts, human figures, money imagery, screenshots, clutter of any kind.`,

      // left-aligned asymmetric title, icons in a vertical column on the right
      (d, bg, accent, logoLines) => `Create a premium Fiverr gig thumbnail, 1536x1024 pixels. One unified image, editorial poster layout, asymmetric composition — NOT centered.

BACKGROUND: flat ${bg[1]} (${bg[0]}), completely clean, no textures or gradients.

LEFT TWO-THIRDS OF IMAGE: massive bold stacked title, left-aligned, starting near the left edge:
Line 1: "${d.line1}" in white, large
Line 2: "${d.line2}" in ${accent[1]} (${accent[0]}), even larger, bold enough to dominate the left side
Beneath the title, left-aligned, one small light gray line: "${d.subtitle}".

RIGHT ONE-THIRD OF IMAGE: the following icons stacked vertically down the right edge, evenly spaced with generous gaps, each clearly visible and not touching the title text:
${logoLines}

STYLE: modern editorial tech poster, strong asymmetry, lots of negative space around the icon column.
DO NOT include: dividing lines between the two sections, borders, panels, human figures, charts, money imagery, clutter of any kind.`,

      // honeycomb/grid of icons framing a small centered title
      (d, bg, accent, logoLines) => `Create a premium Fiverr gig thumbnail, 1536x1024 pixels. One unified image, structured grid composition.

BACKGROUND: flat ${bg[1]} (${bg[0]}), clean, no textures.

CENTER: a modestly sized two-line title inside a thin ${accent[1]} rounded-rectangle outline (not filled):
Line 1: "${d.line1}" in white
Line 2: "${d.line2}" in ${accent[1]} (${accent[0]})
Beneath it, outside the outline: one small light gray line: "${d.subtitle}"

SURROUNDING THE CENTER: the following icons arranged in a loose, evenly-spaced ring/grid around the outlined title, each in its own generous negative-space cell, none touching each other or the center box:
${logoLines}

STYLE: structured, precise, enterprise-grade — like a technology stack diagram turned into a poster.
DO NOT include: connecting lines between icons, charts, human figures, money imagery, clutter of any kind.`,
    ],
    playful: [
      // bouncy scattered title with tilted word chunks, icons as playful accents
      (d, bg, accent, logoLines) => `Create a premium Fiverr gig thumbnail, 1536x1024 pixels. One unified image, energetic and fun composition.

BACKGROUND: solid ${bg[1]} (${bg[0]}), flat and clean, with a few small soft-glow accent dots in ${accent[1]} scattered subtly in the negative space (never near the text).

CENTER: the two-line title with each line at a slightly different playful tilt (a few degrees, opposite directions):
Line 1: "${d.line1}" in white, tilted slightly one way
Line 2: "${d.line2}" in ${accent[1]} (${accent[0]}), larger, tilted slightly the other way
Beneath, one small light gray line, no tilt: "${d.subtitle}"

ICONS: scattered around the title at varied playful angles and sizes, like stickers, generous spacing, none overlapping the text:
${logoLines}

STYLE: fun, energetic, approachable — confident but not corporate.
DO NOT include: excessive tilt that hurts legibility, human figures, charts, money imagery, clutter of any kind.`,
    ],
    elegant: [
      // slim serif/refined title, generous whitespace, icons minimal and small
      (d, bg, accent, logoLines) => `Create a premium Fiverr gig thumbnail, 1536x1024 pixels. One unified image, refined and minimal composition.

BACKGROUND: flat ${bg[1]} (${bg[0]}), completely clean, generous negative space — at least half the image should be empty space.

CENTER, modestly sized (not filling the frame): an elegant thin-weight or refined serif-style two-line title:
Line 1: "${d.line1}" in a muted dark tone
Line 2: "${d.line2}" in ${accent[1]} (${accent[0]}), slightly larger, understated not shouty
Below, a thin ${accent[1]} horizontal rule, then one small line: "${d.subtitle}"

ICONS: small, few, tastefully placed at the far edges only — quality over quantity, never crowding the composition:
${logoLines}

STYLE: refined, premium, boutique — like a high-end studio's portfolio cover, not a loud sales poster.
DO NOT include: bold ultra-heavy fonts, glows, clutter, human figures, charts, money imagery.`,
    ],
    minimal: [
      // one word, enormous, nothing else
      (d, bg, accent, logoLines) => `Create a premium Fiverr gig thumbnail, 1536x1024 pixels. One unified image, extreme minimalism.

BACKGROUND: flat ${bg[1]} (${bg[0]}), absolutely nothing else on it except the text below.

CENTER: only the single word "${d.line2}" in massive ultra-bold sans-serif, filling most of the image width, color ${accent[1]} (${accent[0]}).
Directly beneath it, small and understated: "${d.line1}" in a muted tone, then one smaller line: "${d.subtitle}"

ICONS (optional, use sparingly — at most 2, small, in opposite corners, only if they add real clarity):
${logoLines}

STYLE: brutally simple, huge confidence in the typography alone, no ornamentation whatsoever.
DO NOT include: glows, gradients, more than 2 icons, patterns, human figures, charts, money imagery, clutter of any kind.`,
    ],
  };
  const TONES = Object.keys(LAYOUTS);

  // Shared step 1: have the LLM design the poster's text/icon content AND
  // pick a tone that fits the niche, then render it into a full
  // image-generation prompt using a layout + palette matching that tone.
  async function craftImagePrompt(kw) {
    const raw = await ask(`Keywords: ${kw}`,
      `Design the text and icon content for a premium Fiverr gig thumbnail poster about: ${kw}.
Return ONLY valid JSON:
{
  "line1": "FIRST BOLD WORD (1-2 words, ALL CAPS, the general category — e.g. PYTHON, WEB DESIGN, VIDEO EDITING)",
  "line2": "SECOND BOLD WORD (1 word, ALL CAPS, the standout highlight — e.g. PRO, EXPERT, BOT, SERVICES — bigger than line1)",
  "subtitle": "3-5 short related keywords separated by a bullet, relevant to this exact gig",
  "logos": ["Name1", "Name2", "Name3", "Name4", "Name5", "Name6"],
  "tone": "one of: bold, corporate, playful, elegant, minimal — whichever best fits how buyers in this niche think and shop"
}
Rules:
- line1 and line2 together form the poster's main title — short, punchy, together read like a service name.
- line2 must be a high-impact power word that maximizes click-through when a buyer scans small search thumbnails — e.g. PRO, EXPERT, MASTER, NINJA, WIZARD, GURU, DONE-FOR-YOU, ON-DEMAND. Pick whichever fits the niche's tone best.
- logos: real, well-known software/tool/platform names strongly associated with this niche (e.g. for a Python gig: Python, Django, Flask, PostgreSQL, Docker, AWS). If the niche has no well-known brand tools, return short generic icon descriptions instead (e.g. "gear icon", "paintbrush icon", "camera icon"). Provide up to 6.
- tone guide: "bold" = tech/trading/automation/high-energy services. "corporate" = business/consulting/professional B2B services. "playful" = social media/entertainment/casual creative services. "elegant" = luxury branding/high-end design/wedding/premium creative services. "minimal" = anything where the service itself is the whole story and needs zero decoration (e.g. pure copywriting, pure code, pure data work).
JSON only, no markdown.`
    );

    let d;
    try { d = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0]); } catch { d = null; }
    if (!d || !d.line1 || !d.line2) throw new Error('Could not build image prompt — try again');
    d.line1 = d.line1.toUpperCase();
    d.line2 = d.line2.toUpperCase();

    const positions = ['top-left area', 'top-right area', 'bottom-left area', 'bottom-right area', 'far left middle', 'far right middle'];
    const logoLines = (d.logos || []).slice(0, 6)
      .map((l, i) => `${positions[i] || 'scattered'}: ${l} logo/icon`)
      .join('\n');

    const tone = TONES.includes(d.tone) ? d.tone : pick(TONES);
    const palettesForTone = PALETTES.filter(p => p[4] === tone);
    const bg = pick(palettesForTone.length ? palettesForTone : PALETTES);
    const accent = [bg[2], bg[3]];
    const buildPrompt = pick(LAYOUTS[tone]);
    const ctrNote = `\n\nOPTIMIZE FOR CLICK-THROUGH: this image will appear tiny in Fiverr search results, competing against dozens of other thumbnails. Maximum contrast between text and background so the title is instantly legible even at thumbnail size. Bold, confident, scroll-stopping — not subtle or muted.`;
    return buildPrompt(d, bg, accent, logoLines) + ctrNote;
  }

  const promptBtn = makeBtn('◆ Generate Image Prompt', async (kw, setStatus) => {
    setStatus('⟳ Writing image prompt…');
    const prompt = await craftImagePrompt(kw);
    try {
      await navigator.clipboard.writeText(prompt);
      setStatus('✓ Copied — paste into any image tool');
    } catch (_) {
      // Clipboard blocked — fall back to showing it in a prompt dialog for manual copy
      window.prompt('Copy this prompt (Cmd/Ctrl+C):', prompt);
    }
    await sleep(1800);
  });

  if (heading) heading.after(promptBtn);
  else anchor.before(promptBtn);
}

// Traverse up from el to find a visible button matching pattern (up to maxLevels ancestors)
function findNearbyBtn(el, pattern, maxLevels = 12) {
  let node = el;
  for (let i = 0; i < maxLevels; i++) {
    node = node.parentElement;
    if (!node) break;
    const found = [...node.querySelectorAll('button, a, span')]
      .find(b => pattern.test(b.textContent.trim()) && isVisible(b));
    if (found) return found;
  }
  return null;
}

// ── API interceptor injected into page context ────────────────────────────────
// Overrides fetch/XHR so we capture Fiverr's raw API responses containing
// company and skill lists — no letter-cycling, just one dropdown open per list.

function injectApiInterceptor() {
  if (document.getElementById('fai-interceptor')) return;
  const s = document.createElement('script');
  s.id = 'fai-interceptor';
  s.textContent = `(function(){
    if (window.__faiActive) return;
    window.__faiActive = true;

    function emit(url, text) {
      try {
        const data = JSON.parse(text);
        window.dispatchEvent(new CustomEvent('__faiCapture', { detail: { url, data } }));
      } catch(e) {}
    }

    const oFetch = window.fetch;
    window.fetch = async function(...a) {
      const url = typeof a[0] === 'string' ? a[0] : (a[0]?.url || '');
      const res = await oFetch.apply(this, a);
      res.clone().text().then(t => emit(url, t)).catch(() => {});
      return res;
    };

    const oOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m, url) {
      this.__fUrl = url || '';
      return oOpen.apply(this, arguments);
    };
    const oSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
      this.addEventListener('load', () => emit(this.__fUrl, this.responseText));
      return oSend.apply(this, arguments);
    };
  })();`;
  (document.head || document.documentElement).appendChild(s);
}

// Resolve when any captured API response contains a list matching the predicate
function waitForCapture(predicate, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('__faiCapture', handler);
      resolve(null);
    }, timeoutMs);

    function handler(e) {
      const result = predicate(e.detail.url, e.detail.data);
      if (result) {
        clearTimeout(timer);
        window.removeEventListener('__faiCapture', handler);
        resolve(result);
      }
    }
    window.addEventListener('__faiCapture', handler);
  });
}

// Recursively find all string arrays (≥4 items, items ≤120 chars) in an object
function extractStringArrays(obj, depth = 0) {
  if (depth > 8 || !obj || typeof obj !== 'object') return [];
  if (Array.isArray(obj)) {
    const names = obj
      .map(i => typeof i === 'string' ? i : (i?.name || i?.label || i?.title || i?.value || i?.text || null))
      .filter(s => s && typeof s === 'string' && s.length > 0 && s.length <= 120);
    if (names.length >= 4) return [names];
    return obj.flatMap(i => extractStringArrays(i, depth + 1));
  }
  return Object.values(obj).flatMap(v => extractStringArrays(v, depth + 1));
}

// ── Fetch company list via API interception ───────────────────────────────────

async function fetchCompanies(setStatus) {
  const ONE_DAY = 86400000;
  const cached = await new Promise(r => chrome.storage.local.get(['faiCompanies', 'faiListsDate'], r));
  if (cached.faiCompanies?.length > 0 && Date.now() - (cached.faiListsDate || 0) < ONE_DAY) {
    return cached.faiCompanies;
  }

  injectApiInterceptor();

  setStatus('⟳ Scrolling to Work Experience…');
  let expHeading = [...document.querySelectorAll('h1,h2,h3,h4')]
    .find(el => /work experience/i.test(el.textContent.trim()));

  // Lazy-rendered — scroll down gradually to trigger render
  if (!expHeading) {
    for (let i = 0; i < 20; i++) {
      window.scrollBy(0, 400);
      await sleep(200);
      expHeading = [...document.querySelectorAll('h1,h2,h3,h4')]
        .find(el => /work experience/i.test(el.textContent.trim()));
      if (expHeading) break;
    }
  }
  if (!expHeading) return [];

  expHeading.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(1000);

  setStatus('⟳ Opening work exp modal…');
  const addBtn = findNearbyBtn(expHeading, /add new/i);
  if (!addBtn) return [];
  addBtn.click();

  const titleInput = await waitFor('input[placeholder="Title"]', 7000);
  if (!titleInput) return [];
  await sleep(rand(400, 600));

  // Click company trigger to make Fiverr call its API
  const compTrigger = [...document.querySelectorAll('div, button, span')]
    .find(el => isVisible(el) && /^company name$/i.test(el.textContent.trim()) && el.children.length <= 4);

  let companies = [];

  if (compTrigger) {
    compTrigger.click();
    await sleep(rand(500, 700));

    const ns = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    const compInput = document.activeElement?.tagName === 'INPUT' ? document.activeElement
      : [...document.querySelectorAll('input')].find(inp => isVisible(inp) && inp !== titleInput && inp.type !== 'checkbox');

    if (compInput) {
      // Collect all via interceptor — one letter per request, covers full a-z company database
      const allSet = new Set();
      const accumulate = (e) => {
        extractStringArrays(e.detail.data)
          .filter(a => a.length >= 3 && a.every(s => s.length < 80))
          .forEach(a => a.forEach(s => allSet.add(s)));
      };
      window.addEventListener('__faiCapture', accumulate);

      for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
        ns ? ns.call(compInput, letter) : (compInput.value = letter);
        compInput.dispatchEvent(new Event('input', { bubbles: true }));
        compInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        await sleep(1200);
        // DOM fallback — broad selector
        [...document.querySelectorAll('[role="option"], [role="listbox"] li, [class*="option"], [class*="suggestion"], [class*="autocomplete"] li, [class*="dropdown"] li')]
          .filter(el => isVisible(el) && el.textContent.trim().length > 0 && el.textContent.trim().length < 80
            && !/no more options|no options|no results|loading/i.test(el.textContent.trim()))
          .forEach(el => allSet.add(el.textContent.trim()));
        setStatus(`⟳ Companies: ${allSet.size} found (scanning '${letter}'…)`);
        if (allSet.size >= 500) break;
      }

      window.removeEventListener('__faiCapture', accumulate);
      companies = [...allSet];
    }
  }

  // Close modal without saving
  const cancelBtn = [...document.querySelectorAll('button')]
    .find(el => /^cancel$/i.test(el.textContent.trim()) && isVisible(el));
  if (cancelBtn) cancelBtn.click();
  else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await waitGone('input[placeholder="Title"]', 5000);
  await sleep(rand(300, 500));

  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (companies.length > 0) {
    await new Promise(r => chrome.storage.local.set({ faiCompanies: companies, faiListsDate: Date.now() }, r));
  }
  return companies;
}

// ── Fetch skill list via API interception ─────────────────────────────────────

async function fetchSkills(setStatus) {
  const ONE_DAY = 86400000;
  const cached = await new Promise(r => chrome.storage.local.get(['faiSkills', 'faiSkillsDate'], r));
  if (cached.faiSkills?.length > 0 && Date.now() - (cached.faiSkillsDate || 0) < ONE_DAY) {
    return cached.faiSkills;
  }

  injectApiInterceptor();

  setStatus('⟳ Scrolling to Skills…');
  let skillsHeading = [...document.querySelectorAll('h1,h2,h3,h4')]
    .find(el => /skills and expertise/i.test(el.textContent.trim()));

  if (!skillsHeading) {
    for (let i = 0; i < 30; i++) {
      window.scrollBy(0, 400);
      await sleep(200);
      skillsHeading = [...document.querySelectorAll('h1,h2,h3,h4')]
        .find(el => /skills and expertise/i.test(el.textContent.trim()));
      if (skillsHeading) break;
    }
  }
  if (!skillsHeading) return [];

  skillsHeading.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(800);

  setStatus('⟳ Opening skills modal…');

  const addSkillBtn = findNearbyBtn(skillsHeading, /add new/i);
  if (!addSkillBtn) return [];
  addSkillBtn.click();

  const SKILL_INPUT_SEL = 'input[placeholder*="JavaScript" i], input[placeholder*="skill" i], input[placeholder*="expertise" i]';
  const skillInput = await waitFor(SKILL_INPUT_SEL, 7000);
  if (!skillInput) return [];
  await sleep(rand(300, 500));

  setStatus('⟳ Triggering skill API…');
  const ns = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  // Race API capture with a broad trigger term
  const allSkills = new Set();

  // One term per major Fiverr category — covers ALL fields, not just one niche
  const CATEGORY_TRIGGERS = [
    // Graphics & Design
    'logo','illustration','photoshop','figma','ui','3d','branding','banner',
    // Digital Marketing
    'seo','social','email','ads','ppc','tiktok','instagram','youtube',
    // Writing & Translation
    'content','copywriting','translation','proofreading','blog','article',
    // Video & Animation
    'video','animation','editing','motion','explainer',
    // Music & Audio
    'music','voiceover','podcast','mixing','audio',
    // Programming & Tech
    'python','javascript','php','java','node','react','wordpress','shopify',
    'android','ios','flutter','blockchain','chatbot','automation','api','sql',
    // Business
    'virtual assistant','data entry','excel','accounting','research','typing',
    // AI
    'ai','machine learning','deep learning',
    // Lifestyle & Other
    'coaching','fitness','cooking',
  ];

  const accumulate = (e) => {
    extractStringArrays(e.detail.data)
      .filter(a => a.length >= 3 && a.every(s => s.length < 100))
      .forEach(a => a.forEach(s => allSkills.add(s)));
  };
  window.addEventListener('__faiCapture', accumulate);

  for (const term of CATEGORY_TRIGGERS) {
    ns ? ns.call(skillInput, term) : (skillInput.value = term);
    skillInput.dispatchEvent(new Event('input', { bubbles: true }));
    skillInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    await sleep(1100);

    // DOM fallback — broad selector, filter noise
    [...document.querySelectorAll('[role="option"], [role="listbox"] li, [class*="option"], [class*="suggestion"], [class*="autocomplete"] li, [class*="dropdown"] li')]
      .filter(el => isVisible(el) && el.textContent.trim().length > 0 && el.textContent.trim().length < 100
        && !/no more options|no options|no results|loading/i.test(el.textContent.trim()))
      .forEach(el => allSkills.add(el.textContent.trim()));

    setStatus(`⟳ Skills: ${allSkills.size} found (scanning '${term}'…)`);
    if (allSkills.size >= 1000) break;
  }

  window.removeEventListener('__faiCapture', accumulate);

  // Cancel modal
  const cancelBtn = [...document.querySelectorAll('button')]
    .find(el => /cancel/i.test(el.textContent.trim()) && isVisible(el));
  if (cancelBtn) cancelBtn.click();
  else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await waitGone(SKILL_INPUT_SEL, 5000);
  await sleep(rand(300, 500));

  const skills = [...allSkills];
  if (skills.length > 0) {
    await new Promise(r => chrome.storage.local.set({ faiSkills: skills, faiSkillsDate: Date.now() }, r));
  }
  return skills;
}

// ── Profile: About ────────────────────────────────────────────────────────────

function injectAbout() {
  const heading = [...document.querySelectorAll('h1,h2,h3,h4')]
    .find(el => /^about$/i.test(el.textContent.trim()));
  if (!heading || heading.dataset.faiDone) return;

  // Walk up ancestors to find the section containing a textarea
  let textarea = null;
  let node = heading.parentElement;
  for (let i = 0; i < 8 && node; i++) {
    textarea = node.querySelector('textarea');
    if (textarea) break;
    node = node.parentElement;
  }
  if (!textarea) return;

  heading.dataset.faiDone = '1';
  const btn = makeBtn('◆ Generate About', async (kw, setStatus) => {
    setStatus('⟳ Generating bio…');
    const p = await getProfile();
    const ctx = [p.faiName && `Name: ${p.faiName}`, p.faiYears && `${p.faiYears} years experience`, p.faiCountry && `Based in ${p.faiCountry}`].filter(Boolean).join(', ');
    const text = await ask(`Niche: ${kw}`,
      `Write a professional Fiverr seller "About" bio for a freelancer in: ${kw}.${ctx ? '\nFreelancer details: ' + ctx + '.' : ''}
3-4 sentences. Mention experience, core skills from the niche, and what makes them stand out.
End with a short CTA like "Message me to get started."
Max 500 characters. Plain text only — no markdown, no bullet points, no line breaks.${HUMAN_VOICE}`
    );
    setStatus('⟳ Typing…');
    await humanType(textarea, text.trim().slice(0, 500));
  });
  heading.after(btn);
}

// ── Profile: Work Experience ──────────────────────────────────────────────────

function injectWorkExp() {
  const heading = [...document.querySelectorAll('h1,h2,h3,h4')]
    .find(el => /work experience/i.test(el.textContent.trim()));
  if (!heading || heading.dataset.faiWorkDone) return;
  heading.dataset.faiWorkDone = '1';

  const btn = makeBtn('◆ Generate Work Experience', async (kw, setStatus) => {
    setStatus('⟳ Loading company list…');
    const stored = await new Promise(r => chrome.storage.local.get(['faiCompanies'], r));
    const companyList = stored.faiCompanies?.length > 0
      ? stored.faiCompanies
      : ['LinkedIn', 'Upwork', 'Fiverr', 'TradingView', 'Freelancer'];
    // Shuffle so AI gets a varied ordering each call — prevents always picking the first company
    const shuffled = [...companyList].sort(() => Math.random() - 0.5);
    const companyStr = shuffled.slice(0, 60).join(', ');

    setStatus('⟳ Generating entry…');
    const p = await getProfile();
    const ctx = [p.faiName && `Name: ${p.faiName}`, p.faiYears && `${p.faiYears} years experience`, p.faiCountry && `Based in ${p.faiCountry}`].filter(Boolean).join(', ');
    const raw = await ask(`Niche: ${kw}`,
      `Create one realistic freelance work experience entry for a freelancer specialising in: ${kw}.${ctx ? '\nFreelancer: ' + ctx + '.' : ''}
Niche: ${kw}
Return ONLY valid JSON:
{
  "title": "Job title relevant to the niche",
  "company": "Pick ONE company from this list that fits best as the platform or employer — do NOT default to the first item, pick whichever suits the niche: ${companyStr}",
  "currentlyWorking": true,
  "description": "3-4 sentences describing what you built, the technologies/tools used, the problems solved, and the outcomes. 400-550 chars. No markdown. Do NOT mention ratings, star ratings, prices, earnings, client counts, percentages, or platform metrics."
}${HUMAN_VOICE}
JSON only.`
    );
    let exp;
    try { exp = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0]); }
    catch { throw new Error('Parse failed — try again'); }

    // Ensure company is actually in the fetched list
    const match = companyList.find(c => c.toLowerCase() === exp.company?.toLowerCase())
      || companyList.find(c => exp.company?.toLowerCase().includes(c.toLowerCase()))
      || companyList[0];
    exp.company = match;

    setStatus('⟳ Opening modal…');
    const addBtn = findNearbyBtn(heading, /add new/i);
    if (!addBtn) throw new Error('"Add new" not found');
    addBtn.click();

    setStatus('⟳ Waiting for modal…');
    const titleInput = await waitFor('input[placeholder="Title"]', 7000);
    if (!titleInput) throw new Error('Modal did not open — try again');
    await sleep(rand(400, 600));

    setStatus('⟳ Filling title…');
    await humanType(titleInput, exp.title);
    await humanDelay();

    // Employment type → click dropdown, pick "Freelance"
    setStatus('⟳ Selecting employment type…');
    const empTrigger = [...document.querySelectorAll('div, button, span')]
      .find(el => isVisible(el) && /^employment type/i.test(el.textContent.trim()) && el.textContent.trim().length < 60);
    if (empTrigger) {
      empTrigger.click();
      await sleep(rand(400, 600));
      const freelanceOpt = [...document.querySelectorAll('li, [role="option"], div')]
        .find(el => isVisible(el) && /^freelance$/i.test(el.textContent.trim()));
      if (freelanceOpt) { freelanceOpt.click(); await sleep(rand(300, 500)); }
    }

    // Company name
    setStatus('⟳ Selecting company…');

    // Snapshot existing inputs BEFORE opening the dropdown so we can detect the new search input
    const inputsBefore = new Set([...document.querySelectorAll('input')]);

    // Find the company trigger: match by aria-label/placeholder/textContent, then pick the
    // SHORTEST textContent match (most specific element, not its outer wrapper)
    const compCandidates = [...document.querySelectorAll(
      '[role="combobox"], [role="button"], button, div[tabindex="0"], div[tabindex], span[tabindex], input, div, span'
    )].filter(el => {
      if (!isVisible(el)) return false;
      const text = (el.textContent || '').trim();
      const label = el.getAttribute('aria-label') || '';
      const ph = el.getAttribute('placeholder') || '';
      return /company.?name/i.test(text + ' ' + label + ' ' + ph) && text.length < 60;
    });
    const compTrigger = compCandidates.length
      ? compCandidates.reduce((best, el) =>
          el.textContent.trim().length < best.textContent.trim().length ? el : best)
      : null;

    if (compTrigger) {
      compTrigger.focus();
      compTrigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      compTrigger.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true, view: window }));
      compTrigger.click();
      await sleep(rand(900, 1300));

      // Find a NEW input that appeared after the dropdown opened
      const compInput = [...document.querySelectorAll('input')]
        .find(inp => !inputsBefore.has(inp) && isVisible(inp))
        || (document.activeElement?.tagName === 'INPUT' ? document.activeElement : null)
        || [...document.querySelectorAll('input')]
            .find(inp => isVisible(inp) && inp !== titleInput && inp.type !== 'checkbox');

      if (compInput) {
        const ns = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        compInput.focus();
        ns ? ns.call(compInput, '') : (compInput.value = '');
        compInput.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(80);

        let cur = '';
        for (const ch of exp.company) {
          compInput.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));
          cur += ch;
          ns ? ns.call(compInput, cur) : (compInput.value = cur);
          compInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          compInput.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ch, bubbles: true }));
          compInput.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
          await sleep(rand(50, 90));
        }
        await sleep(rand(1200, 1600));

        const anchorRect = compInput.getBoundingClientRect();
        const safeCompany = exp.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const compRe = new RegExp(safeCompany, 'i');

        // Collect all candidates, then pick the DEEPEST one (no other match is a descendant of it)
        const compCands = [...document.querySelectorAll('p, li, [role="option"], div, span')]
          .filter(el => {
            if (!isVisible(el)) return false;
            const r = el.getBoundingClientRect();
            if (r.width < 20 || r.height < 8) return false;
            if (r.top < anchorRect.bottom - 10) return false;
            const t = el.textContent.trim();
            return t.length > 0 && t.length < 100 && compRe.test(t);
          });
        const compOpt = compCands.find(el => !compCands.some(o => o !== el && el.contains(o)))
          || compCands[0];

        if (compOpt) {
          compOpt.scrollIntoView({ block: 'nearest' });
          await sleep(80);
          const r = compOpt.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const ev = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
          compOpt.dispatchEvent(new PointerEvent('pointerover', ev));
          compOpt.dispatchEvent(new MouseEvent('mouseover', ev));
          compOpt.dispatchEvent(new PointerEvent('pointerdown', ev));
          compOpt.dispatchEvent(new MouseEvent('mousedown', ev));
          compOpt.dispatchEvent(new PointerEvent('pointerup', ev));
          compOpt.dispatchEvent(new MouseEvent('mouseup', ev));
          compOpt.dispatchEvent(new MouseEvent('click', ev));
          await sleep(rand(600, 900));
          // Do NOT click elsewhere — let Fiverr close the dropdown naturally
        } else {
          // Fallback: ArrowDown + Tab to pick first item and move focus out (no Escape)
          compInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
          await sleep(200);
          compInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
          await sleep(rand(300, 500));
        }
      } else {
        // No search input — dropdown exposes a plain list; pick matching item by position
        const triggerRect = compTrigger.getBoundingClientRect();
        const safeCompany2 = exp.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const compOpt2 = [...document.querySelectorAll('p, li, [role="option"]')]
          .find(el => {
            if (!isVisible(el)) return false;
            const r = el.getBoundingClientRect();
            if (r.top < triggerRect.bottom - 10 || r.width < 20) return false;
            return new RegExp(safeCompany2, 'i').test(el.textContent.trim());
          });
        if (compOpt2) {
          compOpt2.scrollIntoView({ block: 'nearest' });
          await sleep(80);
          const r2 = compOpt2.getBoundingClientRect();
          const cx2 = r2.left + r2.width / 2, cy2 = r2.top + r2.height / 2;
          const ev2 = { bubbles: true, cancelable: true, view: window, clientX: cx2, clientY: cy2 };
          compOpt2.dispatchEvent(new MouseEvent('mousedown', ev2));
          compOpt2.dispatchEvent(new MouseEvent('mouseup', ev2));
          compOpt2.dispatchEvent(new MouseEvent('click', ev2));
          await sleep(rand(600, 900));
        }
      }
    }

    // "I currently work here" checkbox
    setStatus('⟳ Checking currently work here…');
    const cb = [...document.querySelectorAll('input[type="checkbox"]')].find(c => isVisible(c));
    if (cb && !cb.checked) {
      const cbLabel = (cb.id && document.querySelector(`label[for="${cb.id}"]`))
        || cb.closest('label') || cb.parentElement;
      (cbLabel || cb).click();
      await sleep(rand(300, 500));
      // Force React state update if click didn't register
      if (!cb.checked) {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
        nativeSetter?.call(cb, true);
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(rand(200, 300));
      }
    }

    // Start date → click field, navigate calendar back 12 months, pick day 1
    setStatus('⟳ Setting start date…');
    const startDateField = [...document.querySelectorAll('input, button, div')]
      .find(el => isVisible(el) && /^start date$/i.test(el.placeholder || el.textContent?.trim()));
    if (startDateField) {
      startDateField.click();
      await sleep(rand(500, 700));
      // Navigate back 3-5 years (36-60 months) randomly
      const monthsBack = rand(36, 60);
      for (let m = 0; m < monthsBack; m++) {
        const prevArrow = [...document.querySelectorAll('button, div, span')]
          .find(el => isVisible(el) && (/^[<‹←]$/.test(el.textContent.trim()) || /prev|back|before/i.test(el.getAttribute('aria-label') || '')));
        if (!prevArrow) break;
        prevArrow.click();
        await sleep(rand(80, 130));
      }
      await sleep(rand(200, 350));
      // Click the first available day ("1")
      const day1 = [...document.querySelectorAll('button, td, div')]
        .find(el => isVisible(el) && el.textContent.trim() === '1' && !el.disabled);
      if (day1) { day1.click(); await sleep(rand(300, 500)); }
    }

    setStatus('⟳ Filling description…');
    const descEl = [...document.querySelectorAll('textarea')]
      .find(t => isVisible(t) && /job history|achievements/i.test(t.placeholder));
    if (descEl) { await humanType(descEl, exp.description.slice(0, 600)); await humanDelay(); }

    setStatus('⟳ Saving…');
    const saveBtn = [...document.querySelectorAll('button')]
      .find(el => /^add$/i.test(el.textContent.trim()) && isVisible(el));
    if (!saveBtn) throw new Error('"Add" button not found');
    saveBtn.click();
  });
  heading.after(btn);
}

// ── Profile: Skills ───────────────────────────────────────────────────────────

function injectSkills() {
  const heading = [...document.querySelectorAll('h1,h2,h3,h4')]
    .find(el => /skills and expertise/i.test(el.textContent.trim()));
  if (!heading || heading.dataset.faiSkillsDone) return;
  heading.dataset.faiSkillsDone = '1';

  const btn = makeBtn('◆ Add Skills', async (kw, setStatus) => {
    setStatus('⟳ Loading skill list…');
    const stored = await new Promise(r => chrome.storage.local.get(['faiSkills'], r));
    const skillPool = stored.faiSkills?.length > 0 ? stored.faiSkills : [];

    // Pre-filter by keyword words so AI gets relevant options, not alphabetical garbage
    const kwWords = kw.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
    const relevant = skillPool.filter(s => kwWords.some(w => s.toLowerCase().includes(w)));
    const finalPool = relevant.length >= 10 ? relevant : skillPool;
    const skillPoolStr = finalPool.slice(0, 80).join(', ');

    setStatus('⟳ Generating skills…');
    const p = await getProfile();
    const ctx = [p.faiYears && `${p.faiYears} years experience`].filter(Boolean).join(', ');
    const prompt = skillPool.length > 0
      ? `Pick 6 skills for a Fiverr freelancer in: ${kw}${ctx ? ' (' + ctx + ')' : ''}.
Choose ONLY from this exact list (these are the real options in Fiverr's database):
${skillPoolStr}

Return ONLY a JSON array of exactly 6 strings, copied verbatim from the list above:
["...", "...", "...", "...", "...", "..."]
JSON array only.`
      : `List 6 specific Fiverr skill names for a freelancer in: ${kw}.
Short phrases (1-3 words). Return ONLY a JSON array:
["Python automation", "Algorithmic trading", "Trading bot", "Forex trading", "Bot development", "MT4 expert advisor"]
JSON array only.`;

    const skillRaw = await ask(`Niche: ${kw}`, prompt);
    let skillsToAdd = [];
    try { skillsToAdd = JSON.parse(skillRaw.match(/\[[\s\S]*\]/)?.[0]) || []; }
    catch { skillsToAdd = []; }
    skillsToAdd = skillsToAdd.filter(Boolean).slice(0, 6);
    if (!skillsToAdd.length) throw new Error('Could not generate skills — try again');

    const SKILL_INPUT_SEL = 'input[placeholder*="JavaScript" i], input[placeholder*="skill" i], input[placeholder*="expertise" i]';

    for (let i = 0; i < skillsToAdd.length; i++) {
      if (_faiStop) break;
      const skill = skillsToAdd[i];
      setStatus(`⟳ Adding skill ${i + 1}/${skillsToAdd.length}: ${skill}`);

      const addBtn = findNearbyBtn(heading, /add new/i);
      if (!addBtn) throw new Error('"Add new" not found');
      addBtn.click();

      const skillInput = await waitFor(SKILL_INPUT_SEL, 7000);
      if (!skillInput) throw new Error('Skills modal did not open');
      await sleep(rand(300, 500));

      // Type with full React-compatible events
      const ns = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      skillInput.focus();
      ns ? ns.call(skillInput, '') : (skillInput.value = '');
      skillInput.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(60);
      let cur = '';
      for (const ch of skill) {
        skillInput.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));
        cur += ch;
        ns ? ns.call(skillInput, cur) : (skillInput.value = cur);
        skillInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        skillInput.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ch, bubbles: true }));
        skillInput.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
        await sleep(rand(45, 80));
      }
      await sleep(rand(1200, 1500));

      // Options are <p> elements in dropdown below the input
      const inputRect = skillInput.getBoundingClientRect();
      const sl = skill.toLowerCase();
      const opts = [...document.querySelectorAll('p, li, [role="option"]')]
        .filter(el => {
          const r = el.getBoundingClientRect();
          if (r.width < 20 || r.height < 4) return false;
          if (r.top < inputRect.bottom - 10) return false;
          const t = el.textContent.trim();
          return t.length > 0 && t.length < 100;
        });
      const chosen = opts.find(el => el.textContent.trim().toLowerCase() === sl)
        || opts.find(el => el.textContent.trim().toLowerCase().startsWith(sl))
        || opts.find(el => el.textContent.trim().toLowerCase().includes(sl))
        || opts[0];

      if (chosen) {
        chosen.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        chosen.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true, view: window }));
        chosen.click();
        await sleep(rand(400, 600));

        // Experience level — custom dropdown (Beginner / Intermediate / Pro), NOT a <select>
        const levelCandidates = [...document.querySelectorAll('div, button, span, [role="combobox"]')]
          .filter(el => isVisible(el) && /experience.?level/i.test(el.textContent.trim()) && el.textContent.trim().length < 60);
        const levelTrigger = levelCandidates.length
          ? levelCandidates.reduce((b, e) => e.textContent.trim().length < b.textContent.trim().length ? e : b)
          : null;
        if (levelTrigger) {
          levelTrigger.focus();
          levelTrigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
          levelTrigger.click();
          await sleep(rand(400, 600));
          const proOpt = [...document.querySelectorAll('li, [role="option"], p, div')]
            .find(el => isVisible(el) && /^pro$/i.test(el.textContent.trim()));
          if (proOpt) { proOpt.click(); await sleep(rand(300, 500)); }
        }

        const saveBtn = [...document.querySelectorAll('button')]
          .find(el => /^add$/i.test(el.textContent.trim()) && isVisible(el) && !el.disabled);
        if (saveBtn) { saveBtn.click(); await sleep(rand(700, 1000)); }
      } else {
        // No results at all — cancel this skill and move on
        const cancelBtn = [...document.querySelectorAll('button')]
          .find(el => /cancel/i.test(el.textContent.trim()) && isVisible(el));
        if (cancelBtn) cancelBtn.click();
        else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(rand(400, 600));
      }

      await waitGone(SKILL_INPUT_SEL, 5000);
      await sleep(rand(400, 700));
    }
  });
  heading.after(btn);
}

// ── Observe & inject ──────────────────────────────────────────────────────────

function scanAndInject() {
  if (!faiEnabled) return;
  if (GIG_PATTERN.test(location.href)) {
    injectPage1();
    injectPage2();
    injectPage3();
    injectPage4();
    injectPage5();
  }
  if (PROFILE_PATTERN.test(location.href)) {
    injectAbout();
    injectWorkExp();
    injectSkills();
  }
}

let debounce;
new MutationObserver(() => {
  clearTimeout(debounce);
  debounce = setTimeout(scanAndInject, 600);
}).observe(document.body, { childList: true, subtree: true });

setTimeout(scanAndInject, 1000);
