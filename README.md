# Brainbox Gig AI

A Chrome extension, owned and operated by **Brainbox Ecom Lab**, that fills out your Fiverr gig pages and seller profile using **Claude** (Anthropic) or free **Groq** models with human-like typing, and generates gig thumbnail images end-to-end.

Originally forked from an open-source Groq-only autofill tool and substantially rebuilt: multi-provider AI backend, more human-sounding output, and real image generation replace the single-provider, prompt-only version.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green?style=for-the-badge)
![Claude](https://img.shields.io/badge/Claude-Sonnet%205-D97757?style=for-the-badge)
![Groq](https://img.shields.io/badge/Groq-Free%20Tier-orange?style=for-the-badge)

---

## What's new in this build

| Feature | Before | Now |
|---|---|---|
| AI backend | Groq only | **Claude (primary)** with automatic fallback to **Groq (free)** — set your preferred order in the popup |
| Writing quality | Templated, AI-sounding | **Human-voice prompts** (bans AI clichés, varies rhythm) + **upgraded typing simulation** with realistic typos, corrections, and uneven cadence |
| Gig images | Copies a text prompt to paste into ChatGPT/another tool manually | **◆ Generate Image** renders the thumbnail via the OpenAI Images API and drops it straight into Fiverr's gallery upload field — the old "◆ Generate Image Prompt" copy-only button is still there if you'd rather use it elsewhere |
| Ownership/branding | Third-party author | Brainbox Ecom Lab |

Everything else — the gig editor autofill, profile/bio/work-experience/skills automation, human-like typing, the per-gig niche bar — is carried over unchanged.

### Fixed: `` `temperature` is deprecated for this `` (400 error on every Claude call)

As of Claude Opus 4.7+/4.8 and Claude Sonnet 5, Anthropic's Messages API hard-rejects any request that sets a non-default `temperature`, `top_p`, or `top_k` — the previous build always sent `temperature`, so every single Claude call 400'd. Fixed in `background.js`:

- Claude requests never send `temperature`/`top_p`/`top_k` anymore, on any model.
- The popup's Creativity slider still works exactly like before — it's just no longer sent as a raw number to Claude. It's translated into a plain-English instruction appended to the prompt ("vary your phrasing" / "be precise and literal"), so the *intent* survives without tripping the 400.
- Groq is unaffected and still receives `temperature` normally — Anthropic's deprecation doesn't apply there.
- Also updated the web-search tool version string to Anthropic's current one, and gave Claude requests a bit more `max_tokens` headroom, since Sonnet 5's adaptive thinking (on by default) consumes some of the token budget before the visible answer.

---

## Features

### Gig Editor
- **AI Title** — Compelling "I will..." titles under 80 characters
- **Auto Tags** — 5 relevant gig search tags
- **3-Tier Packages** — Basic / Standard / Premium with unique names, Fiverr-style descriptions, and realistic prices
- **Formatted Description** — Question hook, intro, "I can develop" bullets, "Why choose me?" bullets, closing, and CTA
- **5 FAQs** — Buyer-voiced questions with personal, specific, first-person answers
- **Buyer Requirements** — Auto-fills and marks required
- **Gig Thumbnail Image** — writes an optimized poster prompt and renders it directly into the gallery upload field
- **Per-Gig Niche Input** — a niche bar is injected on each gig page

### Seller Profile
- **Bio / About**, **Work Experience**, **Skills** — personalized with your name, years, and country

### General
- **Stop Button** — every AI button becomes a Stop button while running
- **Human-like Typing** — character-by-character input with realistic typos + corrections, uneven cadence, and thinking pauses, all dispatched as real DOM events so Fiverr's React app registers it as genuine user input
- **Multi-key Rotation** — up to 2 Claude keys and 3 Groq keys, auto-rotated on rate limit
- **Bundled Skill & Company Lists** — 530+ real Fiverr skills and 110+ companies ship with the extension
- **No API leaks** — see [Security](#security--no-api-leaks) below

---

## Installation

1. Download/unzip this folder
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the `brainbox-gig-ai` folder
5. The ✦ icon appears in your Chrome toolbar

---

## Setup

1. Click the extension icon → **AI Provider** tab
2. Paste an Anthropic (Claude) key and/or a free Groq key, pick which one goes first, click **◆ Save**
3. *(Optional)* **Images** tab → paste an OpenAI key to enable one-click gig thumbnail generation
4. **Keywords** tab → fill in your profile info (name, years, country) and profile niche → **◆ Save Profile**

You need **at least one** of Claude or Groq for text generation. Image generation needs its own OpenAI key — everything else works fine without it.

---

## How to Use

### Gig Pages
1. Go to **Selling → Gigs → Create a New Gig** (or edit existing)
2. A **◆ Niche** bar appears at the top of the editor — type your gig niche there
3. Click any **◆ Generate** button to fill that field
4. On the Gallery step, click **◆ Generate Image** to render and upload a thumbnail, or **◆ Generate Image Prompt** to just copy the prompt
5. Review everything and click **Save & Continue**

### Profile Page (`fiverr.com/sellers/.../edit`)
- **◆ Generate About**, **◆ Generate Work Experience**, **◆ Add Skills**

---

## Security / No API Leaks

- API keys are stored **only** in `chrome.storage.sync` (synced to your own signed-in Chrome profile, nowhere else) and `chrome.storage.local`.
- `background.js` is the **only** file that makes network requests, and it only ever talks to `api.anthropic.com`, `api.groq.com`, and `api.openai.com` — exactly the three hosts declared in `manifest.json`'s `host_permissions`. There is no analytics, no telemetry, no logging server, and no request to any Brainbox-owned or third-party endpoint.
- Keys are never printed to the console and never included in error messages surfaced to the popup.
- The extension only requests the `storage` permission plus host access to Fiverr and the three AI providers — no `activeTab`, no broad `<all_urls>` access.
- If you fork this further, keep the network request logic centralized in `background.js` so this guarantee stays easy to audit.

---

## Project Structure

```
brainbox-gig-ai/
├── manifest.json       # MV3 config
├── background.js       # Service worker — Claude/Groq text calls, OpenAI image calls
├── content.js          # Injected into Fiverr — all AI buttons and automation
├── styles.css           # Injected button and niche bar styles
├── popup.html           # Popup UI — Keywords, AI Provider, Images tabs
├── popup.js             # Popup logic
├── fetch-lists.js       # One-time console script to fetch skills from Fiverr's own API
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
content.js builds a prompt with niche + profile info
        ↓
background.js calls Claude (or Groq, per your saved priority + fallback)
        ↓
Response is typed character-by-character into Fiverr's fields
using React-compatible events, or inserted as formatted HTML into
Fiverr's editor, so Fiverr registers it as real user input
```

```
◆ Generate Image clicked
        ↓
Claude/Groq writes a click-optimized thumbnail prompt (text + icon layout)
        ↓
background.js sends that prompt to the OpenAI Images API
        ↓
Returned PNG is wrapped as a real File object via DataTransfer
and dropped into Fiverr's gallery upload input
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Extension | Chrome MV3, Vanilla JS |
| Text AI | Anthropic Claude (`claude-sonnet-5` default) primary, Groq (`llama-3.3-70b-versatile` default) free fallback |
| Image AI | OpenAI Images API (`gpt-image-1`) |
| Storage | `chrome.storage.sync` (keys/model/provider) + `chrome.storage.local` (profile/skills) |

---

## Notes

- A word on the automation itself: the human-like typing and file-drop mechanics exist because Fiverr's editor is a React app that only registers input dispatched through real DOM events — this is standard front-end automation technique, not a security bypass. It automates **your own account**; it does not access anyone else's data or systems. That said, always review generated content before publishing, and use automation tools on Fiverr at your own discretion with respect to Fiverr's current Terms of Service.
- The niche bar on gig pages is per-session — intentional, since each gig is different.
- Skills and companies are bundled — no internet fetch needed on first run.

---

## License

MIT — free to use, modify, and distribute.

## Owner

**Brainbox Ecom Lab** — [brainboxecomlab.com](https://brainboxecomlab.com)
