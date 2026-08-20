# Brainbox Gig AI

A browser extension — **works in both Chrome and Firefox from the same build** — owned and operated by **Brainbox Ecom Lab**, that fills out your Fiverr gig pages and seller profile using **Claude** (Anthropic) or free **Groq** models with human-like typing — grounded in **live Fiverr market research** instead of guesswork.

Originally forked from an open-source Groq-only autofill tool and substantially rebuilt: multi-provider AI backend, more human-sounding output, live pricing/ranking research, and a text-only (no third-party image API) thumbnail-prompt workflow.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)
![Firefox Add-on](https://img.shields.io/badge/Firefox-Add--on-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green?style=for-the-badge)
![Claude](https://img.shields.io/badge/Claude-Sonnet%205-D97757?style=for-the-badge)
![Groq](https://img.shields.io/badge/Groq-Free%20Tier-orange?style=for-the-badge)

---

## Is this safe for my Fiverr account?

Confirmed by Brainbox Ecom Lab, plainly:

- **It only fills in gig/profile fields on pages you're already viewing** — title, tags, description, packages, FAQs, bio. It types into the same fields you'd type into yourself, under your own logged-in session. It never navigates anywhere, never submits/publishes anything on its own, and never touches orders, messages, payments, or account settings — you always review and click Save/Publish yourself.
- **There is no Brainbox-owned server.** This extension has no backend of its own — nothing "phones home" to Brainbox or anyone else. Check `manifest.json` yourself: the only hosts it's allowed to talk to are `fiverr.com` (to fill in fields and pull live market data, same-origin, under your session) and the two AI providers you personally configure with your own API keys (`api.anthropic.com` / `api.groq.com`, wherever the actual writing gets generated). That's it — no analytics, no telemetry, no third-party logging service, anywhere in the code.
- **Your API keys stay on your machine** — stored only in your browser's own `chrome.storage`, never sent anywhere except directly to Anthropic/Groq to generate text.
- The one Fiverr-side action beyond field-filling is the live market research step, which is a single same-origin fetch to Fiverr's own search results for your niche — functionally identical to you typing a search and hitting enter once. Nothing is scraped in bulk, nothing runs in a loop.

See [Security / No API Leaks](#security--no-api-leaks) further down for the full technical breakdown.

---

## What's new in this build

| Feature | Before | Now |
|---|---|---|
| AI backend | Groq only | **Claude (primary)** with automatic fallback to **Groq (free)** — set your preferred order in the popup |
| Writing quality | Templated, AI-sounding | **Human-voice prompts** (bans AI clichés, varies rhythm) + realistic typing simulation |
| **Pricing & keywords** | **Guessed by the LLM** — same rough price bands and made-up "trending" tags for every gig | **Live Market Research** — before generating, the extension pulls Fiverr's own current search results for your niche (real prices, real ranking titles, real recurring tags) and grounds title/tags/packages/description in that data. Runs automatically, shows a live status ("⟳ Researching market… → Found 14 ranking gigs…"), caches per niche for 30 min, manual 🔄 refresh available |
| Gig description | Seller-bio-first, no length budget, no TOS guardrails | Rewritten around researched best practice: buyer-problem-first hook (never opens with "I"), keyword placed naturally early, tightened to ~900-1050 chars (safely under Fiverr's 1,200 hard cap), explicit bans on off-platform contact info, fake guarantees, emojis/caps-spam |
| Gig images | Rendered via the OpenAI Images API and auto-uploaded | **OpenAI removed entirely.** `◆ Generate Image Prompt` writes a click-optimized thumbnail prompt (now tone-aware: bold/corporate/playful/elegant/minimal, 12 palettes) and copies it to your clipboard to paste into whatever image tool you like |
| Ownership/branding | Third-party author | Brainbox Ecom Lab |

Everything else — the gig editor autofill, profile/bio/work-experience/skills automation, human-like typing, the per-gig niche bar — is carried over unchanged.

### Fixed: `` `temperature` is deprecated for this `` (400 error on every Claude call)

As of Claude Opus 4.7+/4.8 and Claude Sonnet 5, Anthropic's Messages API hard-rejects any request that sets a non-default `temperature`, `top_p`, or `top_k`. Fixed in `background.js`:

- Claude requests never send `temperature`/`top_p`/`top_k` anymore, on any model.
- The popup's Creativity slider still works — it's translated into a plain-English instruction appended to the prompt instead of a raw param, so the *intent* survives without tripping the 400.
- Groq is unaffected and still receives `temperature` normally.

---

## Features

### Gig Editor
- **AI Title** — Compelling "I will..." titles under 60 characters, informed by live ranking title patterns
- **Auto Tags** — 5 relevant gig search tags, cross-checked against terms that actually repeat in top-ranking results right now
- **3-Tier Packages** — Basic / Standard / Premium with unique names, Fiverr-style descriptions, and prices grounded in the real live median for your niche (falls back to model judgment if no live data is found)
- **Formatted Description** — Buyer-first hook, service overview, "I can develop" bullets, "Why choose me?" bullets, closing, CTA — tightened to fit safely under Fiverr's 1,200-char cap, with explicit TOS-safety rules baked into the prompt
- **5 FAQs** — Buyer-voiced questions with personal, specific, first-person answers, same TOS-safety rules as the description
- **Buyer Requirements** — Auto-fills and marks required
- **Gig Thumbnail Prompt** — writes a tone-matched, click-optimized poster prompt (12 palettes × 5 style families) and copies it to your clipboard — paste into any image generator you prefer
- **Per-Gig Niche Input** — a niche bar is injected on each gig page, with a 🔄 button to force-refresh live market data

### Seller Profile
- **Bio / About**, **Work Experience**, **Skills** — personalized with your name, years, and country

### CV / Resume Generator (popup → CV tab)
- Give it a name, role, core skills, years of experience, and (optionally) real certifications/education — it writes a complete, professionally structured CV: profile summary, core services, skills, experience, service-expertise breakdown, strengths, tools/platforms, education, languages, availability
- Opens in a new tab, ready to **Save as PDF** via the browser's own native print dialog — no bundled PDF library, no new network calls, works identically in Chrome and Firefox
- Won't invent certifications, institutions, or credentials you don't provide — leaves "Available upon request" (matching standard practice) if you leave that field blank

### General
- **Live Market Research** — one same-origin fetch to Fiverr's own search results per niche (not a crawl — behaves like one manual search), 30-min session cache, always shown as a visible status so it never looks hung. Toggle on/off in the popup under **Extension → Live Market Research**
- **Stop Button** — every AI button becomes a Stop button while running
- **Human-like Typing** — character-by-character input with realistic typos + corrections, uneven cadence, and thinking pauses, all dispatched as real DOM events so Fiverr's React app registers it as genuine user input
- **Multi-key Rotation** — up to 2 Claude keys and 3 Groq keys, auto-rotated on rate limit
- **Bundled Skill & Company Lists** — 530+ real Fiverr skills and 110+ companies ship with the extension
- **No API leaks** — see [Security](#security--no-api-leaks) below

---

## Installation

This is a single build that works in both Chrome and Firefox — no separate downloads.

### Chrome
1. Download/unzip this folder
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the `brainbox-gig-ai` folder
5. The ✦ icon appears in your Chrome toolbar

### Firefox
1. Open Firefox → `about:debugging` → **This Firefox** (left sidebar)
2. Click **Load Temporary Add-on…** → select `manifest.json` inside this folder
3. The ✦ icon appears immediately

**Firefox persistence note:** this temporary-load method only lasts until Firefox restarts — Firefox requires either a free Mozilla signature (submit the zipped folder at https://addons.mozilla.org/developers/ under "On your own" unlisted distribution, install the signed `.xpi` you get back) or running Firefox Developer Edition/Nightly with `xpinstall.signatures.required` set to `false` in `about:config` for it to survive a restart. Chrome has no equivalent restriction.

---

## Setup

1. Click the extension icon → **AI Provider** tab
2. Paste an Anthropic (Claude) key and/or a free Groq key, pick which one goes first, click **◆ Save**
3. **Keywords** tab → fill in your profile info (name, years, country) and profile niche → **◆ Save Profile**
4. Same screen → toggle **Live Market Research** on/off (on by default)

You need **at least one** of Claude or Groq. That's it — there's no separate image-provider key anymore.

---

## How to Use

### Gig Pages
1. Go to **Selling → Gigs → Create a New Gig** (or edit existing)
2. A **◆ Niche** bar appears at the top of the editor — type your gig niche there. A 🔄 button next to it force-refreshes live market data for that niche on demand
3. Click any **◆ Generate** button to fill that field — market research runs automatically the first time and is reused for the rest of that niche's generations
4. On the Gallery step, click **◆ Generate Image Prompt** to copy a thumbnail prompt for pasting into any image tool
5. Review everything and click **Save & Continue**

### Profile Page (`fiverr.com/sellers/.../edit`)
- **◆ Generate About**, **◆ Generate Work Experience**, **◆ Add Skills**

---

## Live Market Research — how it works, and its limits

Before generating title/tags/packages/description for a niche, the extension makes **one** same-origin `fetch()` to Fiverr's own `/search/gigs?query=...` page — functionally identical to you typing that search and hitting enter, under your normal logged-in session. No new host permission, no third-party scraping service, no polling.

It then tries two parsing strategies, in order, and stops at the first one that returns results:
1. **JSON hydration** — many SPAs (Fiverr included) embed the page's initial data as a JSON blob in a `<script>` tag; this looks for a few common variable names and heuristically mines any gig-shaped objects (a title-like field + a price-like field) out of whatever it finds, without needing to know the exact schema in advance.
2. **DOM fallback** — if no JSON blob matches, it parses the raw HTML and pattern-matches on visible `$NN` price text near a heading/link, the same resilient-selector philosophy used elsewhere in this codebase for the skills/companies dropdowns.

If both come back empty, `researchMarket()` returns `null` and **every** calling feature falls back to exactly the behavior this extension had before this feature existed — pricing/tags are never blocked or broken by a missed scrape.

**Honesty note:** the two strategies above were written defensively and pass a JS syntax/logic check, but they have not been confirmed against a live, logged-in Fiverr session — that part of the verification needs one real test pass on your end. Open devtools → Console on a gig page and look for `[fai-research]` breadcrumbs when you click a Generate button; they'll tell you whether JSON hydration matched, the DOM fallback matched, or neither did.

---

## Security / No API Leaks

- API keys are stored **only** in `chrome.storage.sync` (synced to your own signed-in Chrome profile, nowhere else) and `chrome.storage.local`.
- `background.js` is the **only** file that makes cross-origin network requests, and it only ever talks to `api.anthropic.com` and `api.groq.com` — exactly the two hosts declared in `manifest.json`'s `host_permissions`. There is no analytics, no telemetry, no logging server, and no request to any Brainbox-owned or third-party endpoint.
- The one Fiverr-side request (market research) is same-origin, made from `content.js` running on `fiverr.com` itself, using your existing session — not a new external host, and not visible to any server outside Fiverr and Anthropic.
- Keys are never printed to the console and never included in error messages surfaced to the popup.
- The extension requests `storage`, `tabs`, and host access to Fiverr and the two AI providers — no `activeTab`, no broad `<all_urls>` access. `tabs` is used for exactly one thing: opening the generated CV in a new tab (`chrome.tabs.create` with the extension's own bundled `cv.html` page) — it does not grant access to the content or URLs of other tabs.
- If you fork this further, keep the network request logic centralized in `background.js` so this guarantee stays easy to audit.

---

## Project Structure

```
brainbox-gig-ai/
├── manifest.json       # MV3 config
├── background.js       # Service worker — Claude/Groq calls only
├── content.js          # Injected into Fiverr — AI buttons, market research, automation
├── styles.css          # Injected button and niche bar styles
├── popup.html          # Popup UI — Keywords, AI Provider tabs
├── popup.js            # Popup logic
├── fetch-lists.js      # One-time console script to fetch skills from Fiverr's own API
├── data/
│   ├── skills.json      # 360+ real Fiverr skills (bundled)
│   └── companies.json   # Common company names for work experience
└── icons/
```

---

## How It Works

```
User fills niche bar on gig page (or profile niche in popup)
        ↓
◆ Generate button clicked
        ↓
researchMarket(niche) — one same-origin fetch to Fiverr's own search
results for this niche (cached 30 min), or null if unavailable
        ↓
content.js builds a prompt with niche + profile info + live market data
        ↓
background.js calls Claude (or Groq, per your saved priority + fallback)
        ↓
Response is typed character-by-character into Fiverr's fields
using React-compatible events, or inserted as formatted HTML into
Fiverr's editor, so Fiverr registers it as real user input
```

```
◆ Generate Image Prompt clicked
        ↓
Claude/Groq picks a tone (bold/corporate/playful/elegant/minimal) for
this niche and writes a matching click-optimized thumbnail prompt
        ↓
Prompt copied to clipboard — paste into any image tool you like
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Extension | Chrome MV3, Vanilla JS |
| Text AI | Anthropic Claude (`claude-sonnet-5` default) primary, Groq (`llama-3.3-70b-versatile` default) free fallback |
| Market data | Fiverr's own search-results page, same-origin fetch from `content.js` |
| Storage | `chrome.storage.sync` (keys/model/provider) + `chrome.storage.local` (profile/skills) + `sessionStorage` (per-niche research cache) |

---

## Notes

- A word on the automation itself: the human-like typing and file-drop mechanics exist because Fiverr's editor is a React app that only registers input dispatched through real DOM events — this is standard front-end automation technique, not a security bypass. It automates **your own account**; it does not access anyone else's data or systems. The market-research fetch is the same principle — one request under your own session, not a bypass of anything. That said, always review generated content before publishing, and use automation tools on Fiverr at your own discretion with respect to Fiverr's current Terms of Service.
- The niche bar on gig pages is per-session — intentional, since each gig is different.
- Skills and companies are bundled — no internet fetch needed on first run.

---

## License

MIT — free to use, modify, and distribute.

## Owner

**Brainbox Ecom Lab** — [brainboxecomlab.com](https://brainboxecomlab.com)
