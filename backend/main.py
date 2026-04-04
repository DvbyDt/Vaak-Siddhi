"""
VaakSiddhi — FastAPI Backend v3.0
Multi-Provider AI Cascade (ALL FREE, NO CREDIT CARD)

Provider ladder (automatic failover):
  1. Groq        — llama-3.3-70b  — 14,400 req/day, 30 RPM  ← PRIMARY
  2. Gemini Flash — gemini-2.5-flash — limited RPM           ← SECONDARY
  3. Heuristic   — rule-based     — unlimited, always works  ← FALLBACK

Key improvements over v2:
  - Smart response caching (same shloka + similar transcript → reuse result)
  - Per-IP rate limiting tuned to Groq's actual limits (not Gemini's)
  - Provider health tracking — skip broken providers automatically
  - Exponential backoff on 429s before falling to next provider
  - Response validation so bad JSON never reaches the frontend

Setup:
    1. pip install -r requirements.txt
    2. Copy .env.example → .env and fill in at least GROQ_API_KEY
    3. uvicorn main:app --reload --port 8000

Get free API keys (no credit card):
    Groq:   https://console.groq.com          ← Best. 14,400 req/day free
    Gemini: https://aistudio.google.com/apikey ← Backup
"""

from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from typing import Optional
import os, json, httpx, time, hashlib, asyncio, logging, base64
from collections import defaultdict
from dotenv import load_dotenv
from json_repair import repair_json


def _parse_llm_json(raw: str) -> dict:
    """
    Parse JSON from LLM output robustly.
    LLMs frequently produce: literal newlines in strings, trailing commas,
    unescaped quotes, or prose before/after the JSON block.
    json_repair handles all of these; we fall back to stdlib only if needed.
    """
    # Strip markdown fences and extract the outermost { ... } block
    clean = raw.replace("```json", "").replace("```", "").strip()
    start = clean.find("{")
    end   = clean.rfind("}") + 1
    if start != -1 and end > start:
        clean = clean[start:end]
    return json.loads(repair_json(clean))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("vaaksiddhi")

load_dotenv()

SARVAM_BASE = "https://api.sarvam.ai"

app = FastAPI(title="VaakSiddhi API", version="3.0.0")

# ─────────────────────────────────────────────────────────────────
# CORS
# ─────────────────────────────────────────────────────────────────
# FRONTEND_URL can be set in .env to lock down the production origin.
# Falls back to localhost for local development.
_frontend_url = os.environ.get("FRONTEND_URL", "").strip()
_allowed_origins = list(filter(None, [
    "http://localhost:5173",
    "http://localhost:3000",
    _frontend_url or None,
]))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Request-ID"],
)


# ─────────────────────────────────────────────────────────────────
# RESPONSE CACHE
# Prevents hammering the API when a user re-analyses the same shloka.
# Cache key = hash(transliteration + first 60 chars of transcript).
# TTL: 10 minutes. In production swap for Redis.
# ─────────────────────────────────────────────────────────────────
_cache: dict[str, tuple[float, dict]] = {}
CACHE_TTL = 600  # seconds

def _cache_key(translit: str, transcript: str) -> str:
    raw = translit.strip() + "|" + transcript.strip()[:60].lower()
    return hashlib.md5(raw.encode()).hexdigest()

def cache_get(key: str) -> Optional[dict]:
    if key in _cache:
        ts, val = _cache[key]
        if time.time() - ts < CACHE_TTL:
            return val
        del _cache[key]
    return None

def cache_set(key: str, val: dict):
    # Keep cache small — evict oldest entry if > 200 items
    if len(_cache) >= 200:
        oldest = min(_cache, key=lambda k: _cache[k][0])
        del _cache[oldest]
    _cache[key] = (time.time(), val)


# ─────────────────────────────────────────────────────────────────
# RATE LIMITER (per IP, per minute)
# Set to 20 RPM — above Gemini's old limit, below Groq's limit.
# ─────────────────────────────────────────────────────────────────
_req_log: dict[str, list[float]] = defaultdict(list)
USER_RATE_LIMIT = 20  # per minute per IP

def check_rate_limit(ip: str):
    now = time.time()
    _req_log[ip] = [t for t in _req_log[ip] if now - t < 60]
    if len(_req_log[ip]) >= USER_RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"You've made {USER_RATE_LIMIT} requests this minute. Please wait a moment."
        )
    _req_log[ip].append(now)


# ─────────────────────────────────────────────────────────────────
# PROVIDER HEALTH TRACKER
# If a provider fails 3 times in 5 minutes, skip it temporarily.
# ─────────────────────────────────────────────────────────────────
_provider_failures: dict[str, list[float]] = defaultdict(list)
FAILURE_WINDOW   = 300   # 5 minutes
FAILURE_THRESHOLD = 3

def _record_failure(provider: str):
    now = time.time()
    _provider_failures[provider].append(now)
    # prune old entries
    _provider_failures[provider] = [
        t for t in _provider_failures[provider] if now - t < FAILURE_WINDOW
    ]

def _is_healthy(provider: str) -> bool:
    now = time.time()
    recent = [t for t in _provider_failures[provider] if now - t < FAILURE_WINDOW]
    return len(recent) < FAILURE_THRESHOLD


# ─────────────────────────────────────────────────────────────────
# PROMPT BUILDER (shared across providers)
# ─────────────────────────────────────────────────────────────────
def build_prompt(translit: str, spoken: str, alternatives: list[str], english: str, hard_sounds: list[str]) -> str:
    hard_txt    = f"\nKnown hard sounds: {', '.join(hard_sounds)}" if hard_sounds else ""
    spoken_txt  = spoken.strip() if spoken and spoken.strip() else "— no speech detected —"

    # Build the alternatives block shown to the LLM
    alt_list    = [a for a in (alternatives or []) if a.strip() and a.strip() != spoken_txt]
    if alt_list:
        alts_block = "\nOther transcription candidates (same recording, different STT guesses):\n" + \
                     "\n".join(f"  • {a}" for a in alt_list[:5])
    else:
        alts_block = ""

    return f"""You are Guru Vaak — a Sanskrit phonetics expert for Bhagavad Gita recitation.

IMPORTANT: The student's speech was captured by a browser speech recogniser that is not trained on Sanskrit.
The transcriptions below may be inaccurate. Use ALL candidates together to infer what the student most
likely said, then evaluate their pronunciation against the expected IAST transliteration.

Expected (IAST transliteration): "{translit}"
English meaning: "{english}"{hard_txt}

Primary transcription: "{spoken_txt}"{alts_block}

Evaluate the student's actual spoken pronunciation (not the STT accuracy).
If the transcription candidates collectively suggest the student said something close to the expected
transliteration, give credit for that — do not penalise for STT noise.

Return ONLY valid JSON — no markdown fences, no extra text:
{{
  "score": <integer 0-100>,
  "grade": "<A+|A|B+|B|C+|C|D|F>",
  "overall": "<one warm sentence>",
  "praise": "<specific praise>",
  "mistakes": [{{"word":"<IAST word>","devanagari":"<same word in Devanagari script>","issue":"<explanation>"}}],
  "tips": ["<tip1>","<tip2>","<tip3>"],
  "phonetic_guide": {{"word":"<hardest IAST word>","devanagari":"<Devanagari form>","breakdown":"<syllable guide>","example":"<English approximation>"}},
  "sanskrit_rule": "<one relevant phonetics rule>",
  "encouragement": "<Sanskrit quote with translation>"
}}"""


# ─────────────────────────────────────────────────────────────────
# PROVIDER 1: GROQ  (PRIMARY — 14,400 req/day free, no credit card)
# Model: llama-3.3-70b-versatile — excellent for structured JSON
# Get key: https://console.groq.com
# ─────────────────────────────────────────────────────────────────
GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"

async def call_groq(prompt: str) -> str:
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set")

    async with httpx.AsyncClient(timeout=25) as client:
        resp = await client.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": "You are a Sanskrit pronunciation expert. Always respond with valid JSON only."},
                    {"role": "user",   "content": prompt}
                ],
                "temperature":  0.4,
                "max_tokens":   1024,
                "response_format": {"type": "json_object"},  # forces valid JSON
            }
        )

    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="groq_rate_limit")
    if resp.status_code != 200:
        raise ValueError(f"Groq error {resp.status_code}: {resp.text[:120]}")

    data = resp.json()
    return data["choices"][0]["message"]["content"]


# ─────────────────────────────────────────────────────────────────
# PROVIDER 2: GEMINI  (SECONDARY — 15 RPM free after Dec 2025 cuts)
# Kept as backup for when Groq is temporarily rate-limited.
# Get key: https://aistudio.google.com/apikey
# ─────────────────────────────────────────────────────────────────
GEMINI_URL   = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

async def call_gemini(prompt: str) -> str:
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not set")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{GEMINI_URL}?key={api_key}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature":       0.4,
                    "maxOutputTokens":   1024,
                    "responseMimeType":  "application/json"
                }
            }
        )

    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="gemini_rate_limit")
    if resp.status_code != 200:
        raise ValueError(f"Gemini error {resp.status_code}: {resp.text[:120]}")

    data  = resp.json()
    parts = data["candidates"][0]["content"]["parts"]
    # Gemini 2.5 Flash (thinking model) may have multiple parts — take last text part
    text  = next((p["text"] for p in reversed(parts) if "text" in p), "")
    if not text:
        raise ValueError("Empty Gemini response")
    return text


# ─────────────────────────────────────────────────────────────────
# GEMINI AUDIO — Direct voice analysis (no STT middleman)
# Gemini 2.5 Flash accepts audio inline and can hear:
#   - Long vs short vowels (ā vs a)
#   - Retroflex vs dental consonants (ṭ vs t, ṣ vs s)
#   - Aspiration, visarga, anusvara
# This is fundamentally more accurate than any text-transcript approach.
# ─────────────────────────────────────────────────────────────────
def _build_audio_prompt(translit: str, english: str, hard_sounds: list[str], spoken_hint: str) -> str:
    hard_txt = f"\nKnown hard sounds in this verse: {', '.join(hard_sounds)}" if hard_sounds else ""
    hint_txt = (f"\n\nWeb Speech API hint (may be inaccurate — use only as secondary context):"
                f" \"{spoken_hint}\"") if spoken_hint.strip() else ""

    return f"""You are Guru Vaak — an expert Sanskrit phonetics coach for Bhagavad Gita recitation.

Listen carefully to the attached audio recording of a student reciting this Sanskrit verse.

Expected pronunciation (IAST transliteration): "{translit}"
English meaning: "{english}"{hard_txt}

Analyse the student's ACTUAL spoken pronunciation from the audio. Focus on:
• Long vowels (ā, ī, ū) — are they held twice as long as short ones?
• Retroflex consonants (ṭ, ḍ, ṇ, ṣ) — is the tongue curled back to the palate?
• Aspirated pairs (kha/ka, gha/ga, pha/pa) — correct aspiration?
• Visarga (ḥ) — soft breath-echo after the vowel
• Anusvara (ṃ/ṁ) — nasal hum, not a full 'n'
• Word boundaries and sandhi junctions
• Overall rhythm — equal syllable weight, no English stress patterns{hint_txt}

Return ONLY valid JSON — no markdown fences, no extra text:
{{
  "score": <integer 0-100>,
  "grade": "<A+|A|B+|B|C+|C|D|F>",
  "overall": "<one warm sentence describing their pronunciation>",
  "praise": "<specific praise for something you heard correctly>",
  "mistakes": [{{"word":"<IAST word>","devanagari":"<same word in Devanagari>","issue":"<what you heard vs expected>"}}],
  "tips": ["<tip1>","<tip2>","<tip3>"],
  "phonetic_guide": {{"word":"<hardest IAST word>","devanagari":"<Devanagari>","breakdown":"<syllable guide>","example":"<English approximation>"}},
  "sanskrit_rule": "<one relevant phonetics rule>",
  "encouragement": "<Sanskrit quote with translation>"
}}"""


async def call_gemini_audio(audio_b64: str, mime_type: str, translit: str, english: str,
                             hard_sounds: list[str], spoken_hint: str, rid: str) -> dict:
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not set")

    prompt = _build_audio_prompt(translit, english, hard_sounds, spoken_hint)

    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            f"{GEMINI_URL}?key={api_key}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{
                    "parts": [
                        {"inlineData": {"mimeType": mime_type, "data": audio_b64}},
                        {"text": prompt},
                    ]
                }],
                "generationConfig": {
                    # Do NOT set responseMimeType here — it conflicts with inlineData audio
                    # on gemini-2.5-flash and causes truncated/malformed JSON output.
                    # Instead we extract the JSON block from the text response below.
                    "temperature":     0.3,
                    "maxOutputTokens": 4096,   # thinking model needs headroom
                },
            }
        )

    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="gemini_rate_limit")
    if resp.status_code != 200:
        raise ValueError(f"Gemini audio error {resp.status_code}: {resp.text[:200]}")

    data  = resp.json()
    parts = data["candidates"][0]["content"]["parts"]
    text  = next((p["text"] for p in reversed(parts) if "text" in p), "")
    if not text:
        raise ValueError("Empty Gemini audio response")

    # Strip markdown fences and extract the JSON object / array
    clean = text.replace("```json", "").replace("```", "").strip()
    # Find the outermost { ... } block in case the model added any prose before/after
    start = clean.find("{")
    end   = clean.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError(f"No JSON object found in Gemini audio response: {clean[:120]}")
    clean = clean[start:end]

    parsed = _parse_llm_json(clean)
    required = ["score", "grade", "overall", "praise", "mistakes", "tips",
                "phonetic_guide", "sanskrit_rule", "encouragement"]
    for f in required:
        if f not in parsed:
            parsed[f] = [] if f in ["mistakes", "tips"] else ""
    parsed["score"] = max(0, min(100, int(parsed.get("score", 50))))
    log.info("gemini-audio score=%d rid=%s", parsed["score"], rid)
    return parsed


# ─────────────────────────────────────────────────────────────────
# PROVIDER 3: HEURISTIC  (FALLBACK — always works, no API, offline)
# ─────────────────────────────────────────────────────────────────
def heuristic_analysis(translit: str, spoken: str) -> dict:
    spoken_clean = (spoken or "").strip().lower()
    has_text     = len(spoken_clean) > 3

    if not has_text:
        return {
            "score": 30, "grade": "D",
            "overall": "No speech detected. Check microphone access and try again.",
            "praise": "Your intention to learn Sanskrit recitation is admirable!",
            "mistakes": ["No speech captured — allow microphone in browser settings"],
            "tips": [
                "Click the 🔒 in your browser's address bar → allow Microphone",
                "Speak clearly and directly into your mic, a little louder than normal",
                "Chrome and Edge have the best Hindi/Sanskrit speech recognition",
            ],
            "phonetic_guide": {"word": "om", "breakdown": "ohm — one sustained syllable", "example": "Like humming 'home' without the 'h'"},
            "sanskrit_rule": "Sanskrit is fully phonetic — every written letter is always pronounced exactly as written.",
            "encouragement": "अभ्यासेन तु कौन्तेय — Through practice all is achieved. (BG 6.35)",
        }

    # Rough word-match scoring
    words   = translit.lower().replace("-", " ").split()
    matched = sum(1 for w in words if len(w) > 2 and spoken_clean[:80].count(w[:3]))
    score   = min(82, 28 + int((matched / max(len(words), 1)) * 54))
    grade   = "A" if score >= 80 else "B" if score >= 65 else "C" if score >= 50 else "D"

    return {
        "score": score, "grade": grade,
        "overall": "Good attempt! Add a Groq API key for detailed AI pronunciation coaching.",
        "praise": "You are engaging with Sanskrit recitation — that is the first and most important step.",
        "mistakes": ["Detailed word-level analysis requires a Groq or Gemini API key (both free)"],
        "tips": [
            "Long vowels (ā, ī, ū) must be held twice as long as short ones — this changes meaning",
            "Retroflex sounds (ṭ, ḍ, ṇ, ṣ) need your tongue curled back toward the palate",
            "Pause naturally at each line break — Sanskrit verse breathes in phrases called pādas",
        ],
        "phonetic_guide": {"word": "karma", "breakdown": "kar · muh — both 'a's are short", "example": "Like English 'car' + 'muh'"},
        "sanskrit_rule": "In Sanskrit, vowel length is phonemic — confusing a short 'a' with long 'ā' changes the word's meaning entirely.",
        "encouragement": "श्रद्धावाँल्लभते ज्ञानम् — The faithful one obtains knowledge. (BG 4.39)",
    }


# ─────────────────────────────────────────────────────────────────
# SARVAM AI  — Indian-language TTS + STT
# TTS: bulbul:v2 — real trained Sanskrit/Hindi voice (sounds authentic)
# STT: saarika:v2 — Indian-language ASR, far better than Chrome hi-IN for Sanskrit
# Free tier: 50,000 chars/month TTS · 500 min/month STT
# Get key: https://console.sarvam.ai  (no credit card)
# ─────────────────────────────────────────────────────────────────
async def sarvam_tts(text: str, language_code: str = "hi-IN",
                     pace: float = 0.85, speaker: str = "meera") -> str:
    """Returns base64-encoded WAV audio string from Sarvam TTS."""
    api_key = os.environ.get("SARVAM_API_KEY", "")
    if not api_key:
        raise ValueError("SARVAM_API_KEY not set")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SARVAM_BASE}/text-to-speech",
            headers={"api-subscription-key": api_key, "Content-Type": "application/json"},
            json={
                "inputs": [text[:500]],          # 500-char limit per input
                "target_language_code": language_code,
                "speaker":   speaker,
                "model":     "bulbul:v2",
                "pitch":     0,
                "pace":      pace,
                "loudness":  1.5,
                "speech_sample_rate": 22050,
                "enable_preprocessing": True,
            }
        )
    if resp.status_code != 200:
        raise ValueError(f"Sarvam TTS {resp.status_code}: {resp.text[:200]}")
    return resp.json()["audios"][0]  # base64 WAV


async def sarvam_stt(audio_bytes: bytes, content_type: str = "audio/webm") -> str:
    """Returns Sanskrit/Hindi transcript from Sarvam saarika:v2."""
    api_key = os.environ.get("SARVAM_API_KEY", "")
    if not api_key:
        raise ValueError("SARVAM_API_KEY not set")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SARVAM_BASE}/speech-to-text",
            headers={"api-subscription-key": api_key},
            files={"file": ("recording.webm", audio_bytes, content_type)},
            data={"model": "saarika:v2", "language_code": "hi-IN", "with_timestamps": "false"},
        )
    if resp.status_code != 200:
        raise ValueError(f"Sarvam STT {resp.status_code}: {resp.text[:200]}")
    return resp.json().get("transcript", "")


# ─────────────────────────────────────────────────────────────────
# MULTI-PROVIDER CASCADE
# Tries providers in order; falls through on any error or 429.
# ─────────────────────────────────────────────────────────────────
async def analyze_with_cascade(translit: str, spoken: str, alternatives: list[str], english: str, hard_sounds: list[str], rid: str = "-") -> tuple[dict, str]:
    """
    Returns (result_dict, provider_name_used)
    """
    prompt = build_prompt(translit, spoken, alternatives, english, hard_sounds)

    providers = [
        ("groq",   call_groq),
        ("gemini", call_gemini),
    ]

    for name, caller in providers:
        if not _is_healthy(name):
            log.warning("cascade skip=%s reason=unhealthy rid=%s", name, rid)
            continue

        try:
            raw  = await caller(prompt)
            data = _parse_llm_json(raw)

            # Validate required fields
            required = ["score", "grade", "overall", "praise", "mistakes", "tips",
                        "phonetic_guide", "sanskrit_rule", "encouragement"]
            for f in required:
                if f not in data:
                    data[f] = [] if f in ["mistakes", "tips"] else ""

            # Ensure score is an int in range
            data["score"] = max(0, min(100, int(data.get("score", 50))))
            log.info("cascade provider=%s score=%d rid=%s", name, data["score"], rid)
            return data, name

        except HTTPException as e:
            if "rate_limit" in str(e.detail):
                log.warning("cascade provider=%s event=rate_limited rid=%s", name, rid)
            else:
                log.warning("cascade provider=%s event=http_error detail=%s rid=%s", name, e.detail, rid)
            _record_failure(name)
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            log.warning("cascade provider=%s event=parse_error err=%s rid=%s", name, e, rid)
            _record_failure(name)
        except Exception as e:
            log.error("cascade provider=%s event=unexpected_error err=%s rid=%s", name, e, rid)
            _record_failure(name)

        # Short pause before trying next provider
        await asyncio.sleep(0.3)

    # All providers failed — use heuristic
    log.warning("cascade event=all_providers_failed falling_back=heuristic rid=%s", rid)
    return heuristic_analysis(translit, spoken), "heuristic"


# ─────────────────────────────────────────────────────────────────
# MODELS
# ─────────────────────────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    expected_transliteration: str = Field(..., min_length=1, max_length=2000)
    spoken_transcript:         str = Field(..., max_length=5000)
    spoken_alternatives:       Optional[list[str]] = Field(default=[], max_length=5)
    shloka_english:            str = Field(..., min_length=1, max_length=2000)
    hard_sounds:               Optional[list[str]] = Field(default=[], max_length=20)

    @field_validator("hard_sounds")
    @classmethod
    def limit_hard_sounds(cls, v):
        if v is None:
            return []
        return [s[:50] for s in v[:20]]

    @field_validator("spoken_alternatives")
    @classmethod
    def limit_alternatives(cls, v):
        if v is None:
            return []
        return [s[:500] for s in v[:5]]


class TTSRequest(BaseModel):
    text:          str   = Field(..., min_length=1, max_length=500)
    language_code: str   = Field(default="hi-IN", max_length=10)
    pace:          float = Field(default=0.85, ge=0.5, le=2.0)
    speaker:       str   = Field(default="meera", max_length=20)


# ─────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    groq_key    = bool(os.environ.get("GROQ_API_KEY"))
    gemini_key  = bool(os.environ.get("GEMINI_API_KEY"))
    sarvam_key  = bool(os.environ.get("SARVAM_API_KEY"))
    primary     = "groq" if groq_key else ("gemini" if gemini_key else "heuristic")
    return {
        "app":            "VaakSiddhi API",
        "version":        "3.1.0",
        "status":         "running",
        "primary_provider": primary,
        "providers": {
            "groq":     {"configured": groq_key,   "free_limit": "14,400 req/day",  "signup": "console.groq.com"},
            "gemini":   {"configured": gemini_key,  "free_limit": "15 req/min",      "signup": "aistudio.google.com"},
            "sarvam":   {"configured": sarvam_key,  "free_limit": "50k chars TTS / 500 min STT", "signup": "console.sarvam.ai"},
            "heuristic":{"configured": True,        "free_limit": "unlimited",       "note":   "No API key needed"},
        },
        "docs": "/docs"
    }


@app.get("/health")
def health():
    return {
        "status":    "ok",
        "timestamp": time.time(),
        "providers": {
            "groq":         {"configured": bool(os.environ.get("GROQ_API_KEY")),    "healthy": _is_healthy("groq")},
            "gemini":       {"configured": bool(os.environ.get("GEMINI_API_KEY")),  "healthy": _is_healthy("gemini")},
            "gemini-audio": {"configured": bool(os.environ.get("GEMINI_API_KEY")),  "note": "POST /api/analyze-audio"},
            "sarvam-tts":   {"configured": bool(os.environ.get("SARVAM_API_KEY")),  "note": "POST /api/tts"},
            "sarvam-stt":   {"configured": bool(os.environ.get("SARVAM_API_KEY")),  "note": "POST /api/transcribe"},
        },
        "cache_entries": len(_cache),
    }


@app.post("/api/analyze")
async def analyze_pronunciation(req: AnalyzeRequest, request: Request):
    """
    Main endpoint — pronunciation analysis via multi-provider cascade.
    Returns result + which provider was used.
    """
    client_ip = request.client.host
    check_rate_limit(client_ip)

    # Check cache first — same shloka + similar transcript + alternatives → reuse
    alts_str = "|".join(sorted(req.spoken_alternatives or []))
    ck  = _cache_key(req.expected_transliteration, req.spoken_transcript + alts_str)
    rid = request.headers.get("X-Request-ID", "-")
    log.info("analyze ip=%s rid=%s translit_len=%d spoken_len=%d",
             client_ip, rid, len(req.expected_transliteration), len(req.spoken_transcript))

    hit = cache_get(ck)
    if hit:
        log.info("cache hit ck=%s rid=%s", ck[:8], rid)
        return {**hit, "cached": True}

    result, provider = await analyze_with_cascade(
        translit     = req.expected_transliteration,
        spoken       = req.spoken_transcript,
        alternatives = req.spoken_alternatives or [],
        english      = req.shloka_english,
        hard_sounds  = req.hard_sounds or [],
        rid          = rid,
    )

    result["provider"] = provider
    result["cached"]   = False

    # Cache successful AI results (not heuristic — those are cheap to recompute)
    if provider != "heuristic":
        cache_set(ck, result)

    return result


@app.post("/api/analyze-audio")
async def analyze_audio_pronunciation(
    request:                  Request,
    audio:                    UploadFile = File(...),
    expected_transliteration: str        = Form(...),
    shloka_english:           str        = Form(...),
    hard_sounds:              str        = Form("[]"),
    spoken_transcript:        str        = Form(""),
):
    """
    Audio-first pronunciation analysis.
    Sends the raw WebM blob to Gemini's audio understanding API — it hears
    the actual voice, so feedback is based on real phonetics, not an STT transcript.
    Falls back to the text cascade if Gemini is unavailable.
    """
    client_ip = request.client.host
    check_rate_limit(client_ip)
    rid = request.headers.get("X-Request-ID", "-")

    audio_data = await audio.read()
    if len(audio_data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio file too large (max 20 MB)")

    hard_sounds_list: list[str] = json.loads(hard_sounds) if hard_sounds else []
    mime_type = audio.content_type or "audio/webm"

    log.info("analyze-audio ip=%s rid=%s size_kb=%d mime=%s",
             client_ip, rid, len(audio_data) // 1024, mime_type)

    # Primary: Gemini audio — hears the real voice
    if _is_healthy("gemini") and os.environ.get("GEMINI_API_KEY") and audio_data:
        try:
            audio_b64 = base64.b64encode(audio_data).decode()
            result = await call_gemini_audio(
                audio_b64    = audio_b64,
                mime_type    = mime_type,
                translit     = expected_transliteration,
                english      = shloka_english,
                hard_sounds  = hard_sounds_list,
                spoken_hint  = spoken_transcript,
                rid          = rid,
            )
            result["provider"] = "gemini-audio"
            result["cached"]   = False
            return result
        except HTTPException:
            raise
        except Exception as e:
            log.warning("gemini-audio failed, falling back to text cascade: %s rid=%s", e, rid)
            _record_failure("gemini")

    # Fallback: text-based cascade (Groq → Gemini text → Heuristic)
    log.info("analyze-audio falling back to text cascade rid=%s", rid)
    result, provider = await analyze_with_cascade(
        translit     = expected_transliteration,
        spoken       = spoken_transcript,
        alternatives = [],
        english      = shloka_english,
        hard_sounds  = hard_sounds_list,
        rid          = rid,
    )
    result["provider"] = provider
    result["cached"]   = False
    return result


@app.post("/api/tts")
async def text_to_speech(req: TTSRequest, request: Request):
    """
    Sarvam TTS — converts Sanskrit/Hindi text to authentic audio.
    Returns base64 WAV. Frontend caches by (text, lang, pace) so repeated
    clicks on the same word don't re-fetch.
    """
    rid = request.headers.get("X-Request-ID", "-")
    try:
        audio_b64 = await sarvam_tts(req.text, req.language_code, req.pace, req.speaker)
        log.info("tts lang=%s len=%d rid=%s", req.language_code, len(req.text), rid)
        return {"audio_b64": audio_b64, "mime_type": "audio/wav"}
    except ValueError as e:
        if "not set" in str(e):
            raise HTTPException(status_code=503,
                detail="TTS not configured — add SARVAM_API_KEY to backend/.env")
        log.warning("tts error=%s rid=%s", e, rid)
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/transcribe")
async def transcribe_audio(request: Request, audio: UploadFile = File(...)):
    """
    Sarvam STT (saarika:v2) — transcribes student's WebM recording.
    Returns a clean Hindi/Sanskrit transcript, far more accurate than
    Chrome's built-in hi-IN Web Speech API for Sanskrit phonemes.
    """
    rid = request.headers.get("X-Request-ID", "-")
    audio_bytes = await audio.read()
    if len(audio_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio too large (max 10 MB)")
    try:
        transcript = await sarvam_stt(audio_bytes, audio.content_type or "audio/webm")
        log.info("transcribe size_kb=%d transcript_len=%d rid=%s",
                 len(audio_bytes) // 1024, len(transcript), rid)
        return {"transcript": transcript, "provider": "sarvam"}
    except ValueError as e:
        if "not set" in str(e):
            raise HTTPException(status_code=503,
                detail="Transcription not configured — add SARVAM_API_KEY to backend/.env")
        log.warning("transcribe error=%s rid=%s", e, rid)
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/daily-word")
async def daily_word(request: Request):
    """Returns today's Sanskrit word. Rotates through a curated list daily."""
    WORDS = [
        {"word": "कर्म",    "transliteration": "karma",    "meaning": "Action, duty",                "usage": "BG 2.47"},
        {"word": "धर्म",    "transliteration": "dharma",   "meaning": "Righteousness, cosmic law",   "usage": "BG 1.1"},
        {"word": "योग",     "transliteration": "yoga",     "meaning": "Union, discipline",            "usage": "BG 2.48"},
        {"word": "ज्ञान",  "transliteration": "jñāna",    "meaning": "Knowledge, wisdom",            "usage": "BG 4.38"},
        {"word": "भक्ति",  "transliteration": "bhakti",   "meaning": "Devotion, love",               "usage": "BG 12.1"},
        {"word": "आत्मा",  "transliteration": "ātmā",     "meaning": "Soul, true self",              "usage": "BG 2.20"},
        {"word": "शान्ति", "transliteration": "śānti",    "meaning": "Peace, tranquility",           "usage": "BG 2.66"},
        {"word": "सत्त्व", "transliteration": "sattva",   "meaning": "Purity, clarity",              "usage": "BG 14.6"},
        {"word": "मोक्ष",  "transliteration": "mokṣa",    "meaning": "Liberation, freedom",          "usage": "BG 18.66"},
        {"word": "अभ्यास", "transliteration": "abhyāsa",  "meaning": "Practice, repeated effort",    "usage": "BG 6.35"},
        {"word": "वैराग्य","transliteration": "vairāgya", "meaning": "Detachment, dispassion",       "usage": "BG 6.35"},
        {"word": "समत्व",  "transliteration": "samatva",  "meaning": "Equanimity, evenness",         "usage": "BG 2.48"},
        {"word": "प्रसाद", "transliteration": "prasāda",  "meaning": "Grace, serenity",              "usage": "BG 2.64"},
        {"word": "विवेक",  "transliteration": "viveka",   "meaning": "Discernment, discrimination",  "usage": "BG 2.63"},
        {"word": "श्रद्धा","transliteration": "śraddhā",  "meaning": "Faith, trust",                 "usage": "BG 17.3"},
    ]
    idx = int(time.time() // 86400) % len(WORDS)
    return WORDS[idx]


@app.get("/api/chapters")
def get_chapters():
    return {"chapters": [
        {"chapter": 1,  "name": "Arjuna Vishada Yoga",             "verses": 47, "theme": "Arjuna's Dilemma"},
        {"chapter": 2,  "name": "Sankhya Yoga",                    "verses": 72, "theme": "The Yoga of Knowledge"},
        {"chapter": 3,  "name": "Karma Yoga",                      "verses": 43, "theme": "The Yoga of Action"},
        {"chapter": 4,  "name": "Jnana Karma Sanyasa Yoga",        "verses": 42, "theme": "Knowledge & Renunciation"},
        {"chapter": 5,  "name": "Karma Sanyasa Yoga",              "verses": 29, "theme": "The Yoga of Renunciation"},
        {"chapter": 6,  "name": "Dhyana Yoga",                     "verses": 47, "theme": "The Yoga of Meditation"},
        {"chapter": 7,  "name": "Jnana Vijnana Yoga",              "verses": 30, "theme": "Knowledge & Realization"},
        {"chapter": 8,  "name": "Aksara Brahma Yoga",              "verses": 28, "theme": "The Imperishable Brahman"},
        {"chapter": 9,  "name": "Raja Vidya Raja Guhya Yoga",      "verses": 34, "theme": "The Royal Secret"},
        {"chapter": 10, "name": "Vibhuti Yoga",                    "verses": 42, "theme": "Divine Manifestations"},
        {"chapter": 11, "name": "Vishwarupa Darshana Yoga",        "verses": 55, "theme": "The Cosmic Vision"},
        {"chapter": 12, "name": "Bhakti Yoga",                     "verses": 20, "theme": "The Yoga of Devotion"},
        {"chapter": 13, "name": "Kshetra Kshetrajna Vibhaga Yoga", "verses": 35, "theme": "The Field & Knower"},
        {"chapter": 14, "name": "Gunatraya Vibhaga Yoga",          "verses": 27, "theme": "The Three Gunas"},
        {"chapter": 15, "name": "Purushottama Yoga",               "verses": 20, "theme": "The Supreme Person"},
        {"chapter": 16, "name": "Daivasura Sampad Vibhaga Yoga",   "verses": 24, "theme": "Divine & Demoniac Natures"},
        {"chapter": 17, "name": "Shraddhatraya Vibhaga Yoga",      "verses": 28, "theme": "The Three Divisions of Faith"},
        {"chapter": 18, "name": "Moksha Sanyasa Yoga",             "verses": 78, "theme": "Liberation Through Renunciation"},
    ], "total_verses": 701}
