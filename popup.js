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

chrome.storage.local.get(['faiKeywords', 'faiEnabled', 'faiName', 'faiYears', 'faiCountry'], (d) => {
  if (d.faiKeywords) document.getElementById('fai-kw').value = d.faiKeywords;
  if (d.faiName)    document.getElementById('fai-name').value = d.faiName;
  if (d.faiYears)   document.getElementById('fai-years').value = d.faiYears;
  if (d.faiCountry) document.getElementById('fai-country').value = d.faiCountry;
  document.getElementById('faiEnabled').checked = d.faiEnabled !== false;
});

chrome.storage.sync.get([
  'anthropicKeys', 'groqKeys', 'openaiKeys',
  'provider', 'model', 'groqModel', 'imageModel', 'temperature'
], (s) => {
  const ck = s.anthropicKeys || [];
  ['ck1', 'ck2'].forEach((id, i) => { if (ck[i]) document.getElementById(id).value = ck[i]; });

  const gk = s.groqKeys || [];
  ['gk1', 'gk2', 'gk3'].forEach((id, i) => { if (gk[i]) document.getElementById(id).value = gk[i]; });

  const ok = s.openaiKeys || [];
  if (ok[0]) document.getElementById('ok1').value = ok[0];

  setProvider(s.provider || 'claude');
  if (s.model) document.getElementById('claudeModelSelect').value = s.model;
  if (s.groqModel) document.getElementById('groqModelSelect').value = s.groqModel;
  if (s.imageModel) document.getElementById('imageModelSelect').value = s.imageModel;

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

// ── Image (OpenAI) key ───────────────────────────────────────────────────

document.getElementById('saveImage').addEventListener('click', () => {
  const key = document.getElementById('ok1').value.trim();
  const imageModel = document.getElementById('imageModelSelect').value;
  chrome.storage.sync.set({ openaiKeys: key ? [key] : [], imageModel }, () => {
    if (!key) toast('Image key cleared'); else toast('◆ Image settings saved');
  });
});
