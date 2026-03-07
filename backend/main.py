"""
VaakSiddhi — FastAPI Backend
Uses Google Gemini API (FREE tier — no credit card needed!)

Setup:
    1. Go to https://aistudio.google.com/apikey
    2. Click "Create API Key" (Google account only — NO credit card)
    3. Create .env file:  GEMINI_API_KEY=your-key-here
    4. pip install -r requirements.txt
    5. uvicorn main:app --reload
"""

from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os, json, httpx, time, pathlib, random
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="VaakSiddhi API", version="2.0.0")

# ─────────────────────────────────────────────
# CORS
# ─────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://vaaksiddhi.vercel.app",
        "https://*.vercel.app",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# SIMPLE IN-MEMORY RATE LIMITER
# ─────────────────────────────────────────────
request_counts = defaultdict(list)
RATE_LIMIT = 15  # Gemini free tier: 15 RPM

def check_rate_limit(ip: str):
    now = time.time()
    request_counts[ip] = [t for t in request_counts[ip] if now - t < 60]
    if len(request_counts[ip]) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Rate limit exceeded (15/min). Try again in a minute.")
    request_counts[ip].append(now)

# ─────────────────────────────────────────────
# MODELS
# ─────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    expected_transliteration: str
    spoken_transcript: str
    shloka_english: str
    hard_sounds: Optional[list[str]] = []

class AnalyzeResponse(BaseModel):
    score: int
    grade: str
    overall: str
    praise: str
    mistakes: list[str]
    tips: list[str]
    phonetic_guide: dict
    sanskrit_rule: str
    encouragement: str

# ─────────────────────────────────────────────
# GEMINI API HELPER (FREE TIER)
# ─────────────────────────────────────────────
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

async def call_gemini(prompt: str, max_tokens: int = 1024) -> str:
    """Call Google Gemini API (free tier: 15 RPM, 1M tokens/day, no credit card)."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY not configured. Get free key at https://aistudio.google.com/apikey"
        )

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{GEMINI_API_URL}?key={api_key}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.7,
                    "maxOutputTokens": max_tokens,
                    "responseMimeType": "application/json"
                }
            }
        )

    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="Gemini rate limit hit. Free tier = 15 req/min. Wait and retry.")
    
    if response.status_code != 200:
        error_detail = response.text
        raise HTTPException(status_code=502, detail=f"Gemini API error ({response.status_code}): {error_detail[:200]}")

    data = response.json()
    try:
        candidates = data.get("candidates", [])
        if not candidates:
            raise HTTPException(status_code=502, detail="No response from Gemini")
        # Gemini 2.5 Flash may return multiple parts (thinking + response)
        # Find the last part with actual text content
        parts = candidates[0]["content"]["parts"]
        text = ""
        for part in parts:
            if "text" in part and part["text"].strip():
                text = part["text"]  # take the last non-empty text part
        if not text:
            raise HTTPException(status_code=502, detail="Empty response from Gemini")
        return text
    except (KeyError, IndexError) as e:
        raise HTTPException(status_code=502, detail=f"Unexpected Gemini response format: {e}")

# ─────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "app": "VaakSiddhi API",
        "version": "2.0.0",
        "status": "running",
        "ai_provider": "Google Gemini (free tier)",
        "docs": "/docs"
    }

@app.get("/health")
def health():
    has_key = bool(os.environ.get("GEMINI_API_KEY"))
    return {"status": "ok", "timestamp": time.time(), "gemini_configured": has_key}


@app.post("/api/analyze")
async def analyze_pronunciation(req: AnalyzeRequest, request: Request):
    """
    Main endpoint: takes expected transliteration + spoken transcript,
    returns AI pronunciation analysis via Google Gemini (free).
    """
    client_ip = request.client.host
    check_rate_limit(client_ip)
    print(f"[DEBUG] /api/analyze received spoken_transcript: '{req.spoken_transcript}' (len={len(req.spoken_transcript) if req.spoken_transcript else 0})")

    hard_sounds_text = f"\nKnown hard sounds in this verse: {', '.join(req.hard_sounds)}" if req.hard_sounds else ""

    prompt = f"""You are Guru Vaak — a Sanskrit phonetics expert specializing in Bhagavad Gita recitation.
A student is practicing Sanskrit shloka pronunciation. Analyze their attempt.

Expected (IAST transliteration): "{req.expected_transliteration}"
English meaning: "{req.shloka_english}"{hard_sounds_text}
Student said (speech-to-text): "{req.spoken_transcript or '— no speech detected —'}"

Compare what they said with the expected transliteration. Identify mispronounced words, missing words, 
and give actionable Sanskrit phonetics tips.

Return ONLY this JSON structure:
{{
  "score": <0-100 integer>,
  "grade": "<A+/A/B+/B/C+/C/D/F>",
  "overall": "<one sentence summary of their performance>",
  "praise": "<specific thing they did well>",
  "mistakes": ["<word/phrase - what went wrong and how to fix>", "...up to 5 mistakes"],
  "tips": ["<actionable tip 1>", "<actionable tip 2>", "<actionable tip 3>"],
  "phonetic_guide": {{"word": "<hardest word>", "breakdown": "<syllable-by-syllable guide>", "example": "<English approximation>"}},
  "sanskrit_rule": "<one interesting Sanskrit phonetics rule relevant to this verse>",
  "encouragement": "<motivational Sanskrit quote with translation>"
}}"""

    text = await call_gemini(prompt, max_tokens=8192)
    clean = text.replace("```json", "").replace("```", "").strip()

    try:
        result = json.loads(clean)
        required_fields = ["score", "grade", "overall", "praise", "mistakes", "tips",
                          "phonetic_guide", "sanskrit_rule", "encouragement"]
        for field in required_fields:
            if field not in result:
                result[field] = "" if field not in ["mistakes", "tips"] else []
        result["debug_transcript_received"] = req.spoken_transcript
        return result
    except json.JSONDecodeError as e:
        print(f"[ERROR] Failed to parse Gemini response as JSON: {e}")
        print(f"[ERROR] Raw text (first 500 chars): {clean[:500]}")
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response. Raw: {clean[:200]}")


@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...), request: Request = None):
    """
    Audio transcription — Stage 1 uses Web Speech API in browser (free).
    """
    return {
        "transcript": "",
        "message": "Use Web Speech API in browser for free transcription."
    }


@app.get("/api/daily-word")
async def daily_word(request: Request):
    """Returns a daily Sanskrit word. Uses Gemini or falls back to static list."""
    client_ip = request.client.host
    check_rate_limit(client_ip)

    fallback_words = [
        {"word": "कर्म", "transliteration": "karma", "meaning": "Action, duty, work", "usage": "Chapter 2, Verse 47"},
        {"word": "धर्म", "transliteration": "dharma", "meaning": "Righteousness, duty, cosmic law", "usage": "Chapter 1, Verse 1"},
        {"word": "योग", "transliteration": "yoga", "meaning": "Union, discipline, connection", "usage": "Chapter 2, Verse 48"},
        {"word": "ज्ञान", "transliteration": "jñāna", "meaning": "Knowledge, wisdom", "usage": "Chapter 4, Verse 38"},
        {"word": "भक्ति", "transliteration": "bhakti", "meaning": "Devotion, love", "usage": "Chapter 12, Verse 1"},
        {"word": "आत्मा", "transliteration": "ātmā", "meaning": "Soul, true self", "usage": "Chapter 2, Verse 20"},
        {"word": "प्रज्ञा", "transliteration": "prajñā", "meaning": "Wisdom, intelligence", "usage": "Chapter 2, Verse 55"},
        {"word": "शान्ति", "transliteration": "śānti", "meaning": "Peace, tranquility", "usage": "Chapter 2, Verse 66"},
        {"word": "सत्त्व", "transliteration": "sattva", "meaning": "Purity, goodness", "usage": "Chapter 14, Verse 6"},
        {"word": "मोक्ष", "transliteration": "mokṣa", "meaning": "Liberation, freedom", "usage": "Chapter 18, Verse 66"},
        {"word": "प्रसाद", "transliteration": "prasāda", "meaning": "Grace, serenity, clarity", "usage": "Chapter 2, Verse 64"},
        {"word": "विवेक", "transliteration": "viveka", "meaning": "Discernment, discrimination", "usage": "Chapter 2, Verse 63"},
        {"word": "अभ्यास", "transliteration": "abhyāsa", "meaning": "Practice, repeated effort", "usage": "Chapter 6, Verse 35"},
        {"word": "वैराग्य", "transliteration": "vairāgya", "meaning": "Detachment, dispassion", "usage": "Chapter 6, Verse 35"},
        {"word": "समत्व", "transliteration": "samatva", "meaning": "Equanimity, evenness", "usage": "Chapter 2, Verse 48"},
    ]

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        day_index = int(time.time() // 86400) % len(fallback_words)
        return fallback_words[day_index]

    try:
        prompt = """Give me one beautiful Sanskrit word from the Bhagavad Gita. 
Pick something meaningful and not too common.
Return ONLY this JSON:
{"word": "<in Devanagari>", "transliteration": "<IAST>", "meaning": "<English meaning>", "usage": "<which chapter/verse>"}"""

        text = await call_gemini(prompt, max_tokens=200)
        clean = text.replace("```json", "").replace("```", "").strip()
        return json.loads(clean)
    except Exception:
        day_index = int(time.time() // 86400) % len(fallback_words)
        return fallback_words[day_index]


@app.get("/api/shlokas")
def get_shlokas(chapter: Optional[int] = None, difficulty: Optional[str] = None):
    """Returns shloka metadata from the JSON database."""
    try:
        data_path = pathlib.Path(__file__).parent.parent / "src" / "data" / "shlokas.json"
        if not data_path.exists():
            data_path = pathlib.Path(__file__).parent / "shlokas.json"
        with open(data_path, encoding='utf-8') as f:
            shlokas = json.load(f)
        if chapter:
            shlokas = [s for s in shlokas if s["chapter"] == chapter]
        if difficulty:
            shlokas = [s for s in shlokas if s["difficulty"] == difficulty]
        return {"shlokas": shlokas, "count": len(shlokas)}
    except FileNotFoundError:
        return {"shlokas": [], "count": 0, "note": "Run: python scripts/fetch_shlokas.py"}


@app.get("/api/chapters")
def get_chapters():
    """Returns chapter metadata — name, verse count, theme."""
    chapters = [
        {"chapter": 1, "name": "Arjuna Vishada Yoga", "verses": 47, "theme": "Arjuna's Dilemma"},
        {"chapter": 2, "name": "Sankhya Yoga", "verses": 72, "theme": "The Yoga of Knowledge"},
        {"chapter": 3, "name": "Karma Yoga", "verses": 43, "theme": "The Yoga of Action"},
        {"chapter": 4, "name": "Jnana Karma Sanyasa Yoga", "verses": 42, "theme": "Knowledge & Renunciation of Action"},
        {"chapter": 5, "name": "Karma Sanyasa Yoga", "verses": 29, "theme": "The Yoga of Renunciation"},
        {"chapter": 6, "name": "Dhyana Yoga", "verses": 47, "theme": "The Yoga of Meditation"},
        {"chapter": 7, "name": "Jnana Vijnana Yoga", "verses": 30, "theme": "Knowledge & Realization"},
        {"chapter": 8, "name": "Aksara Brahma Yoga", "verses": 28, "theme": "The Imperishable Brahman"},
        {"chapter": 9, "name": "Raja Vidya Raja Guhya Yoga", "verses": 34, "theme": "The Royal Secret"},
        {"chapter": 10, "name": "Vibhuti Yoga", "verses": 42, "theme": "Divine Manifestations"},
        {"chapter": 11, "name": "Vishwarupa Darshana Yoga", "verses": 55, "theme": "The Cosmic Vision"},
        {"chapter": 12, "name": "Bhakti Yoga", "verses": 20, "theme": "The Yoga of Devotion"},
        {"chapter": 13, "name": "Kshetra Kshetrajna Vibhaga Yoga", "verses": 35, "theme": "The Field & Knower"},
        {"chapter": 14, "name": "Gunatraya Vibhaga Yoga", "verses": 27, "theme": "The Three Gunas"},
        {"chapter": 15, "name": "Purushottama Yoga", "verses": 20, "theme": "The Supreme Person"},
        {"chapter": 16, "name": "Daivasura Sampad Vibhaga Yoga", "verses": 24, "theme": "Divine & Demoniac Natures"},
        {"chapter": 17, "name": "Shraddhatraya Vibhaga Yoga", "verses": 28, "theme": "The Three Divisions of Faith"},
        {"chapter": 18, "name": "Moksha Sanyasa Yoga", "verses": 78, "theme": "Liberation Through Renunciation"},
    ]
    return {"chapters": chapters, "total_verses": 700}
