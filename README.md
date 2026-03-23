# 🕉 VaakSiddhi — वाक्सिद्धि
### *Mastery of Voice*

> **AI-powered Bhagavad Gita Sanskrit pronunciation coach.**  
> Record your recitation → get word-level AI feedback → perfect your Sanskrit.

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
7. [How to Run Locally](#how-to-run-locally)
8. [Deploy for Free](#deploy-for-free)
9. [Scaling Guide](#scaling-guide)
10. [API Reference](#api-reference)
11. [The AI Feedback Engine](#the-ai-feedback-engine)
12. [Shloka Database](#shloka-database)
13. [Roadmap](#roadmap)
14. [Research & Feasibility](#research--feasibility)
15. [Contributing](#contributing)
16. [FAQ](#faq)

---

## What It Does

VaakSiddhi is a mobile-first web app that turns your phone into a personal Sanskrit pronunciation guru.

```
You recite a shloka  →  AI listens  →  AI tells you exactly what went wrong  →  You improve
```

### Features

| Feature | Description |
|---|---|
| 🎙 **Voice Recording** | Record yourself with the browser microphone (no app install needed) |
| 🧠 **AI Phonetic Analysis** | Claude AI compares your speech against the correct transliteration |
| 📊 **Score + Grade** | 0–100 score with letter grade (A+ to F) after each attempt |
| 📝 **Word-Level Feedback** | Exact words/sounds you mispronounced and why |
| 💡 **Actionable Tips** | 3 specific tips to improve, e.g. "The ā in kāma is long like 'father'" |
| 🔤 **Phonetic Breakdown** | Syllable-by-syllable guide for the hardest word you got wrong |
| 📚 **Sanskrit Rules** | One phonetics rule explained per session — you learn the system |
| 🇮🇳 **Hindi Meanings** | Full Devanagari Hindi translation of every shloka |
| 🌐 **English Meanings** | English translation for all verses |
| 🗺 **Pronunciation Guide** | Audio hints + hard sound reference for every shloka |
| 📈 **Progress Tracking** | Session history, best scores, streaks, stats dashboard |
| ✨ **Daily Sanskrit Word** | A beautiful Sanskrit word from the Gita every day |

---

## Why It Exists

Sanskrit has ~50 phonemes vs English's ~44. Many Sanskrit sounds simply don't exist in English or Hindi:

| Sound | Example | English equivalent |
|---|---|---|
| **ā** (long a) | kāma, dhāraṇā | Like "father" — NOT "cat" |
| **ṭ, ḍ, ṇ** (retroflex) | kaṭhina, ḍamaru | Tongue curled back to palate |
| **ṣ** (retroflex sibilant) | kṛṣṇa, viṣṇu | Harder than English "sh" |
| **ḥ** (visarga) | duḥkha, namaḥ | Soft echo/breath after vowel |
| **ṃ/ṁ** (anusvara) | saṃskāra | Nasal hum, not a full "n" |

Getting these wrong doesn't just sound odd — in Sanskrit, **vowel length and consonant type are phonemic**. Short vs long vowel = different word entirely.

**Existing apps don't solve this:**
- Vyoma/SanskritFromHome → Listen only, no feedback on *your* voice
- SGS Gita Tutor → Excellent audio library, zero recording feature  
- Bhagavad Gita apps → Reference only, no pronunciation coaching

**VaakSiddhi closes the feedback loop** that's been missing from every Sanskrit learning tool.

---

## Architecture

See `docs/architecture.svg` for the full visual diagram.

### System Design Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    USER  (Browser / Mobile)                      │
│          Records voice · Views shlokas · Gets AI feedback        │
│                   [ Web Speech API — FREE ]                      │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│              React Frontend  (Vercel / Netlify)                  │
│       HomeScreen · LibraryScreen · PracticeScreen · Results      │
│              [ Stage 1: Free  →  Stage 3: $20/mo ]               │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│            FastAPI Backend  (Railway / Render)                   │
│        API proxy · Auth · Rate limiting · Key protection         │
│         [ Stage 1: Free tier  →  Stage 3: $7–25/mo ]            │
└────────┬──────────────────────────────────────┬──────────────────┘
         │                                      │
         ▼                                      ▼
┌─────────────────────┐              ┌────────────────────────┐
│   SPEECH-TO-TEXT    │              │   LLM FEEDBACK ENGINE  │
│                     │              │                        │
│ Stage 1:            │              │ Stage 1:               │
│  Web Speech API     │              │  Claude (browser)      │
│  (free, built-in)   │              │  (free)                │
│                     │              │                        │
│ Stage 2:            │              │ Stage 2:               │
│  Whisper API        │              │  Groq/Llama 3.3        │
│  ($0.006/min)       │              │  (14,400 req/day free) │
│                     │              │                        │
│ Stage 3:            │              │ Stage 3:               │
│  Self-hosted GPU    │              │  Claude Sonnet         │
│  (RunPod/Modal)     │              │  / GPT-4o              │
└─────────────────────┘              └────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Supabase  (PostgreSQL)                          │
│          User progress · Session history · Streaks · Stats       │
│           [ Stage 1: Free (50K users) → Stage 3: $25/mo ]       │
└──────────────────────────────────────────────────────────────────┘

                    STATIC ASSETS (NO DB NEEDED)
┌──────────────────────────────────────────────────────────────────┐
│                  shlokas.json  (~500KB)                          │
│     700 verses · Sanskrit · Hindi · English · Transliteration    │
│           Loaded once · Cached by CDN · Works offline            │
└──────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

**1. Provider Abstraction Layer** (most important decision)

Never hardcode an AI provider. All STT and LLM calls go through service wrappers:

```javascript
// src/services/llm.js
export async function analyzePronunciation(params) {
  return claudeAnalyze(params);    // ← change this line to swap providers
}

// src/services/audio.js  
export function createSpeechRecognizer(callbacks) {
  return webSpeechRecognizer(callbacks);  // ← swap to Whisper/Deepgram
}
```

If Groq changes pricing, Claude goes down, or a better model emerges — you change **one line** and nothing else breaks.

**2. Static Shloka Database**

All 700 shlokas = ~500KB JSON file. This means:
- Zero database queries for content (instant loads)
- CDN-cached globally (sub-50ms access anywhere)
- Works fully offline as a PWA
- Never a scaling bottleneck

**3. Server-Side API Proxying (from Stage 2)**

Even though Stage 1 calls Claude directly from the browser (fine for demos), Stage 2 always routes through the backend. Why:
- API keys never exposed to the client
- Rate limiting prevents abuse
- Centralized logging and monitoring
- Easy provider swaps without frontend redeploys

**4. Progressive Enhancement**

The app degrades gracefully:
- No mic permission → can still read shlokas + see meanings
- No internet → offline shloka library still works (PWA)
- AI API down → fallback response still gives general tips

---

## Tech Stack & Costs

### Stage 1 — MVP (₹0/month, up to ~1,000 users)

| Layer | Technology | Why | Cost |
|---|---|---|---|
| Frontend | React 18 + Vite | Fast, component-based | Free |
| Hosting | Vercel | Auto CDN, free SSL, instant deploy | Free |
| Voice Capture | Web Speech API | Built into Chrome/Edge, no install | Free |
| STT | Web Speech API (hi-IN) | Good enough for MVP | Free |
| AI Feedback | Claude (Anthropic) | Best Sanskrit understanding | Free* |
| Shloka DB | Static JSON | 700 shlokas, ~500KB | Free |
| Progress | localStorage | No backend needed | Free |
| **TOTAL** | | | **₹0** |

*Claude API key required — free to get at console.anthropic.com

### Stage 2 — Growth (~$40/month, up to 100,000 users)

| Layer | Technology | Cost |
|---|---|---|
| Backend | FastAPI on Railway | $5/month |
| STT | OpenAI Whisper API | ~$18/month (100K×1min sessions) |
| AI | Groq/Llama 3.3 70B | ~$12/month |
| DB | Supabase Pro | $25/month |
| **TOTAL** | | **~$60/month** |

### Stage 3 — Scale (~$260/month, up to 1M users)

| Layer | Technology | Cost |
|---|---|---|
| STT | Self-hosted Whisper (RunPod A10G) | ~$90/month |
| AI | Claude Sonnet or GPT-4o | ~$120/month |
| Backend | Railway Pro or AWS ECS | $25/month |
| DB | Supabase Pro | $25/month |
| **TOTAL** | | **~$260/month** |

> **Revenue perspective:** At 1M users with ₹99/month subscription = ₹99M/month revenue on ₹21,000 infrastructure = extraordinary unit economics.

---

## Project Structure

```
vaaksiddhi/
│
├── src/                          # React frontend
│   ├── App.jsx                   # Root component + all screens
│   ├── main.jsx                  # React entry point
│   │
│   ├── data/
│   │   └── shlokas.json          # 700 Bhagavad Gita verses (static)
│   │
│   └── services/
│       ├── llm.js                # LLM abstraction (Claude/Groq/GPT-4o)
│       ├── audio.js              # STT abstraction (WebSpeech/Whisper)
│       └── storage.js            # Progress storage (localStorage → Supabase)
│
├── backend/                      # FastAPI (Stage 2+)
│   ├── main.py                   # API routes + rate limiting
│   └── requirements.txt          # Python dependencies
│
├── docs/
│   └── architecture.svg          # Full system architecture diagram
│
├── index.html                    # HTML entry point
├── vite.config.js                # Vite configuration
├── package.json                  # Node dependencies
├── .env.example                  # Environment variables template
└── README.md                     # This file
```

---

## Getting Started

### Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **A free Claude API key** — [console.anthropic.com](https://console.anthropic.com) (takes 60 seconds)
- **Chrome or Edge** — for Web Speech API (Firefox not supported)

### How to Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/vaaksiddhi
cd vaaksiddhi

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local and add your Claude API key:
# VITE_ANTHROPIC_API_KEY=sk-ant-...

# 4. Start development server
npm run dev

# App runs at http://localhost:5173
```

### Run the Backend (Stage 2+)

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export ANTHROPIC_API_KEY=sk-ant-...

# Start backend
uvicorn main:app --reload --port 8000

# API runs at http://localhost:8000
# Docs at http://localhost:8000/docs (Swagger UI)
```

---

## Deploy for Free

### Frontend → Vercel (2 minutes)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variable in Vercel dashboard:
# Settings → Environment Variables → VITE_ANTHROPIC_API_KEY
```

Your app is live at `https://vaaksiddhi.vercel.app` — **free, with auto-SSL and global CDN.**

### Backend → Railway (Stage 2)

1. Push code to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select `backend/` as root directory
4. Add environment variable: `ANTHROPIC_API_KEY`
5. Railway auto-detects Python + gives you a URL

**Cost:** Free up to 500 hours/month. $5/month for always-on.

---

## Scaling Guide

### When to Upgrade Each Component

**Web Speech API → Whisper**
- Trigger: Users complaining about transcription accuracy
- Action: Add OpenAI API key + uncomment Whisper code in `backend/main.py`
- Cost: $0.006/minute of audio — at 10K users × 2min/session = ~$120/month

**localStorage → Supabase**
- Trigger: Users want cross-device sync, or you want analytics
- Action: Create Supabase project (free) → update `src/services/storage.js`
- Cost: Free up to 50,000 rows

**Claude Browser → Groq Backend**
- Trigger: You want to protect your API key (recommended before public launch)
- Action: Deploy FastAPI backend → update `src/services/llm.js` to call backend
- Cost: Free tier covers ~500 daily active users

**Groq → Claude Sonnet (for accuracy)**
- Trigger: Feedback quality complaints, or advanced users need more nuanced analysis
- Action: Change one line in `backend/main.py`
- Cost: ~$3/million tokens (Claude Sonnet)

**Self-hosted Whisper**
- Trigger: STT costs exceed $100/month
- Action: Deploy Whisper on RunPod A10G GPU
- Cost: ~$90/month, handles unlimited audio

### The Break-Even Points

| Monthly Users | Free? | Recommended Stack |
|---|---|---|
| 0–500 | ✅ Yes | Stage 1 (everything free) |
| 500–5,000 | ✅ Yes | Stage 1 + Railway backend ($5) |
| 5,000–50,000 | 🟡 Small cost | Stage 2 (~$40–60/mo) |
| 50,000–500,000 | 💰 Paid | Stage 3 (~$260/mo) |
| 500,000+ | 💰 Scale | Stage 3 + GPU cluster |

---

## API Reference

### `POST /api/analyze`

Analyze pronunciation — the core endpoint.

**Request:**
```json
{
  "expected_transliteration": "karmaṇy-evādhikāras te mā phaleṣu kadācana",
  "spoken_transcript": "karmanye vadhikaraste ma phaleshu kadachana",
  "shloka_english": "You have a right to perform your prescribed duties...",
  "hard_sounds": ["karmaṇy", "phaleṣu", "hetur"]
}
```

**Response:**
```json
{
  "score": 78,
  "grade": "B+",
  "overall": "Strong attempt — your rhythm is excellent, focus on vowel lengths.",
  "praise": "Perfect pause placement between pādas. Your stress pattern was natural.",
  "mistakes": [
    "karmaṇy — the 'ṇ' is retroflex (tongue curls back), not a plain 'n'",
    "phaleṣu — 'ṣ' is harder than 'sh', like sh with tongue pulled back"
  ],
  "tips": [
    "For ā (long a): say 'ah' as in 'father', hold it twice as long as short a",
    "For retroflex ṇ: touch the roof of your mouth further back than for 'n'",
    "Record yourself and compare against the transliteration syllable by syllable"
  ],
  "phonetic_guide": {
    "word": "karmaṇy",
    "breakdown": "kar-mun-yuh — 'u' is very short, 'yuh' ends softly",
    "example": "Similar to 'car' + 'mun' + quick 'yuh'"
  },
  "sanskrit_rule": "Sanskrit distinguishes 5 nasal sounds (ṅ ñ ṇ n m) based on place of articulation — each is phonemically distinct.",
  "encouragement": "अभ्यासेन तु कौन्तेय — Through constant practice, O Arjuna, all is achieved. (Gita 6.35)"
}
```

### `POST /api/transcribe`

Convert audio to Sanskrit text (Stage 2+, requires Whisper).

**Request:** Multipart form with audio file (WebM/MP3/WAV)

**Response:**
```json
{
  "transcript": "karmanye vadhikaraste",
  "language": "sa",
  "confidence": 0.87
}
```

### `GET /api/shlokas`

List shlokas with optional filters.

**Query params:** `chapter=2`, `difficulty=beginner`

**Response:**
```json
{
  "shlokas": [...],
  "count": 10
}
```

---

## The AI Feedback Engine

The heart of VaakSiddhi is the prompt engineering in `src/services/llm.js`.

### System Prompt Design

The AI is given a persona: **"Guru Vaak"** — a warm, expert Sanskrit phonetics coach who:
- Celebrates what the student did well (builds confidence)
- Gives specific, technical feedback (not vague "try better")
- Explains the Sanskrit phonetics *rule* behind each correction
- Provides English-language phonetic analogies (not just IPA)
- Ends with an encouraging Sanskrit quote

### Why Claude Specifically?

Claude was chosen over GPT-4o or Gemini for Sanskrit because:
1. **Multilingual training** — strong Hindi/Sanskrit corpus
2. **Instruction following** — reliably returns valid JSON
3. **Nuanced explanations** — can explain retroflex consonants to beginners
4. **Cultural sensitivity** — treats religious texts respectfully

### Prompt Structure

```
SYSTEM: You are Guru Vaak, expert Sanskrit phonetics coach...
USER:   Expected transliteration: [correct text]
        English meaning: [context]
        Hard sounds in this verse: [ṭ, ṣ, etc.]
        Student said: [transcribed speech]
        
        Return JSON with: score, grade, praise, mistakes, tips, phonetic_guide...
```

---

## Shloka Database

`src/data/shlokas.json` contains 10 representative shlokas (MVP). The full database will contain all 700 verses across 18 chapters.

### Schema

```json
{
  "id": 4,
  "chapter": 2,
  "verse": 47,
  "title": "The Yoga of Action",
  "sanskrit": "कर्मण्येवाधिकारस्ते...",
  "transliteration": "karmaṇy-evādhikāras te...",
  "hindi": "तुम्हारा अधिकार केवल कर्म करने में है...",
  "english": "You have a right to perform your duties...",
  "difficulty": "beginner",
  "audio_hint": "kar-MAN-yeh-VAA-dhi-KAA-ras-teh...",
  "keywords": ["karma", "duty", "action", "detachment"],
  "hard_sounds": ["karmaṇy", "phaleṣu", "hetur", "saṅgo"]
}
```

### Data Sources

Translations sourced and verified from:
- Swami Prabhupada — Bhaktivedanta Book Trust
- Swami Sivananda — Divine Life Society
- Swami Chinmayananda — Chinmaya Mission
- Winthrop Sargeant — SUNY Press (scholarly Sanskrit)

---

## Roadmap

### v1.0 — Current (MVP)
- [x] 10 core shlokas from key chapters
- [x] Voice recording with waveform visualization
- [x] Claude AI pronunciation analysis
- [x] Score + grade system
- [x] Hindi + English + Transliteration tabs
- [x] Pronunciation guide per shloka
- [x] Progress tracking (localStorage)
- [x] Daily Sanskrit word
- [x] Difficulty filtering + search
- [x] FastAPI backend (Stage 2 ready)

### v1.1 — Full Content
- [ ] All 700 shlokas across 18 chapters
- [ ] Chapter summaries and context
- [ ] Mark favourite shlokas
- [ ] Share results card (Instagram-friendly)

### v1.2 — Audio Reference
- [ ] Reference audio via Bhashini API (correct pronunciation playback)
- [ ] Side-by-side waveform comparison
- [ ] 0.5x slowdown mode for difficult passages
- [ ] Highlight mispronounced word in text

### v2.0 — Learning System
- [ ] Supabase integration (cross-device sync)
- [ ] User accounts (Supabase Auth — Google/Apple login)
- [ ] Spaced repetition — revisit weak shlokas automatically
- [ ] Personalized weak-spot detection ("You always struggle with ṣ sounds")
- [ ] 30-day learning curriculum
- [ ] Daily practice reminders (PWA push notifications)

### v2.1 — Community
- [ ] Teacher mode — assign shlokas to students, view their scores
- [ ] Class leaderboard
- [ ] Audio recording download (save your best takes)

### v3.0 — Platform
- [ ] React Native iOS + Android apps
- [ ] Other texts: Yoga Sutras, Upanishads, Hanuman Chalisa
- [ ] Sanskrit keyboard input
- [ ] Premium tier (₹99/month)

---

## Research & Feasibility

### Sanskrit ASR — State of the Art (2025)

The biggest technical risk is speech recognition quality for Sanskrit. Research shows:

- **Whisper fine-tuned for Sanskrit** achieves ~15.4% Word Error Rate (WER) — adequate for comparison purposes
- **AI4Bharat** has open-sourced Sanskrit ASR models trained on Vedic audio
- **Bhashini** (India govt) provides production-grade Sanskrit/Hindi TTS and ASR
- **Web Speech API** (hi-IN mode) — surprisingly usable for Sanskrit due to shared Devanagari phonemes with Hindi

WER of 15% means the AI correctly catches most errors that matter (wrong consonant type, wrong vowel length) — the exact errors that most affect pronunciation quality.

### Why GenAI Is the Right Tool

Traditional pronunciation apps use phoneme matching algorithms (DTW, Levenshtein on phoneme sequences). GenAI adds:

1. **Natural language explanation** — telling *why* something is wrong, not just that it is
2. **Cultural and linguistic context** — "this word is a name for Vishnu, so the ṣ must be crisp"
3. **Encouragement calibrated to effort** — different feedback for complete beginner vs advanced learner
4. **Sanskrit rule extraction** — teaching the system, not just correcting the instance

### Prior Art Analysis

| Product | Has recording? | Has AI feedback? | Sanskrit specific? | Gita specific? |
|---|---|---|---|---|
| Vyoma SanskritFromHome | ❌ | ❌ | ✅ | ✅ |
| SGS Gita Tutor | ❌ | ❌ | ✅ | ✅ |
| Vidya.AI (beta) | ✅ | Partial | ✅ | ❌ |
| Duolingo (Sanskrit) | ❌ | ❌ | ✅ | ❌ |
| **VaakSiddhi** | ✅ | ✅ | ✅ | ✅ |

**VaakSiddhi is the only product that closes all four requirements.**

---

## Contributing

Contributions welcome! Priority areas:

1. **Shloka data** — Help verify and add all 700 verses with accurate translations
2. **Sanskrit phonetics accuracy** — Review AI feedback for linguistic correctness  
3. **Hindi/regional translations** — Add Tamil, Telugu, Marathi, Kannada meanings
4. **Accessibility** — Screen reader support, larger text options
5. **PWA** — Offline mode implementation

```bash
git checkout -b feature/your-feature-name
git commit -m "feat: description of your change"
git push origin feature/your-feature-name
# → Open Pull Request
```

### Code Style
- React: functional components + hooks only
- No class components
- Services always return typed data (use JSDoc or TypeScript in future)
- All AI calls must have fallback responses
- Never commit API keys (use .env.local)

---

## FAQ

**Q: Why is it not called GitaGuru or something simpler?**  
A: VaakSiddhi is intentionally multilingual — it works equally well for Hindi, Sanskrit, and English speakers, reflects the spiritual depth of the project, and has no trademark conflicts. It's also unique enough to be Google-able.

**Q: Does it work on iPhone?**  
A: Safari on iOS does not support Web Speech API. Use Chrome on Android, or Chrome/Edge on desktop. iOS support will come in v3.0 via the native app.

**Q: Is my voice data stored anywhere?**  
A: In Stage 1, audio is processed entirely in the browser by the Web Speech API — nothing leaves your device except the text transcript sent to the AI. In Stage 2+, audio is sent to Whisper for transcription and immediately discarded.

**Q: Can I use this for other Sanskrit texts, not just Gita?**  
A: The AI feedback system works for any Sanskrit text. Just swap the shloka database. Upanishads, Yoga Sutras, and Hanuman Chalisa are on the v3.0 roadmap.

**Q: How accurate is the AI feedback?**  
A: The AI is highly accurate for common errors (vowel length, retroflex consonants). For very subtle sandhi rules or advanced recitation styles (Vedic pitch accents), it may miss nuances. Always cross-reference with a human guru for serious study.

---

## License

MIT — free to use, fork, modify, and distribute.

---

## Acknowledgements

- **Bhagavad Gita translations**: Swami Prabhupada (ISKCON), Swami Sivananda (DLS), Winthrop Sargeant
- **Sanskrit ASR**: AI4Bharat team, IIT Madras Speech Lab
- **Bhashini project**: MeitY India, for making Indian language AI publicly accessible
- **Design inspiration**: The rich visual tradition of Indian manuscript illumination

---

*ॐ तत् सत्*  
*"That is the Truth"*

*योगः कर्मसु कौशलम् — Yoga is skill in action. (Bhagavad Gita 2.50)*
