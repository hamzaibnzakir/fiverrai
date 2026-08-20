// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab, .panel').forEach(el => el.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// Toast
function toast(msg, err = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('err', err);
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

// Eye toggle (works for every key field, keyed by data-t -> input id)
document.querySelectorAll('.eye-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const inp = document.getElementById(btn.dataset.t);
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btn.textContent = inp.type === 'password' ? '◉' : '○';
  });
});

// Rotating placeholder examples across different gig categories
const KW_PLACEHOLDERS = [
  "shopify store setup, ecommerce automation, dropshipping",
  "wordpress website, landing page, responsive design",
  "python bot, automation, web scraping, api integration",
  "video editing, youtube shorts, reels, motion graphics",
  "seo articles, blog writing, copywriting, content creation",
  "ai chatbot, discord bot, telegram bot",
  "shopify theme customization, product listing",
  "voiceover, podcast editing, audio cleanup",
  "photoshop editing, photo retouching, background removal",
  "mobile app, react native, flutter, ios android",
];
(function rotatePlaceholder() {
  const ta = document.getElementById('fai-kw');
  if (ta.value) return;
  let i = 0;
  ta.placeholder = KW_PLACEHOLDERS[0];
  setInterval(() => {
    if (ta.value) return;
    i = (i + 1) % KW_PLACEHOLDERS.length;
    ta.placeholder = KW_PLACEHOLDERS[i];
  }, 2800);
})();

// ── Load saved values ───────────────────────────────────────────────────

chrome.storage.local.get(['faiKeywords', 'faiEnabled', 'faiResearch', 'faiName', 'faiYears', 'faiCountry'], (d) => {
  if (d.faiKeywords) document.getElementById('fai-kw').value = d.faiKeywords;
  if (d.faiName)    document.getElementById('fai-name').value = d.faiName;
  if (d.faiYears)   document.getElementById('fai-years').value = d.faiYears;
  if (d.faiCountry) document.getElementById('fai-country').value = d.faiCountry;
  document.getElementById('faiEnabled').checked = d.faiEnabled !== false;
  document.getElementById('faiResearch').checked = d.faiResearch !== false;
});

chrome.storage.sync.get([
  'anthropicKeys', 'groqKeys',
  'provider', 'model', 'groqModel', 'temperature'
], (s) => {
  const ck = s.anthropicKeys || [];
  ['ck1', 'ck2'].forEach((id, i) => { if (ck[i]) document.getElementById(id).value = ck[i]; });

  const gk = s.groqKeys || [];
  ['gk1', 'gk2', 'gk3'].forEach((id, i) => { if (gk[i]) document.getElementById(id).value = gk[i]; });

  setProvider(s.provider || 'claude');
  if (s.model) document.getElementById('claudeModelSelect').value = s.model;
  if (s.groqModel) {
    const deprecated = { 'llama-3.3-70b-versatile': 'openai/gpt-oss-120b', 'llama-3.1-8b-instant': 'openai/gpt-oss-20b', 'qwen/qwen3-32b': 'openai/gpt-oss-120b', 'meta-llama/llama-4-scout-17b-16e-instruct': 'openai/gpt-oss-120b' };
    const model = deprecated[s.groqModel] || s.groqModel;
    document.getElementById('groqModelSelect').value = model;
    if (deprecated[s.groqModel]) chrome.storage.sync.set({ groqModel: model }); // persist the fix so it sticks
  }

  if (s.temperature !== undefined) {
    const t = Math.round(s.temperature * 10);
    document.getElementById('tempRange').value = t;
    document.getElementById('tempVal').textContent = s.temperature.toFixed(1);
  }
});

// ── Profile / keywords ──────────────────────────────────────────────────

document.getElementById('saveKw').addEventListener('click', () => {
  const kw      = document.getElementById('fai-kw').value.trim();
  const name    = document.getElementById('fai-name').value.trim();
  const years   = document.getElementById('fai-years').value.trim();
  const country = document.getElementById('fai-country').value.trim();
  if (!kw) { toast('Enter at least one keyword', true); return; }
  const data = { faiKeywords: kw };
  if (name)    data.faiName    = name;
  if (years)   data.faiYears   = years;
  if (country) data.faiCountry = country;
  chrome.storage.local.set(data, () => toast('◆ Profile saved'));
});

document.getElementById('faiEnabled').addEventListener('change', function () {
  chrome.storage.local.set({ faiEnabled: this.checked });
});

document.getElementById('faiResearch').addEventListener('change', function () {
  chrome.storage.local.set({ faiResearch: this.checked });
});

// ── Provider priority pills ─────────────────────────────────────────────

function setProvider(p) {
  document.querySelectorAll('.pill').forEach(el => el.classList.toggle('active', el.dataset.provider === p));
}
document.querySelectorAll('.pill').forEach(el => {
  el.addEventListener('click', () => {
    setProvider(el.dataset.provider);
    chrome.storage.sync.set({ provider: el.dataset.provider }, () => toast('◆ Provider order saved'));
  });
});

// ── Claude keys ──────────────────────────────────────────────────────────

document.getElementById('saveClaude').addEventListener('click', () => {
  const keys = ['ck1', 'ck2'].map(id => document.getElementById(id).value.trim()).filter(Boolean);
  const model = document.getElementById('claudeModelSelect').value;
  chrome.storage.sync.set({ anthropicKeys: keys, model }, () => {
    if (!keys.length) toast('Claude keys cleared'); else toast('◆ Claude settings saved');
  });
});

document.getElementById('testClaude').addEventListener('click', async () => {
  const keys = ['ck1', 'ck2'].map(id => document.getElementById(id).value.trim()).filter(Boolean);
  if (!keys.length) { toast('Enter a Claude key first', true); return; }
  await chrome.storage.sync.set({ anthropicKeys: keys });
  const btn = document.getElementById('testClaude');
  btn.textContent = '…'; btn.disabled = true;
  const res = await chrome.runtime.sendMessage({
    type: 'AI_REQUEST',
    payload: { prompt: 'Say "OK" only.', systemPrompt: 'Reply with only "OK".' }
  });
  btn.textContent = '▸ Test'; btn.disabled = false;
  if (res.error) toast('Error: ' + res.error, true);
  else toast('▸ Connection OK');
});

// ── Groq keys ────────────────────────────────────────────────────────────

document.getElementById('saveGroq').addEventListener('click', () => {
  const keys = ['gk1', 'gk2', 'gk3'].map(id => document.getElementById(id).value.trim()).filter(Boolean);
  const groqModel = document.getElementById('groqModelSelect').value;
  chrome.storage.sync.set({ groqKeys: keys, groqModel }, () => {
    if (!keys.length) toast('Groq keys cleared'); else toast('◆ Groq settings saved');
  });
});

document.getElementById('testGroq').addEventListener('click', async () => {
  const keys = ['gk1', 'gk2', 'gk3'].map(id => document.getElementById(id).value.trim()).filter(Boolean);
  if (!keys.length) { toast('Enter a Groq key first', true); return; }
  await chrome.storage.sync.set({ groqKeys: keys });
  const prevProvider = await new Promise(r => chrome.storage.sync.get('provider', d => r(d.provider)));
  await chrome.storage.sync.set({ provider: 'groq' });
  const btn = document.getElementById('testGroq');
  btn.textContent = '…'; btn.disabled = true;
  const res = await chrome.runtime.sendMessage({
    type: 'AI_REQUEST',
    payload: { prompt: 'Say "OK" only.', systemPrompt: 'Reply with only "OK".' }
  });
  await chrome.storage.sync.set({ provider: prevProvider || 'claude' });
  btn.textContent = '▸ Test'; btn.disabled = false;
  if (res.error) toast('Error: ' + res.error, true);
  else toast('▸ Connection OK');
});

// ── Temperature ──────────────────────────────────────────────────────────

document.getElementById('tempRange').addEventListener('input', function () {
  document.getElementById('tempVal').textContent = (this.value / 10).toFixed(1);
});
document.getElementById('saveTemp').addEventListener('click', () => {
  const temperature = parseFloat(document.getElementById('tempRange').value) / 10;
  chrome.storage.sync.set({ temperature }, () => toast('◆ Temperature saved'));
});

// ── CV Generator ─────────────────────────────────────────────────────────
// Writes a full structured CV via the same AI_REQUEST pipeline everything
// else in this extension uses, then hands the data off to cv.html (a
// bundled extension page opened in a new tab) to render and print-to-PDF.
// No PDF library, no new network host -- just the browser's own native
// print dialog, which produces a real PDF identically in Chrome and Firefox.

document.getElementById('generateCv').addEventListener('click', async () => {
  const btn = document.getElementById('generateCv');
  const statusEl = document.getElementById('cvStatus');

  const name = document.getElementById('cv-name').value.trim();
  const title = document.getElementById('cv-title').value.trim();
  const skills = document.getElementById('cv-skills').value.trim();
  const years = document.getElementById('cv-years').value.trim();
  const creds = document.getElementById('cv-creds').value.trim();
  const notes = document.getElementById('cv-notes').value.trim();

  if (!name || !skills) {
    statusEl.textContent = '⚠ Name and core skills are required.';
    return;
  }

  btn.disabled = true;
  btn.textContent = '⟳ Writing CV…';
  statusEl.textContent = '';

  try {
    const prompt = `Write a complete, professional freelance CV for: ${name}${title ? `, working as a ${title}` : ''}.
Core skills/services they offer: ${skills}
${years ? `Years of experience: ${years}` : 'Years of experience: not specified — write generally without inventing a specific number.'}
${creds ? `Real certifications/education to include, verbatim, do not embellish beyond what's given: ${creds}` : 'No certifications/education were provided — use exactly the string "Available upon request" for the education field, do not invent any credential, course, or certification.'}
${notes ? `Additional context to weave in naturally where relevant: ${notes}` : ''}

Return ONLY valid JSON with these exact keys:
{
  "profile": "3-4 sentence professional summary paragraph — versatile, capable, adaptable tone, written in third person, no first-person 'I'",
  "coreServices": ["...", "...", "... 10-15 short service/skill phrases, comma-list style, matching the specific skills given"],
  "technicalSkills": ["...", "...", "... 10-15 short specific skill/tool phrases distinct from coreServices — more granular/technical"],
  "experienceHeading": "A short freelance role title, e.g. 'Freelance ${title || 'Specialist'}'",
  "experienceSummary": "1 paragraph describing the general nature of their work, project types, and working style — professional, third person",
  "serviceExpertise": [
    { "category": "Short category name", "description": "1 sentence listing specific things covered in this category" },
    { "category": "...", "description": "..." },
    { "category": "...", "description": "..." }
  ],
  "strengths": ["...", "... 10-12 short professional strength words/phrases, e.g. Attention to Detail, Reliability, Adaptability"],
  "toolsPlatforms": ["...", "... 10-15 real tools/platforms relevant to the skills given"],
  "education": "${creds ? 'formatted from what was given' : 'Available upon request'}",
  "languages": "${notes.toLowerCase().includes('language') ? 'drawn from the notes given' : 'English, Professional Working Proficiency.'}",
  "availability": "${notes.toLowerCase().includes('availab') ? 'drawn from the notes given' : 'Available for freelance, contract, and long term remote projects worldwide.'}"
}

WRITING STYLE:
- Confident, professional, third-person throughout — no "I" or "my."
- Concrete and specific over vague and impressive — real skill/tool names beat generic adjectives like "professional" or "amazing."
- serviceExpertise categories should be genuinely derived from the skills given, not generic filler categories.
- Never fabricate a specific credential, certification, institution, or number that wasn't provided.
- JSON only, no markdown, no commentary.`;

    const res = await chrome.runtime.sendMessage({
      type: 'AI_REQUEST',
      payload: { prompt, systemPrompt: 'You write polished, professional freelance CVs.', temperature: 0.8 }
    });
    if (res.error) throw new Error(res.error);

    let cv;
    try { cv = JSON.parse(res.result.match(/\{[\s\S]*\}/)?.[0]); }
    catch { throw new Error('Could not parse the generated CV — try again'); }
    if (!cv?.profile || !Array.isArray(cv.coreServices)) throw new Error('Incomplete CV data — try again');

    await chrome.storage.local.set({
      faiCvData: { name, title, ...cv, generatedAt: Date.now() }
    });

    chrome.tabs.create({ url: chrome.runtime.getURL('cv.html') });
    statusEl.textContent = '✓ CV opened in a new tab.';
  } catch (e) {
    statusEl.textContent = '⚠ ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '◆ Generate CV';
  }
});
