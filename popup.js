// Brainbox Gig AI popup

const $ = id => document.getElementById(id);

function toast(message, error = false) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('err', error);
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ── Tabs ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab, .panel').forEach(el => el.classList.remove('active'));
    tab.classList.add('active');
    $('tab-' + tab.dataset.tab)?.classList.add('active');
  });
});

// ── API key visibility ───────────────────────────────────────────────────
document.querySelectorAll('.eye-btn').forEach(button => {
  button.addEventListener('click', () => {
    const input = $(button.dataset.t);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    button.textContent = input.type === 'password' ? '◉' : '○';
  });
});

// ── Rotating profile examples ───────────────────────────────────────────
const KW_PLACEHOLDERS = [
  'shopify store setup, ecommerce automation, dropshipping',
  'wordpress website, landing page, responsive design',
  'python bot, automation, web scraping, api integration',
  'video editing, youtube shorts, reels, motion graphics',
  'seo articles, blog writing, copywriting, content creation',
  'ai chatbot, discord bot, telegram bot',
  'shopify theme customization, product listing',
  'voiceover, podcast editing, audio cleanup',
  'photoshop editing, photo retouching, background removal',
  'mobile app, react native, flutter, ios android'
];

(() => {
  const input = $('fai-kw');
  if (!input) return;
  let index = 0;
  input.placeholder = KW_PLACEHOLDERS[0];
  setInterval(() => {
    if (!input.value) {
      index = (index + 1) % KW_PLACEHOLDERS.length;
      input.placeholder = KW_PLACEHOLDERS[index];
    }
  }, 2800);
})();

// ── Load saved settings ─────────────────────────────────────────────────
async function loadSettings() {
  const local = await chrome.storage.local.get([
    'faiKeywords', 'faiEnabled', 'faiResearch', 'faiName', 'faiYears', 'faiCountry'
  ]);

  if (local.faiKeywords) $('fai-kw').value = local.faiKeywords;
  if (local.faiName) $('fai-name').value = local.faiName;
  if (local.faiYears) $('fai-years').value = local.faiYears;
  if (local.faiCountry) $('fai-country').value = local.faiCountry;
  $('faiEnabled').checked = local.faiEnabled !== false;
  $('faiResearch').checked = local.faiResearch !== false;

  const sync = await chrome.storage.sync.get([
    'anthropicKeys', 'groqKeys', 'provider', 'model', 'groqModel', 'temperature'
  ]);

  (sync.anthropicKeys || []).slice(0, 2).forEach((key, index) => {
    const input = $(`ck${index + 1}`);
    if (input) input.value = key;
  });

  (sync.groqKeys || []).slice(0, 3).forEach((key, index) => {
    const input = $(`gk${index + 1}`);
    if (input) input.value = key;
  });

  setProvider(sync.provider || 'claude');

  if (sync.model && [...$('claudeModelSelect').options].some(option => option.value === sync.model)) {
    $('claudeModelSelect').value = sync.model;
  }

  const migratedGroq = {
    'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
    'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
    'qwen/qwen3-32b': 'openai/gpt-oss-120b',
    'meta-llama/llama-4-scout-17b-16e-instruct': 'openai/gpt-oss-120b'
  };
  const groqModel = migratedGroq[sync.groqModel] || sync.groqModel;
  if (groqModel && [...$('groqModelSelect').options].some(option => option.value === groqModel)) {
    $('groqModelSelect').value = groqModel;
  }
  if (migratedGroq[sync.groqModel]) {
    await chrome.storage.sync.set({ groqModel });
  }

  if (sync.temperature !== undefined && Number.isFinite(Number(sync.temperature))) {
    const value = Math.max(0, Math.min(1, Number(sync.temperature)));
    $('tempRange').value = Math.round(value * 10);
    $('tempVal').textContent = value.toFixed(1);
  }
}

loadSettings().catch(error => toast('Could not load settings: ' + error.message, true));

// ── Profile ──────────────────────────────────────────────────────────────
$('saveKw').addEventListener('click', async () => {
  const keyword = $('fai-kw').value.trim();
  const name = $('fai-name').value.trim();
  const years = $('fai-years').value.trim();
  const country = $('fai-country').value.trim();

  if (!keyword) {
    toast('Enter at least one keyword', true);
    return;
  }

  const data = { faiKeywords: keyword };
  if (name) data.faiName = name;
  if (years) data.faiYears = years;
  if (country) data.faiCountry = country;

  try {
    await chrome.storage.local.set(data);
    toast('◆ Profile saved');
  } catch (error) {
    toast('Could not save profile: ' + error.message, true);
  }
});

$('faiEnabled').addEventListener('change', event => {
  chrome.storage.local.set({ faiEnabled: event.target.checked }).catch(error => toast(error.message, true));
});

$('faiResearch').addEventListener('change', event => {
  chrome.storage.local.set({ faiResearch: event.target.checked }).catch(error => toast(error.message, true));
});

// ── Provider priority ───────────────────────────────────────────────────
function setProvider(provider) {
  document.querySelectorAll('.pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.provider === provider);
  });
}

document.querySelectorAll('.pill').forEach(pill => {
  pill.addEventListener('click', async () => {
    const provider = pill.dataset.provider;
    setProvider(provider);
    try {
      await chrome.storage.sync.set({ provider });
      toast('◆ Provider order saved');
    } catch (error) {
      toast('Could not save provider order: ' + error.message, true);
    }
  });
});

// ── Provider settings ───────────────────────────────────────────────────
$('saveClaude').addEventListener('click', async () => {
  const keys = ['ck1', 'ck2'].map(id => $(id).value.trim()).filter(Boolean);
  try {
    await chrome.storage.sync.set({
      anthropicKeys: keys,
      model: $('claudeModelSelect').value
    });
    toast(keys.length ? '◆ Claude settings saved' : 'Claude keys cleared');
  } catch (error) {
    toast('Could not save Claude settings: ' + error.message, true);
  }
});

$('saveGroq').addEventListener('click', async () => {
  const keys = ['gk1', 'gk2', 'gk3'].map(id => $(id).value.trim()).filter(Boolean);
  try {
    await chrome.storage.sync.set({
      groqKeys: keys,
      groqModel: $('groqModelSelect').value
    });
    toast(keys.length ? '◆ Groq settings saved' : 'Groq keys cleared');
  } catch (error) {
    toast('Could not save Groq settings: ' + error.message, true);
  }
});

async function testProvider(provider, keyIds, buttonId) {
  const button = $(buttonId);
  const keys = keyIds.map(id => $(id).value.trim()).filter(Boolean);
  const name = provider === 'claude' ? 'Claude' : 'Groq';

  if (!keys.length) {
    toast(`Enter a ${name} key first`, true);
    return;
  }

  const storageKey = provider === 'claude' ? 'anthropicKeys' : 'groqKeys';
  const modelKey = provider === 'claude' ? 'model' : 'groqModel';
  const modelId = provider === 'claude' ? 'claudeModelSelect' : 'groqModelSelect';

  button.disabled = true;
  button.textContent = '…';

  try {
    await chrome.storage.sync.set({
      [storageKey]: keys,
      [modelKey]: $(modelId).value
    });

    // forceProvider prevents a Groq-first setting from making the Claude
    // test accidentally test Groq, and vice versa.
    const response = await chrome.runtime.sendMessage({
      type: 'AI_REQUEST',
      payload: {
        prompt: 'Say "OK" only.',
        systemPrompt: 'Reply with only "OK".',
        forceProvider: provider,
        maxTokens: 64
      }
    });

    if (response?.error) throw new Error(response.error);
    toast(`▸ ${name} connection OK`);
  } catch (error) {
    toast('Error: ' + (error?.message || 'Connection failed'), true);
  } finally {
    button.disabled = false;
    button.textContent = '▸ Test';
  }
}

$('testClaude').addEventListener('click', () => testProvider('claude', ['ck1', 'ck2'], 'testClaude'));
$('testGroq').addEventListener('click', () => testProvider('groq', ['gk1', 'gk2', 'gk3'], 'testGroq'));

// ── Creativity ───────────────────────────────────────────────────────────
$('tempRange').addEventListener('input', event => {
  $('tempVal').textContent = (Number(event.target.value) / 10).toFixed(1);
});

$('saveTemp').addEventListener('click', async () => {
  const temperature = Number($('tempRange').value) / 10;
  try {
    await chrome.storage.sync.set({ temperature });
    toast('◆ Creativity saved');
  } catch (error) {
    toast('Could not save creativity: ' + error.message, true);
  }
});

// ── CV Generator ────────────────────────────────────────────────────────
$('generateCv').addEventListener('click', async () => {
  const button = $('generateCv');
  const status = $('cvStatus');
  const name = $('cv-name').value.trim();
  const title = $('cv-title').value.trim();
  const skills = $('cv-skills').value.trim();
  const years = $('cv-years').value.trim();
  const credentials = $('cv-creds').value.trim();
  const notes = $('cv-notes').value.trim();

  if (!name || !skills) {
    status.textContent = '⚠ Name and core skills are required.';
    return;
  }

  button.disabled = true;
  button.textContent = '⟳ Writing CV…';
  status.textContent = '';

  const prompt = `Write a complete professional freelance CV for ${name}${title ? `, working as a ${title}` : ''}.

Core skills/services: ${skills}
${years ? `Years of experience: ${years}` : 'Years of experience: not specified. Do not invent a number.'}
${credentials ? `Real certifications/education, include only what is supplied: ${credentials}` : 'No certifications/education supplied. Use exactly "Available upon request" for education.'}
${notes ? `Additional real context: ${notes}` : ''}

Return ONLY valid JSON with these exact keys:
{
  "profile": "3-4 sentence professional summary, third person, no first-person I/my",
  "coreServices": ["10-15 short service or skill phrases derived from the supplied skills"],
  "technicalSkills": ["10-15 granular technical skill or tool phrases derived from the supplied skills"],
  "experienceHeading": "short freelance role title",
  "experienceSummary": "one professional third-person paragraph describing work and project types without inventing employers or results",
  "serviceExpertise": [{"category":"category","description":"one sentence"}],
  "strengths": ["10-12 professional strengths"],
  "toolsPlatforms": ["10-15 real tools/platforms relevant to the supplied skills, only if genuinely relevant"],
  "education": "formatted supplied education or Available upon request",
  "languages": "use supplied language details, otherwise English, Professional Working Proficiency.",
  "availability": "use supplied availability details, otherwise Available for freelance, contract, and long term remote projects worldwide."
}

Rules:
- Never invent credentials, institutions, employers, clients, reviews, results, certifications, awards, or experience numbers.
- Keep every tool/platform relevant to the actual supplied skills.
- JSON only, no markdown or commentary.`;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AI_REQUEST',
      payload: {
        prompt,
        systemPrompt: 'You write accurate, polished freelance CVs without fabricating facts.',
        temperature: 0.8,
        maxTokens: 4096
      }
    });

    if (response?.error) throw new Error(response.error);

    const match = String(response?.result || '').match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Could not parse the generated CV. Try again.');

    let cv;
    try {
      cv = JSON.parse(match[0]);
    } catch {
      throw new Error('Generated CV was not valid JSON. Try again.');
    }

    if (!cv?.profile || !Array.isArray(cv.coreServices)) {
      throw new Error('Incomplete CV data. Try again.');
    }

    await chrome.storage.local.set({
      faiCvData: {
        name,
        title,
        ...cv,
        generatedAt: Date.now()
      }
    });

    await chrome.tabs.create({ url: chrome.runtime.getURL('cv.html') });
    status.textContent = '✓ CV opened in a new tab.';
  } catch (error) {
    status.textContent = '⚠ ' + (error?.message || 'CV generation failed.');
  } finally {
    button.disabled = false;
    button.textContent = '◆ Generate CV';
  }
});