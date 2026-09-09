(() => {
  let watchTimer = null;
  let watchBaseline = '';
  let watchUrl = '';
  let checkpointTimer = null;

  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

  const priceOf = text => {
    const match = clean(text).match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/);
    return match ? Number(match[1].replace(/,/g, '')) : null;
  };

  function parseCount(value) {
    const raw = clean(value).toLowerCase().replace(/,/g, '');
    const match = raw.match(/(\d+(?:\.\d+)?)\s*([km])?/);
    if (!match) return 0;
    const base = Number(match[1]);
    if (match[2] === 'k') return Math.round(base * 1000);
    if (match[2] === 'm') return Math.round(base * 1000000);
    return Math.round(base);
  }

  const reviewOf = text => {
    const match = clean(text).match(/([\d.,]+\s*[km]?)\s*(?:reviews?|ratings?)/i);
    return match ? parseCount(match[1]) : 0;
  };

  const ratingOf = text => {
    const match = clean(text).match(/\b([1-5](?:\.\d)?)\s*(?:stars?|\/5)\b/i);
    return match ? Number(match[1]) : null;
  };

  const fingerprint = () => {
    const main = document.querySelector('main') || document.body;
    const text = clean(main?.innerText || '').slice(0, 20000);
    try {
      return btoa(unescape(encodeURIComponent(text))).slice(0, 160);
    } catch {
      return text.slice(0, 160);
    }
  };

  function toast(message) {
    let el = document.getElementById('bb-tools-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bb-tools-toast';
      Object.assign(el.style, {
        position: 'fixed', right: '18px', bottom: '18px', zIndex: 2147483647,
        background: '#14141f', color: '#e7e7f0', border: '1px solid #7c5cfc',
        borderRadius: '12px', padding: '12px 15px',
        font: '600 13px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
        boxShadow: '0 8px 30px rgba(0,0,0,.35)', maxWidth: '360px'
      });
      document.documentElement.appendChild(el);
    }
    el.textContent = message;
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.display = 'none'; }, 5000);
  }

  function context() {
    const title = clean(document.querySelector('h1')?.innerText || document.title);
    const desc = clean(
      [...document.querySelectorAll('textarea,[contenteditable="true"],p')]
        .map(el => el.innerText || el.value)
        .filter(Boolean)
        .join(' ')
    ).slice(0, 12000);

    // Read the rendered page text once instead of calling innerText on every
    // DOM node, which was unnecessarily expensive on large Fiverr pages.
    const pageText = clean(document.body?.innerText || '');
    const prices = [...pageText.matchAll(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/g)]
      .map(match => Number(match[1].replace(/,/g, '')))
      .filter(Number.isFinite);

    return {
      url: location.href,
      title,
      description: desc,
      price: prices.length ? Math.min(...prices) : null,
      fingerprint: fingerprint()
    };
  }

  function scan() {
    const links = [...document.querySelectorAll('a[href*="/gigs/"]')];
    const seen = new Set();
    const gigs = [];

    for (const link of links) {
      const card = link.closest('article,li') || link.parentElement || link;
      const text = clean(card.innerText || link.innerText);
      if (!text || text.length < 20) continue;

      const title = clean((card.querySelector('h2,h3,h4') || link).innerText).slice(0, 180);
      if (title.length < 8 || seen.has(title)) continue;
      seen.add(title);

      const price = priceOf(text);
      const reviews = reviewOf(text);
      const rating = ratingOf(text);
      let score = 50;
      if (price != null) score += price <= 50 ? 12 : price <= 150 ? 7 : 2;
      if (reviews < 20) score += 18;
      else if (reviews < 100) score += 10;
      else if (reviews < 500) score += 3;
      if (rating) score += Math.round((rating - 3) * 6);
      if (title.length >= 35 && title.length <= 110) score += 7;
      if (/shopify|wordpress|automation|ai|chatbot|seo|video|design|python|app/i.test(title)) score += 5;

      gigs.push({
        title,
        price,
        reviews,
        rating,
        score: Math.max(1, Math.min(100, score)),
        url: link.href
      });

      if (gigs.length >= 40) break;
    }

    return gigs.sort((a, b) => b.score - a.score);
  }

  function keywords() {
    const stop = new Set(
      'the a an and or for with your you i to of in on from this that is are my by as at it be get can will our we do how'.split(' ')
    );
    const counts = new Map();

    for (const title of scan().map(item => item.title)) {
      for (const word of title.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)) {
        if (word.length < 3 || stop.has(word) || /^\d+$/.test(word)) continue;
        counts.set(word, (counts.get(word) || 0) + 1);
      }
    }

    return {
      terms: [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([term, count]) => ({
          term,
          count,
          signal: count >= 5 ? 'strong' : count >= 3 ? 'emerging' : 'niche'
        }))
    };
  }

  function health() {
    const c = context();
    const text = clean(document.body?.innerText || '');
    const hasTitle = c.title.length >= 20 && c.title.length <= 80;
    const hasDescription = c.description.length >= 300;
    const tags = [...document.querySelectorAll('input,button,[role="option"]')]
      .filter(el => /tag/i.test(el.getAttribute('aria-label') || '') || /tag/i.test(el.className || ''));
    const titleScore = hasTitle ? 90 : 45;
    const descScore = hasDescription ? 90 : Math.min(80, Math.round(c.description.length / 4));
    const tagScore = tags.length ? 85 : 55;
    const mediaScore = document.images.length >= 2 ? 90 : 50;
    const clarity = /\$\s?\d/.test(text) ? 80 : 55;

    return {
      score: Math.round((titleScore + descScore + tagScore + mediaScore + clarity) / 5),
      breakdown: [
        { name: 'Title', score: titleScore, note: hasTitle ? 'Clear length and structure' : 'Aim for a specific buyer outcome in a concise title.' },
        { name: 'Description', score: descScore, note: hasDescription ? 'Enough visible copy to evaluate' : 'Add at least 300 characters of useful, specific copy.' },
        { name: 'Tags', score: tagScore, note: tags.length ? 'Tag controls detected' : 'Open the gig editor tag section for a stronger check.' },
        { name: 'Media', score: mediaScore, note: document.images.length >= 2 ? 'Multiple images detected' : 'Consider stronger visual proof and examples.' },
        { name: 'Pricing signal', score: clarity, note: /\$\s?\d/.test(text) ? 'Price visible' : 'Make package positioning easy to understand.' }
      ]
    };
  }

  function fields() {
    return [...document.querySelectorAll('input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]),textarea,select,[contenteditable="true"]')]
      .filter(el => el.offsetParent !== null)
      .map((el, index) => ({
        i: index,
        tag: el.tagName,
        type: el.type || '',
        name: el.name || '',
        id: el.id || '',
        placeholder: el.placeholder || '',
        value: el.value !== undefined ? el.value : el.innerText
      }));
  }

  function fieldKey(item) {
    return [item.id, item.name, item.placeholder, item.tag, item.type]
      .map(value => clean(value).toLowerCase())
      .join('|');
  }

  function applyDraft(draft) {
    let count = 0;
    const els = [...document.querySelectorAll('input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]),textarea,select,[contenteditable="true"]')]
      .filter(el => el.offsetParent !== null);

    const current = els.map((el, index) => ({
      el,
      i: index,
      id: el.id || '',
      name: el.name || '',
      placeholder: el.placeholder || '',
      tag: el.tagName,
      type: el.type || ''
    }));

    for (const item of draft || []) {
      let target = null;
      const key = fieldKey(item);

      if (item.id || item.name || item.placeholder) {
        target = current.find(entry => fieldKey(entry) === key)?.el || null;
      }
      if (!target) {
        target = current[item.i]?.el || null;
      }
      if (!target) continue;

      const val = item.value ?? '';
      if (target.tagName === 'SELECT') {
        target.value = val;
      } else if (target.isContentEditable) {
        target.innerText = val;
      } else {
        const proto = target.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(target, val);
        else target.value = val;
      }

      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      count++;
    }

    return count;
  }

  async function saveDraftSilently() {
    const draft = fields();
    if (!draft.some(item => String(item.value || '').trim())) return;
    await chrome.storage.local.set({
      bbDraft: {
        url: location.href,
        savedAt: Date.now(),
        fields: draft
      }
    });
  }

  function sameDraftPage(savedUrl) {
    try {
      const saved = new URL(savedUrl);
      const current = new URL(location.href);
      return saved.origin === current.origin && saved.pathname === current.pathname;
    } catch {
      return false;
    }
  }

  async function startWatcher() {
    clearInterval(watchTimer);
    watchTimer = null;

    const settings = await chrome.storage.local.get([
      'bbWatcherEnabled', 'bbWatchInterval', 'bbStopOnChange', 'bbWatchUrl'
    ]);

    if (!settings.bbWatcherEnabled || !settings.bbWatchUrl || location.href !== settings.bbWatchUrl) return;

    watchUrl = location.href;
    watchBaseline = fingerprint();
    const every = Math.max(30, Number(settings.bbWatchInterval) || 60) * 1000;

    watchTimer = setInterval(async () => {
      const changed = location.href !== watchUrl || fingerprint() !== watchBaseline;
      if (changed && settings.bbStopOnChange) {
        clearInterval(watchTimer);
        watchTimer = null;
        await chrome.storage.local.set({ bbWatcherEnabled: false });
        toast('Brainbox watcher: Fiverr page changed, watcher stopped.');
        return;
      }
      location.reload();
    }, every);
  }

  startWatcher();

  if (/\/manage_gigs\/|\/sellers\/[^/]+\/edit/.test(location.href)) {
    clearInterval(checkpointTimer);
    checkpointTimer = setInterval(saveDraftSilently, 15000);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && ['bbWatcherEnabled', 'bbWatchInterval', 'bbStopOnChange', 'bbWatchUrl'].some(key => changes[key])) {
      startWatcher();
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const handled = [
      'BB_WATCH_CONFIG', 'BB_SCAN_PAGE', 'BB_KEYWORDS', 'BB_GIG_HEALTH',
      'BB_PAGE_CONTEXT', 'BB_SAVE_DRAFT', 'BB_RESTORE_DRAFT'
    ];
    if (!handled.includes(msg?.type)) return false;

    (async () => {
      try {
        if (msg.type === 'BB_WATCH_CONFIG') {
          await startWatcher();
          return sendResponse({ ok: true });
        }
        if (msg.type === 'BB_SCAN_PAGE') return sendResponse({ gigs: scan() });
        if (msg.type === 'BB_KEYWORDS') return sendResponse(keywords());
        if (msg.type === 'BB_GIG_HEALTH') return sendResponse(health());
        if (msg.type === 'BB_PAGE_CONTEXT') return sendResponse(context());
        if (msg.type === 'BB_SAVE_DRAFT') {
          const draft = fields();
          await chrome.storage.local.set({ bbDraft: { url: location.href, savedAt: Date.now(), fields: draft } });
          return sendResponse({ count: draft.length });
        }
        if (msg.type === 'BB_RESTORE_DRAFT') {
          const stored = await chrome.storage.local.get('bbDraft');
          if (!stored.bbDraft?.fields?.length) throw new Error('No saved draft found.');
          if (!sameDraftPage(stored.bbDraft.url)) {
            throw new Error('Saved draft belongs to a different Fiverr page. Open the original gig editor first.');
          }
          return sendResponse({ count: applyDraft(stored.bbDraft.fields) });
        }
      } catch (error) {
        sendResponse({ error: error?.message || 'Power tool failed.' });
      }
    })();

    return true;
  });
})();