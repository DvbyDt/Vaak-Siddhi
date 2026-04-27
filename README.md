# 🕉 VaakSiddhi - वाक्सिद्धि
### *Mastery of Voice*

> **AI-powered Bhagavad Gita Sanskrit pronunciation coach.**
> Record your recitation → get word-level AI feedback → hear the correct pronunciation → perfect your Sanskrit.

---

## 🌟 The Name


**VaakSiddhi** is a fusion of three linguistic traditions:

| Part | Language | Meaning |
|---|---|---|
| **वाक्** (Vaak) | Sanskrit | Speech, Voice, The power of expression |
| **सिद्धि** (Siddhi) | Sanskrit/Hindi | Mastery, Perfection, Attainment |
| **VaakSiddhi** | Trilingual | *"Mastery of Voice"* |

It echoes naturally across Hindi, Sanskrit, and English speakers. In Hindu philosophy, **Vaak-Siddhi** is literally the spiritual power of perfect speech — exactly what this app helps you achieve.

---

## 📋 Table of Contents

1. [What It Does](#what-it-does)
2. [Why It Exists](#why-it-exists)
3. [Architecture](#architecture)
4. [Tech Stack & Costs](#tech-stack--costs)
5. [Project Structure](#project-structure)
6. [Getting Started](#getting-started)
7. [Deploy for Free](#deploy-for-free)
8. [Scaling Guide](#scaling-guide)
9. [API Reference](#api-reference)
10. [The AI Feedback Engine](#the-ai-feedback-engine)
11. [Pronunciation Audio — Upgrade Path](#pronunciation-audio--upgrade-path)
12. [Shloka Database](#shloka-database)
13. [Bugs Fixed](#bugs-fixed)
14. [Roadmap](#roadmap)
15. [FAQ](#faq)

---

## What It Does

VaakSiddhi is a mobile-first web app that turns your phone into a personal Sanskrit pronunciation guru.

```
You recite a shloka  →  AI listens  →  Hear your own voice back
→  AI tells you exactly what went wrong  →  Hear correct Devanagari TTS  →  You improve
```

### Features

| Feature | Description |
|---|---|
| 🎙 **Voice Recording** | Record yourself; hear your own voice back with a progress player |
| 🧠 **AI Phonetic Analysis** | Multi-provider cascade: Groq → Gemini → Heuristic fallback |
| 📊 **Score + Grade** | 0–100 score with letter grade (A+ to F) after each attempt |
| 📝 **Word-Level Feedback** | Exact words mispronounced with Devanagari badge + IAST reference |
| 🔊 **Authentic TTS** | Hear correct pronunciation in actual Devanagari script (hi-IN voice) |
| 💡 **Actionable Tips** | 3 specific improvement tips per session |
| 🔤 **Phonetic Breakdown** | Syllable-by-syllable guide for the hardest mispronounced word |
| 📚 **Sanskrit Rules** | One phonetics rule explained per session |
| 🇮🇳 **Hindi Meanings** | Full Devanagari Hindi translation of every shloka |
| 🌐 **English Meanings** | English translation for all verses |
| 📈 **Progress Tracking** | Session history, best scores, streaks, stats dashboard |
| 🧠 **Spaced Repetition** | SM-2 algorithm schedules shlokas for optimal review timing |
| ✨ **Daily Sanskrit Word** | A rotating Sanskrit word from the Gita every day |
| 📱 **PWA / Offline** | Installs on homescreen; shloka library works offline |
| 🔄 **Scroll Memory** | Library scroll position and filters persist across navigation |

---

## Why It Exists

Sanskrit has ~50 phonemes vs English's ~44. Many Sanskrit sounds simply don't exist in English or Hindi:

| Sound | Example | Correct articulation |
|---|---|---|
| **ā** (long a) | kāma, dhāraṇā | Like "father" — held **twice** as long as short 'a' |
| **ṭ, ḍ, ṇ** (retroflex) | kaṭhina, ḍamaru | Tongue **curled back** to the palate |
| **ṣ** (retroflex sibilant) | kṛṣṇa, viṣṇu | Harder than English "sh" — tongue further back |
| **ḥ** (visarga) | duḥkha, namaḥ | Soft echo-breath after the vowel |
| **ṃ/ṁ** (anusvara) | saṃskāra | Nasal hum — not a full "n" |

Getting these wrong doesn't just sound odd — in Sanskrit, **vowel length and consonant type are phonemic**. Short vs long vowel = different word entirely.

**Existing apps don't solve this:**
- Vyoma/SanskritFromHome → Listen only, no feedback on *your* voice
- SGS Gita Tutor → Excellent audio library, zero recording feature
- Bhagavad Gita apps → Reference only, no pronunciation coaching

**VaakSiddhi closes the feedback loop** that's been missing from every Sanskrit learning tool.

---

## Architecture

See [`docs/architecture.svg`](docs/architecture.svg) for the full visual diagram.

### System Design Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    USER  (Browser / Mobile — Chrome/Edge)                    │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │
          ┌────────────────────────┼──────────────────────────┐
          ▼                        ▼                          ▼
  🎤 Web Speech API         🎙 MediaRecorder          🔊 Speech Synthesis
  (hi-IN, 3 alternatives,   (WebM/Opus, blob URL,     (Devanagari TTS,
   continuous, gotAnyAudio   progress player,          hi-IN, rate 0.45–0.6,
   guard, manual fallback)   replay fixed)             authentic Sanskrit)
          │                        │                          │
          └────────────────────────┼──────────────────────────┘
                                   │
               ⚡ Service Worker (PWA, cache-first, offline-safe)
                                   │
┌──────────────────────────────────▼───────────────────────────────────────────┐
│                    React 18 + Vite Frontend                                  │
│  ErrorBoundary → HomeScreen · LibraryScreen · PracticeScreen · ResultsScreen │
│  Shared UI: ScoreRing · WaveformBars · Chip · Card · DifficultyBadge         │
│  Lazy-loaded shlokas.json · sessionStorage scroll + filter memory            │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │ POST /api/analyze + X-Request-ID header
┌──────────────────────────────────▼───────────────────────────────────────────┐
│                 FastAPI Backend  (Railway / Render)                           │
│  Rate limiter (20 RPM/IP) · Response cache (MD5, 10 min TTL)                 │
│  Pydantic v2 validation · CORS hardened · Structured logging + request IDs   │
└──────┬──────────────────────┬────────────────────────────────┬───────────────┘
       │                      │                                │
       ▼                      ▼                                ▼
 ① GROQ (Primary)     ② GEMINI (Backup)          ③ HEURISTIC (Fallback)
 llama-3.3-70b        gemini-2.5-flash            Rule-based word match
 14,400 req/day       15 RPM free                 Always works, no API needed
 JSON mode            responseMimeType:json        Provider health tracker

               ↓ Response includes: Devanagari form per mistake word

┌─────────────────────────────┐      ┌────────────────────────────────────────┐
│   shlokas.json (Static)     │      │   Progress Store                       │
│   700 verses · Sanskrit     │      │   Stage 1: localStorage                │
│   Hindi · IAST · English    │      │   Stage 2: Supabase PostgreSQL         │
│   Lazy-loaded · CDN-cached  │      │   SRS schedule · Streak · History      │
└─────────────────────────────┘      └────────────────────────────────────────┘
```

### Key Design Principles

**1. Provider Abstraction Layer**

All STT and LLM calls go through service wrappers — swap any provider in one line:

```javascript
// src/services/llm.js — change backend URL to switch AI provider
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

// backend/main.py — cascade tries providers in order
providers = [("groq", call_groq), ("gemini", call_gemini)]
# Comment out a provider or add a new one — frontend never changes
```

**2. Static Shloka Database**

All shlokas = one JSON file. Zero DB queries for content. Lazy-loaded via `import()` so the app renders instantly without waiting for 16MB of data.

**3. Graceful Degradation**

- No mic permission → read shlokas, view meanings
- Offline → full shloka library (PWA cache), SRS queue still works
- AI API down → heuristic fallback still gives general coaching
- Network error during speech recognition → auto-switches to manual text input

**4. Request ID Tracing**

Every `/api/analyze` call gets a unique `X-Request-ID` header. The backend logs every step with `rid=` so any request can be traced end-to-end:

```
2026-03-28T14:22:01 INFO [vaaksiddhi] analyze ip=127.0.0.1 rid=vs-m3x8a-k2pq9 translit_len=142
2026-03-28T14:22:03 INFO [vaaksiddhi] cascade provider=groq score=74 rid=vs-m3x8a-k2pq9
```

---

## Tech Stack & Costs

### Stage 1 — MVP (₹0/month, up to ~1,000 users)

| Layer | Technology | Cost |
|---|---|---|
| Frontend | React 18 + Vite | Free |
| Hosting | Vercel | Free |
| STT | Web Speech API (hi-IN) | Free |
| TTS | Browser Speech Synthesis + Devanagari | Free |
| AI Feedback | Groq free tier (14,400 req/day) | Free |
| Shloka DB | Static JSON (lazy-loaded) | Free |
| Offline | Service Worker PWA | Free |
| Progress | localStorage + SRS | Free |
| **TOTAL** | | **₹0** |

### Stage 2 — Growth (~$65/month, up to 100,000 users)

| Layer | Technology | Cost |
|---|---|---|
| Backend | FastAPI on Railway | $7/month |
| STT | OpenAI Whisper API | ~$18/month |
| AI | Groq paid / Gemini Pro | ~$15/month |
| DB | Supabase Pro | $25/month |
| **TOTAL** | | **~$65/month** |

### Stage 3 — Scale (~$260/month, up to 1M users)

| Layer | Technology | Cost |
|---|---|---|
| STT | Self-hosted Whisper (RunPod A10G) | ~$90/month |
| AI | Claude Sonnet or GPT-4o | ~$120/month |
| Backend | Railway Pro or AWS ECS | $25/month |
| DB | Supabase Pro | $25/month |
| **TOTAL** | | **~$260/month** |

---

## Project Structure

```
vaaksiddhi/
│
├── src/                          # React frontend
│   ├── App.jsx                   # Root routing (~80 lines, was 932)
│   ├── main.jsx                  # Entry point + ErrorBoundary wrapper
│   │
│   ├── components/
│   │   ├── ErrorBoundary.jsx     # Catches all React crashes, shows reload
│   │   ├── HomeScreen.jsx        # Dashboard: stats, daily word, history
│   │   ├── LibraryScreen.jsx     # Shloka browser: lazy JSON, scroll memory
│   │   ├── PracticeScreen.jsx    # Recording + STT + MediaRecorder
│   │   ├── ResultsScreen.jsx     # Analysis display + TTS + recording playback
│   │   └── ui/
│   │       └── index.jsx         # Shared: Chip, Card, ScoreRing, WaveformBars…
│   │
│   ├── data/
│   │   └── shlokas.json          # 700 Bhagavad Gita verses (lazy-loaded)
│   │
│   ├── services/
│   │   ├── audio.js              # Web Speech API + MediaRecorder abstraction
│   │   ├── llm.js                # Backend proxy + makeRequestId + local fallback
│   │   └── storage.js            # localStorage + SRS (SM-2) + streak + settings
│   │
│   └── styles/
│       └── tokens.js             # Design tokens (colors) + global CSS
│
├── backend/                      # FastAPI
│   ├── main.py                   # Routes · cascade · rate limit · cache · logging
│   ├── requirements.txt          # Python deps (pydantic>=2.9, fastapi>=0.115)
│   └── .env                      # NOT committed — copy from .env.example
│
├── public/
│   ├── sw.js                     # Service Worker: cache-first, API network-only
│   ├── manifest.json             # PWA manifest: standalone, theme #0D0818
│   └── om.svg                    # App icon
│
├── docs/
│   └── architecture.svg          # Full system architecture diagram (this file)
│
├── index.html                    # PWA meta tags + service worker registration
├── vite.config.js                # Vite build config
├── .env.example                  # Template — copy to backend/.env
└── README.md                     # This file
```

---

## Getting Started

### Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Python 3.9+** — [python.org](https://python.org)
- **A free Groq API key** — [console.groq.com](https://console.groq.com) (30 seconds, no credit card)
- **Chrome or Edge** — required for Web Speech API (Safari/Firefox not supported)

### Run Locally

```bash
# 1. Clone
git clone https://github.com/yourusername/vaaksiddhi
cd vaaksiddhi

# 2. Install frontend deps
npm install

# 3. Start frontend (no backend needed for basic use)
npm run dev
# → http://localhost:5173
```

### Run the Backend (for AI analysis)

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp ../.env.example .env
# Edit .env and add:
#   GROQ_API_KEY=gsk_...        ← from console.groq.com (free)
#   GEMINI_API_KEY=AIza...      ← from aistudio.google.com (optional backup)
#   FRONTEND_URL=http://localhost:5173

# Start backend
uvicorn main:app --reload --port 8000
# → API: http://localhost:8000
# → Docs: http://localhost:8000/docs
```

The frontend automatically points to `http://localhost:8000` in development.

---

## Deploy for Free

### Frontend → Vercel

```bash
npm i -g vercel
vercel
# In Vercel dashboard → Settings → Environment Variables:
#   VITE_BACKEND_URL = https://your-backend.railway.app
```

### Backend → Railway

1. Push to GitHub
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub → select `backend/`
3. Add environment variables: `GROQ_API_KEY`, `FRONTEND_URL`
4. Railway auto-deploys from `main` branch

**Cost:** Free hobby tier (500 hrs/month). $5/month for always-on.

---

## Scaling Guide

| Trigger | Upgrade | Cost delta |
|---|---|---|
| Users complain about transcription | Web Speech → Whisper API | +$18/mo per 10K users |
| Want cross-device sync | localStorage → Supabase | +$25/mo (free up to 50K rows) |
| Need better AI quality | Groq → Claude Sonnet | +~$20/mo at moderate volume |
| STT costs >$100/mo | Whisper API → self-hosted GPU | Flat ~$90/mo, any volume |
| 1M+ users | Multi-region AWS | Custom — talk to us |

---

## API Reference

### `POST /api/analyze`

Main pronunciation analysis endpoint.

**Request:**
```json
{
  "expected_transliteration": "karmaṇy-evādhikāras te mā phaleṣu kadācana",
  "spoken_transcript": "karmanye vadhikaraste ma phaleshu kadachana",
  "spoken_alternatives": ["karma vadhikar", "karmanye vadikaraste"],
  "shloka_english": "You have a right to perform your prescribed duties...",
  "hard_sounds": ["karmaṇy", "phaleṣu"]
}
```

**Response:**
```json
{
  "score": 78,
  "grade": "B+",
  "overall": "Strong attempt — your rhythm is excellent, focus on vowel lengths.",
  "praise": "Perfect pause placement between pādas.",
  "mistakes": [
    {
      "word": "karmaṇy",
      "devanagari": "कर्मण्य",
      "issue": "The 'ṇ' is retroflex — tongue must curl back to the palate"
    }
  ],
  "tips": ["For ā: say 'ah' as in father, hold twice as long as short a"],
  "phonetic_guide": {
    "word": "karmaṇy",
    "devanagari": "कर्मण्य",
    "breakdown": "kar-mun-yuh — 'u' is very short, 'yuh' ends softly",
    "example": "Similar to 'car' + 'mun' + quick 'yuh'"
  },
  "sanskrit_rule": "Sanskrit has 5 nasal sounds (ṅ ñ ṇ n m) — each is phonemically distinct.",
  "encouragement": "अभ्यासेन तु कौन्तेय — Through practice, all is achieved. (BG 6.35)",
  "provider": "groq",
  "cached": false
}
```

**Key change from v1:** `mistakes` are now objects `{ word, devanagari, issue }` instead of strings, enabling authentic Devanagari TTS playback.

### `GET /api/daily-word`

Returns today's Sanskrit word from a rotating curated list of 15 Gita terms.

### `GET /health`

Provider status, cache count, and timestamps.

### `GET /`

API info, configured providers, and signup links.

---

## The AI Feedback Engine

### Provider Cascade

```
Request → Backend → [Rate limit check] → [Cache lookup]
                         │ cache miss
                         ▼
                    [Groq healthy?] ─yes→ call_groq()
                         │ no / fails
                         ▼
                    [Gemini healthy?] ─yes→ call_gemini()
                         │ no / fails
                         ▼
                    heuristic_analysis()   ← always works
```

Provider health is tracked over a 5-minute window. If a provider fails 3 times, it's automatically skipped for the rest of the window.

### Prompt Design — Guru Vaak

The AI persona is **Guru Vaak** — a warm, technically precise Sanskrit phonetics expert who:

- Celebrates what the student did well (confidence-building)
- Returns the **Devanagari form** of every mispronounced word alongside IAST
- Explains the Sanskrit phonetics *rule* behind each correction
- Accounts for Web Speech API's unreliability with Sanskrit by using all 3 transcript alternatives together
- Returns valid JSON with `response_format: json_object` (Groq) / `responseMimeType: application/json` (Gemini)

### STT Alternatives

Chrome's Web Speech API returns up to 3 different transcription guesses per segment. VaakSiddhi collects **all alternatives** across all result segments and sends them to the LLM:

```
Primary: "dharma kshetre kuru kshetre"
Alt 1:   "dharm kshetra kuru kshetra"
Alt 2:   "dharma chitra kuru kshetra"
→ LLM uses all three together to infer actual pronunciation
```

---

## Pronunciation Audio — Upgrade Path

The current TTS uses the browser's built-in `SpeechSynthesisUtterance` with `hi-IN` voice and Devanagari text. This is decent but uses a **Hindi voice model** — not a Sanskrit one. For authentic pronunciation, here are the upgrade options in order of effort:

### Option 1 — Bhashini API *(Free, recommended first step)*

India's government-funded API specifically built for Indian languages including Sanskrit. Has voices recorded by native Sanskrit speakers.

```python
# backend/main.py — add this route
@app.get("/api/tts")
async def tts(text: str, lang: str = "sa"):
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://dhruva-api.bhashini.gov.in/services/inference/pipeline",
            headers={"Authorization": BHASHINI_KEY},
            json={"pipelineTasks": [{"taskType": "tts", "config": {"language": {"sourceLanguage": lang}}}],
                  "inputData": {"input": [{"source": text}]}}
        )
    return {"audio_base64": resp.json()["pipelineResponse"][0]["audio"][0]["audioContent"]}
```

Sign up at [bhashini.gov.in](https://bhashini.gov.in) → API key is free for Indian developers.

### Option 2 — Google Cloud TTS with `sa-IN` *(Best quality, ~$4/1M chars)*

Google has an actual Sanskrit voice model (`sa-IN-Standard-A`). The WaveNet version sounds distinctly different from Hindi.

```python
from google.cloud import texttospeech
client = texttospeech.TextToSpeechClient()
synthesis_input = texttospeech.SynthesisInput(text=devanagari_text)
voice = texttospeech.VoiceSelectionParams(language_code="sa-IN", name="sa-IN-Standard-A")
```

First 1M characters/month are free; ₹0 for most small apps.

### Option 3 — Sarvam AI `saarika` *(Indian startup, free tier)*

Purpose-built for Indian languages. Has dedicated Sanskrit support with nuanced prosody. Sign up at [sarvam.ai](https://sarvam.ai).

### Option 4 — Pre-recorded Pandit Audio *(Best quality, no API)*

Record a Sanskrit teacher or use freely licensed recordings from [spokensanskrit.org](https://spokensanskrit.org) or the AI4Bharat corpus. Map recordings to shloka IDs in `shlokas.json`. Zero runtime cost, perfect pronunciation.

### Current workaround quality

| Text given to TTS | Voice | Sounds like |
|---|---|---|
| IAST Latin: `dhṛtarāṣṭra` | hi-IN | Garbled English ❌ |
| Devanagari: `धृतराष्ट्र` | hi-IN | Accented Hindi — recognisable ✅ |
| Devanagari: `धृतराष्ट्र` | sa-IN (Google) | Authentic Sanskrit ✅✅ |
| Pre-recorded audio | Pandit | Perfect ✅✅✅ |

---

## Shloka Database

`src/data/shlokas.json` is lazily imported to avoid blocking first render. Schema:

```json
{
  "id": "BG2.47",
  "chapter": 2,
  "verse": 47,
  "chapter_name": "Sankhya Yoga",
  "title": "Chapter 2, Verse 47",
  "sanskrit": "कर्मण्येवाधिकारस्ते...",
  "transliteration": "karmaṇy-evādhikāras te...",
  "hindi": "तुम्हारा अधिकार केवल कर्म करने में है...",
  "english": "You have a right to perform your duties...",
  "difficulty": "beginner",
  "keywords": ["karma", "adhikara", "phala"],
  "hard_sounds": ["karmaṇy", "phaleṣu", "hetur"]
}
```

---

## Bugs Fixed

A complete list of every bug discovered and resolved during development:

| # | Bug | Root cause | Fix |
|---|---|---|---|
| 1 | **Pydantic build fails on Python 3.13** | `pydantic-core 2.14.1` called `ForwardRef._evaluate()` with the wrong number of arguments — Python 3.13 changed the API | Updated `requirements.txt` from pinned `==` versions to `>=` ranges (`pydantic>=2.9.0`, `fastapi>=0.115.0`) |
| 2 | **App.jsx was 932 lines** | Single monolithic file with all screens, logic, and styles | Split into 7 focused files: HomeScreen, LibraryScreen, PracticeScreen, ResultsScreen, ErrorBoundary, ui/index, tokens.js |
| 3 | **API keys exposed in browser** | Claude was called directly from the frontend with `VITE_ANTHROPIC_API_KEY` visible to anyone opening DevTools | All AI calls now route through the FastAPI backend; keys are server-only env vars |
| 4 | **CORS wildcard in production** | `allow_origins=["*"]` accepted requests from any origin | CORS now reads `FRONTEND_URL` env var; falls back to localhost only |
| 5 | **16MB JSON blocking first render** | `shlokas.json` was statically imported at module load | Replaced with dynamic `import("../data/shlokas.json")` inside `useEffect` — renders instantly with spinner |
| 6 | **Dual recognizer abort bug** | Adding a second `en-IN` SpeechRecognition instance alongside `hi-IN` caused Chrome to abort both immediately with `error: aborted` | Reverted to single `hi-IN` recognizer; collect all 3 built-in alternatives via `event.results[i][j]` loop |
| 7 | **"No speech detected" false positive** | `recognition.onend` fired immediately after `start()` (browser quirk on some inputs) — triggered `onResults` with empty transcript before user spoke | Added `gotAnyAudio` boolean guard: `onEnd` only calls `onResults` if at least one final result segment was received |
| 8 | **App freezes when offline** | Web Speech API requires internet (streams to Google). `error: network` fired but `onEnd` never followed → PracticeScreen stuck in recording state | Caught `error: network` in `onerror`, set `shouldRestart = false`, auto-switched to manual text input with helpful message |
| 9 | **No crash recovery** | Any unhandled React render error crashed the white-screen with no user option to recover | Added `ErrorBoundary.jsx` class component wrapping the entire app tree; shows "Reload App" button on crash |
| 10 | **Recording playback URL lost** | `playbackUrl` stored in React state; `stopAndAnalyze` navigated to ResultsScreen before state updated → Results never received the URL | Used `playbackUrlRef` (useRef, synchronous) to capture the blob URL immediately; forwarded through `onResults` payload |
| 11 | **WebM blob duration = Infinity** | Chrome's `MediaRecorder` doesn't write a duration header into WebM files → `audio.duration === Infinity` → progress bar broken | On `loadedmetadata`, seek to `currentTime = 1e9` to force the browser to scan to the real end and set correct duration |
| 12 | **Replay after stop didn't work** | After `onEnded`, `audio.currentTime === audio.duration`. Calling `play()` again fired `ended` instantly. `currentTime` was never reset | `toggle()` now always sets `currentTime = 0` before `play()`; awaits the Promise and catches errors |
| 13 | **TTS sounded like English** | `SpeechSynthesisUtterance` was fed IAST Latin text (`dhṛtarāṣṭra`) — browser reads it as garbled English | Changed all TTS calls to use Devanagari script (`shloka.sanskrit`); LLM prompt updated to return `devanagari` field for each mistake word |
| 14 | **`makeRequestId` declared, never used** | IDE warning; request IDs existed client-side but were not sent to the backend | Wired into fetch headers as `X-Request-ID`; backend updated to extract and log with `rid=` in every structured log line |
| 15 | **No scroll/filter memory in Library** | Every time you navigated back from Practice, the library reset to top with no filters | Persisted scroll position and active filter to `sessionStorage`; restored on mount |
| 16 | **No spaced repetition** | Users had to manually decide which shloka to review | Implemented SM-2 simplified algorithm in `storage.js`: score≥80 doubles interval (max 30 days), score≥60 keeps 3-day minimum, score<60 resets to 1 day |

---

## Roadmap

### v1.0 — Current
- [x] React 18 + Vite frontend, split into focused components
- [x] FastAPI backend with Groq → Gemini → Heuristic cascade
- [x] Voice recording with waveform visualization + blob URL playback
- [x] Hear your own recording back with progress bar
- [x] Devanagari TTS for correct pronunciation + per-mistake word TTS
- [x] Score + grade system (0–100, A+–F)
- [x] Word-level mistakes with Devanagari badge
- [x] Phonetic breakdown for hardest word
- [x] 3 improvement tips per session
- [x] Progress tracking with SM-2 spaced repetition
- [x] PWA: installable, offline-capable, service worker
- [x] Daily Sanskrit word (15 rotating Gita terms)
- [x] Scroll memory + filter persistence in Library
- [x] ARIA labels, keyboard accessible
- [x] ErrorBoundary for crash recovery
- [x] Request ID tracing end-to-end
- [x] Structured Python logging with `rid=` per request

### v1.1 — Content
- [ ] All 700 shlokas across 18 chapters
- [ ] Chapter summaries and context
- [ ] Favourite shlokas
- [ ] Share results card (Instagram-friendly)

### v1.2 — Authentic Audio
- [ ] Bhashini API TTS backend route (`GET /api/tts`)
- [ ] Google Cloud TTS `sa-IN` voice integration
- [ ] Side-by-side waveform: your voice vs correct pronunciation
- [ ] 0.5x slowdown mode for difficult passages

### v2.0 — Platform
- [ ] Supabase cross-device sync
- [ ] Google/Apple login (Supabase Auth)
- [ ] Whisper API for better STT accuracy
- [ ] Personalized weak-spot detection
- [ ] 30-day Sanskrit learning curriculum
- [ ] Push notification reminders (PWA)

### v3.0 — Expansion
- [ ] React Native iOS/Android apps
- [ ] Yoga Sutras, Upanishads, Hanuman Chalisa
- [ ] Sanskrit keyboard input
- [ ] Teacher mode: assign shlokas, view student scores
- [ ] Premium tier (₹99/month)

---

## Research & Feasibility

### Sanskrit ASR — State of the Art (2025)

| System | WER | Cost | Notes |
|---|---|---|---|
| Web Speech API hi-IN | ~35% | Free | Good enough for MVP with alternatives |
| OpenAI Whisper (base) | ~25% | $0.006/min | Better, but still not Sanskrit-specific |
| AI4Bharat Whisper Sanskrit | ~15.4% | Self-host | Best accuracy, needs GPU |
| Bhashini ASR | ~18% | Free | Indian govt, Sanskrit trained |

WER of 15–35% means AI correctly catches most errors that matter — wrong consonant type, wrong vowel length — the exact errors that most affect recitation quality.

### Prior Art Analysis

| Product | Recording? | AI feedback? | Sanskrit specific? | Gita specific? |
|---|---|---|---|---|
| Vyoma SanskritFromHome | ❌ | ❌ | ✅ | ✅ |
| SGS Gita Tutor | ❌ | ❌ | ✅ | ✅ |
| Vidya.AI (beta) | ✅ | Partial | ✅ | ❌ |
| Duolingo (Sanskrit) | ❌ | ❌ | ✅ | ❌ |
| **VaakSiddhi** | ✅ | ✅ | ✅ | ✅ |

---

## Contributing

Priority areas:

1. **Shloka data** — Help verify and add all 700 verses
2. **Sanskrit phonetics accuracy** — Review AI feedback for linguistic correctness
3. **Bhashini/Google TTS integration** — Add authentic Sanskrit audio
4. **Hindi/regional translations** — Tamil, Telugu, Marathi, Kannada
5. **Whisper integration** — Better STT than Web Speech API

```bash
git checkout -b feature/your-feature
git commit -m "feat: your description"
git push origin feature/your-feature
# → Open Pull Request
```

**Code conventions:**
- Functional React components + hooks only
- All AI calls must have a fallback
- Never commit `.env` or API keys
- Validate at system boundaries (user input, API responses); trust internal code

---

## FAQ

**Q: Why is it not called GitaGuru?**
A: VaakSiddhi works equally well across Hindi/Sanskrit/English speakers, reflects the spiritual depth of the project, and has no trademark conflicts.

**Q: Does it work on iPhone?**
A: Safari on iOS doesn't support Web Speech API. Use Chrome on Android, or Chrome/Edge on desktop. Native iOS app is on the v3.0 roadmap.

**Q: Is my voice stored anywhere?**
A: In Stage 1, audio is processed entirely in the browser — only the text transcript is sent to the AI. The blob URL for playback lives in memory only, cleared when you leave Results. Nothing is uploaded.

**Q: The TTS doesn't sound very Sanskrit-like.**
A: Correct — the browser's `hi-IN` voice is a Hindi model reading Devanagari. It's better than IAST (which sounds like English), but not perfect. The [Pronunciation Audio Upgrade Path](#pronunciation-audio--upgrade-path) section above explains how to add Bhashini (free) or Google `sa-IN` for authentic Sanskrit voice.

**Q: How accurate is the AI feedback?**
A: Highly accurate for common errors (vowel length, retroflex consonants, visarga). For very subtle sandhi rules or Vedic pitch accents, always cross-reference with a human guru.

**Q: Can I use this for other Sanskrit texts?**
A: The AI system works for any Sanskrit text. Swap the shloka database. Yoga Sutras, Upanishads, and Hanuman Chalisa are on the v3.0 roadmap.

---

## License

MIT — free to use, fork, modify, and distribute.

---

## Acknowledgements

- **Bhagavad Gita translations**: Swami Prabhupada (ISKCON), Swami Sivananda (DLS), Winthrop Sargeant
- **Sanskrit ASR research**: AI4Bharat team, IIT Madras Speech Lab
- **Bhashini project**: MeitY India — making Indian language AI publicly accessible
- **Design inspiration**: Indian manuscript illumination tradition

---

*ॐ तत् सत्*
*"That is the Truth"*

*योगः कर्मसु कौशलम् — Yoga is skill in action. (Bhagavad Gita 2.50)*
