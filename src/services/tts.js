/**
 * VaakSiddhi — TTS & Transcription Service
 *
 * speak()      — Sarvam bulbul:v2 (authentic Indian-language voice)
 *                Falls back to browser SpeechSynthesis automatically.
 * stopTTS()    — Stops any currently playing TTS audio.
 * transcribe() — Sarvam saarika:v2 STT (better Sanskrit accuracy than Web Speech API).
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

// In-memory cache: cacheKey → blob URL so the same word isn't fetched twice per session
const _ttsCache = new Map();
let _currentAudio = null;

export function stopTTS() {
  if (_currentAudio) {
    _currentAudio.pause();
    _currentAudio.currentTime = 0;
    _currentAudio = null;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

/**
 * Speak text using Sarvam TTS, falling back to browser TTS on error.
 *
 * @param {object} opts
 * @param {string} opts.text           - Text to speak (max 500 chars)
 * @param {string} opts.languageCode   - BCP-47 code, e.g. "hi-IN" (default)
 * @param {number} opts.pace           - Sarvam pace 0.5–2.0 (default 0.85 = slightly slow)
 * @param {number} opts.rate           - Browser TTS fallback rate (default 0.72)
 * @param {string} opts.speaker        - Sarvam speaker name (default "meera")
 * @returns {Promise<void>}  Resolves when audio ends or on error.
 */
export async function speak({
  text,
  languageCode = "hi-IN",
  pace = 0.85,
  rate = 0.72,
  speaker = "meera",
}) {
  stopTTS();
  if (!text?.trim()) return;

  try {
    const cacheKey = `${languageCode}|${pace}|${speaker}|${text}`;
    let url = _ttsCache.get(cacheKey);

    if (!url) {
      const resp = await fetch(`${BACKEND_URL}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          language_code: languageCode,
          pace,
          speaker,
        }),
      });
      if (!resp.ok) throw new Error(`TTS ${resp.status}`);
      const { audio_b64 } = await resp.json();

      // Decode base64 WAV → Blob URL
      const bytes = Uint8Array.from(atob(audio_b64), c => c.charCodeAt(0));
      const blob  = new Blob([bytes], { type: "audio/wav" });
      url = URL.createObjectURL(blob);
      _ttsCache.set(cacheKey, url);
    }

    return _playUrl(url);
  } catch {
    // Sarvam unavailable (no key, network issue, 503) — fall back silently
    return _browserSpeak(text, languageCode, rate);
  }
}

function _playUrl(url) {
  return new Promise(resolve => {
    const audio = new Audio(url);
    _currentAudio = audio;
    audio.onended = () => { _currentAudio = null; resolve(); };
    audio.onerror = () => { _currentAudio = null; resolve(); };
    audio.play().catch(() => { _currentAudio = null; resolve(); });
  });
}

function _browserSpeak(text, lang, rate) {
  return new Promise(resolve => {
    if (!window.speechSynthesis) { resolve(); return; }
    const u = new SpeechSynthesisUtterance(text.trim());
    u.lang  = lang;
    u.rate  = rate;
    u.pitch = 1;
    u.onend   = resolve;
    u.onerror = resolve;
    window.speechSynthesis.speak(u);
  });
}

/**
 * Transcribe a recorded audio Blob using Sarvam saarika:v2.
 * Much more accurate for Sanskrit than Chrome's built-in hi-IN Web Speech API.
 *
 * @param {Blob} blob  - WebM audio blob from MediaRecorder
 * @returns {Promise<string>}  Transcript string (empty on error)
 */
export async function transcribe(blob) {
  const formData = new FormData();
  formData.append("audio", blob, "recording.webm");

  const resp = await fetch(`${BACKEND_URL}/api/transcribe`, {
    method: "POST",
    body: formData,
  });
  if (!resp.ok) throw new Error(`Transcribe ${resp.status}`);
  const { transcript } = await resp.json();
  return transcript || "";
}
