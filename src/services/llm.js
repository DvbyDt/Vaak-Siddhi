/**
 * llm.js — VaakSiddhi AI Service
 * Calls backend: Groq (primary) → Gemini (backup) → Heuristic (fallback)
 *
 * Accepts the same call signature as App.jsx uses:
 *   analyzePronunciation({ expectedTranslit, spokenText, shlokaEnglish, shlokaHardSounds })
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

function makeRequestId() {
  return `vs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * analyzePronunciation
 * Called from App.jsx as:
 *   analyzePronunciation({ expectedTranslit, spokenText, shlokaEnglish, shlokaHardSounds })
 */
export async function analyzePronunciation({ expectedTranslit, spokenText, spokenAlternatives = [], shlokaEnglish, shlokaHardSounds = [] }) {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-ID": makeRequestId() },
      body: JSON.stringify({
        expected_transliteration: expectedTranslit,
        spoken_transcript:        spokenText || "",
        spoken_alternatives:      spokenAlternatives.slice(0, 5), // cap at 5
        shloka_english:           shlokaEnglish,
        hard_sounds:              shlokaHardSounds || [],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (resp.status === 429) {
        throw new Error("Too many requests — please wait a moment and try again.");
      }
      console.error("[llm] Backend error:", resp.status, err);
      throw new Error(err.detail || `Server error ${resp.status}`);
    }

    return await resp.json();

  } catch (fetchErr) {
    if (fetchErr.name === "TypeError") {
      console.warn("[llm] Backend unreachable — using local fallback");
      return localFallback(spokenText);
    }
    throw fetchErr;
  }
}

/**
 * analyzePronunciationWithAudio
 * Sends the raw WebM audio blob to the backend, which forwards it to Gemini's
 * audio understanding API. Gemini hears the actual voice — no STT middleman.
 * Falls back to text-based analysis if the audio endpoint is unreachable.
 */
export async function analyzePronunciationWithAudio({ blob, expectedTranslit, spokenText, shlokaEnglish, shlokaHardSounds = [] }) {
  const rid = makeRequestId();
  try {
    const formData = new FormData();
    formData.append("audio", blob, "recording.webm");
    formData.append("expected_transliteration", expectedTranslit);
    formData.append("shloka_english", shlokaEnglish);
    formData.append("hard_sounds", JSON.stringify(shlokaHardSounds || []));
    formData.append("spoken_transcript", spokenText || "");

    // No Content-Type header — let browser set it with the multipart boundary
    const resp = await fetch(`${BACKEND_URL}/api/analyze-audio`, {
      method: "POST",
      headers: { "X-Request-ID": rid },
      body: formData,
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (resp.status === 429) throw new Error("Too many requests — please wait a moment and try again.");
      throw new Error(err.detail || `Server error ${resp.status}`);
    }

    return await resp.json();

  } catch (fetchErr) {
    if (fetchErr.name === "TypeError") {
      // Backend unreachable — fall back to text-based analysis
      console.warn("[llm] Audio backend unreachable — falling back to text analysis");
      return analyzePronunciation({ expectedTranslit, spokenText, shlokaEnglish, shlokaHardSounds });
    }
    throw fetchErr;
  }
}

export async function getDailyWord() {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/daily-word`);
    if (resp.ok) return await resp.json();
  } catch {}

  const words = [
    { word: "कर्म",    transliteration: "karma",  meaning: "Action, duty",      usage: "BG 2.47" },
    { word: "धर्म",    transliteration: "dharma", meaning: "Righteousness",     usage: "BG 1.1"  },
    { word: "योग",     transliteration: "yoga",   meaning: "Union, discipline", usage: "BG 2.48" },
    { word: "ज्ञान",  transliteration: "jñāna",  meaning: "Knowledge, wisdom", usage: "BG 4.38" },
    { word: "भक्ति",  transliteration: "bhakti", meaning: "Devotion, love",    usage: "BG 12.1" },
    { word: "आत्मा",  transliteration: "ātmā",   meaning: "Soul, true self",   usage: "BG 2.20" },
    { word: "शान्ति", transliteration: "śānti",  meaning: "Peace",             usage: "BG 2.66" },
  ];
  return words[Math.floor(Date.now() / 86400000) % words.length];
}

function localFallback(spoken) {
  const hasText = spoken && spoken.trim().length > 3;
  return {
    score:   hasText ? 45 : 30,
    grade:   hasText ? "C" : "D",
    overall: hasText
      ? "Backend offline. Run: cd backend && uvicorn main:app --reload"
      : "No speech detected. Check your microphone permissions.",
    praise: "Your dedication to learning Sanskrit is commendable!",
    mistakes: ["Backend not running — start it for full AI analysis"],
    tips: [
      "Long vowels (ā, ī, ū) must be held twice as long as short ones",
      "Retroflex sounds (ṭ, ḍ, ṇ) need your tongue curled back to the palate",
      "Pause at each line break — Sanskrit breathes in phrases called pādas",
    ],
    phonetic_guide: {
      word: "karma", breakdown: "kar · muh — both 'a's are short", example: "Like 'car' + 'ma'",
    },
    sanskrit_rule: "Sanskrit is perfectly phonetic — every written letter is always pronounced exactly as written.",
    encouragement: "अभ्यासेन तु कौन्तेय — Through practice, all is achieved. (BG 6.35)",
  };
}