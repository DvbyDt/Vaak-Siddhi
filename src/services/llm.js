/**
 * VaakSiddhi — LLM Service Abstraction Layer
 *
 * This module abstracts all LLM calls so that the provider
 * can be swapped in a single line (Groq → Claude → GPT-4o).
 *
 * All calls are routed through the FastAPI backend which holds
 * the API keys securely and handles rate limiting.
 *
 * Backend URL is configured via VITE_API_URL env var.
 * Defaults to http://localhost:8000 for local development.
 */

const API_BASE = import.meta.env.VITE_API_URL || "";

/**
 * Main pronunciation analysis function.
 * Sends expected transliteration + spoken transcript to the backend,
 * which proxies to Claude and returns structured JSON feedback.
 */
export async function analyzePronunciation({ expectedTranslit, spokenText, shlokaEnglish, shlokaHardSounds }) {
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expected_transliteration: expectedTranslit,
      spoken_transcript: spokenText || "",
      shloka_english: shlokaEnglish || "",
      hard_sounds: shlokaHardSounds || []
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`Backend error ${response.status}:`, detail);
    return getFallbackAnalysis(spokenText);
  }

  try {
    return await response.json();
  } catch {
    return getFallbackAnalysis(spokenText);
  }
}

/**
 * Generate a daily Sanskrit word of the day for the home screen.
 * Routed through the backend to keep API keys secure.
 */
export async function getDailyWord() {
  try {
    const response = await fetch(`${API_BASE}/api/daily-word`);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    return await response.json();
  } catch {
    return { word: "कर्म", transliteration: "karma", meaning: "Action, duty", usage: "Chapter 2, Verse 47" };
  }
}

/**
 * Offline/error fallback — always returns a useful response
 */
function getFallbackAnalysis(spokenText) {
  const hasText = spokenText && spokenText.trim().length > 5;
  return {
    score: hasText ? 65 : 40,
    grade: hasText ? "C+" : "D",
    overall: hasText
      ? "Good effort! AI analysis unavailable — check your connection for detailed feedback."
      : "Recording was unclear. Please try again in a quiet space.",
    praise: "You showed dedication by attempting the recitation. That is the first step!",
    mistakes: hasText
      ? ["Could not connect to AI analysis engine for specific feedback"]
      : ["No speech detected — ensure microphone permissions are granted"],
    tips: [
      "Focus on long vowels: ā (like 'father'), ī (like 'feel'), ū (like 'pool')",
      "Sanskrit retroflex sounds (ṭ, ḍ, ṇ) require tongue curled back to palate",
      "Pause briefly between each line (pāda) of the verse"
    ],
    phonetic_guide: {
      word: "karma",
      breakdown: "kar-muh — 'a' as in 'sun', not 'kar-maa'",
      example: "Similar to 'car' + 'muh'"
    },
    sanskrit_rule: "In Sanskrit, vowel length is phonemic — shortening a long vowel changes the word's meaning entirely.",
    encouragement: "अभ्यासेन तु कौन्तेय — Through practice, O Arjuna, all is achieved. (Gita 6.35)"
  };
}
