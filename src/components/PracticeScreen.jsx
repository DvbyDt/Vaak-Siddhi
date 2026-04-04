import { useState, useRef, useEffect, useCallback } from "react";
import { T } from "../styles/tokens.js";
import { Chip, Card, WaveformBars, DifficultyBadge, Spinner } from "./ui/index.jsx";
import { analyzePronunciation, analyzePronunciationWithAudio } from "../services/llm.js";
import { transcribe } from "../services/tts.js";
import {
  createSpeechRecognizer,
  createAudioRecorder,
  isSpeechRecognitionAvailable,
  requestMicPermission,
  formatDuration
} from "../services/audio.js";
import { savePracticeResult } from "../services/storage.js";

const QUICK_REFERENCE = [
  ["ā / आ", "Long 'a' — like father"],
  ["ṭ ḍ ṇ",  "Tongue curls to palate"],
  ["ṣ",       "Harder than 'sh'"],
  ["ḥ",       "Soft breath at end"],
  ["ṃ / ṁ",  "Nasal hum"],
];

const PracticeScreen = ({ shloka, onBack, onResults }) => {
  const [tab, setTab] = useState("sanskrit");
  const [isRecording, setIsRecording] = useState(false);
  const [recTime, setRecTime] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [micError, setMicError] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualText, setManualText] = useState("");
  const [playbackUrl, setPlaybackUrl] = useState(null);  // blob URL of the recording
  const [isPlaying, setIsPlaying] = useState(false);
  const recognizerRef  = useRef(null);
  const recorderRef    = useRef(null);   // MediaRecorder for playback
  const audioRef       = useRef(null);   // <audio> element
  const timerRef       = useRef(null);

  // Synchronous refs — updated before React state to avoid async gaps in stopAndAnalyze
  const playbackUrlRef = useRef(null);
  const audioBlobRef   = useRef(null);  // raw blob for Gemini audio analysis

  const stopAndAnalyze = useCallback(async ({ transcript: finalTranscript, alternatives = [] }) => {
    const spoken    = (finalTranscript || "").trim();
    const recUrl    = playbackUrlRef.current;  // capture before async gap
    const audioBlob = audioBlobRef.current;    // capture blob for Gemini audio path
    setIsAnalyzing(true);

    try {
      // Primary path: send actual audio to Gemini — it hears the voice directly,
      // no STT middleman means accurate feedback on vowel length, retroflex sounds, etc.
      // Falls back to text analysis if backend is unreachable or no blob captured.
      const result = audioBlob
        ? await analyzePronunciationWithAudio({
            blob: audioBlob,
            expectedTranslit: shloka.transliteration,
            spokenText: spoken,
            shlokaEnglish: shloka.english,
            shlokaHardSounds: shloka.hard_sounds,
          })
        : await analyzePronunciation({
            expectedTranslit: shloka.transliteration,
            spokenText: spoken,
            spokenAlternatives: alternatives,
            shlokaEnglish: shloka.english,
            shlokaHardSounds: shloka.hard_sounds,
          });

      if (!result || typeof result !== "object") {
        onResults({
          analysis: {
            score: 0, grade: "F",
            overall: "No speech was detected for this recitation attempt.",
            praise: "While no speech was detected, your initiative is commendable.",
            mistakes: ["No words detected — ensure your microphone is working."],
            tips: [
              "Ensure your microphone is connected and permitted.",
              "Speak clearly and a little louder than normal.",
              "Review the IAST transliteration before attempting to speak.",
            ],
            encouragement: "शुद्ध उच्चारण अभ्यास से आता है — Pure pronunciation comes with practice.",
          },
          shloka, transcript: spoken, sessionId: null, playbackUrl: recUrl
        });
        setIsAnalyzing(false);
        return;
      }

      const saved = savePracticeResult({
        shlokaId: shloka.id, chapter: shloka.chapter, verse: shloka.verse,
        score: result.score, grade: result.grade, transcript: spoken
      });
      onResults({ analysis: result, shloka, transcript: spoken, sessionId: saved.id, playbackUrl: recUrl });

    } catch (err) {
      console.error("[PracticeScreen] Analysis error:", err);
      onResults({
        analysis: {
          score: 55, grade: "C",
          overall: "Connection error — showing fallback analysis.",
          praise: "Dedication to practice is itself a form of yoga.",
          mistakes: ["Could not reach AI analysis server"],
          tips: ["Ensure stable internet connection", "Try using Chrome browser", "Allow microphone permissions"],
          phonetic_guide: { word: "karma", breakdown: "kar-muh (short 'a')", example: "Like 'car' + 'muh'" },
          sanskrit_rule: "In Sanskrit, every syllable is equally stressed — avoid English stress patterns.",
          encouragement: "योगः कर्मसु कौशलम् — Yoga is skill in action (Gita 2.50)",
        },
        shloka, transcript: spoken, playbackUrl: recUrl
      });
    }
    setIsAnalyzing(false);
  }, [shloka, onResults]);

  const startRecording = async () => {
    setMicError(null);
    const granted = await requestMicPermission();
    if (!granted) { setMicError("Microphone access denied. Please allow in browser settings."); return; }
    if (!isSpeechRecognitionAvailable()) { setMicError("Speech recognition not available. Please use Chrome or Edge."); return; }

    // Revoke any previous recording URL to free memory
    if (playbackUrl) { recorderRef.current?.release(playbackUrl); setPlaybackUrl(null); }
    audioBlobRef.current   = null;
    playbackUrlRef.current = null;

    setTranscript("");
    setInterimText("");
    setRecTime(0);

    // Start audio recorder for playback (runs silently in parallel)
    recorderRef.current = createAudioRecorder();
    await recorderRef.current.start();

    recognizerRef.current = createSpeechRecognizer({
      onResult: ({ final, interim }) => {
        if (final) setTranscript(final);
        setInterimText(interim);
      },
      onEnd: async ({ transcript: webSpeechText, alternatives }) => {
        if (webSpeechText) setTranscript(webSpeechText);
        setIsRecording(false);
        clearInterval(timerRef.current);

        // Stop audio recorder — store blob + url in refs before calling stopAndAnalyze
        const rec = await recorderRef.current?.stop();
        if (rec) {
          audioBlobRef.current   = rec.blob;
          playbackUrlRef.current = rec.url;
          setPlaybackUrl(rec.url);
        }

        // Sarvam saarika:v2 — purpose-built for Indian languages, far more accurate
        // than Chrome's hi-IN Web Speech API for Sanskrit phonemes.
        let finalText  = webSpeechText;
        let finalAlts  = alternatives;
        if (rec?.blob) {
          try {
            const sarvamText = await transcribe(rec.blob);
            if (sarvamText) {
              finalText = sarvamText;
              // Keep Web Speech result as a secondary hint for the LLM
              if (webSpeechText) finalAlts = [webSpeechText, ...alternatives];
            }
          } catch {
            // Sarvam unavailable (no key, 503) — proceed with Web Speech transcript
          }
        }

        stopAndAnalyze({ transcript: finalText, alternatives: finalAlts });
      },
      onError: (msg) => {
        setMicError(msg);
        // If network error — switch to manual input mode automatically
        if (msg.includes("internet") || msg.includes("network")) {
          setManualMode(true);
          setIsRecording(false);
          clearInterval(timerRef.current);
        } else {
          setTimeout(() => setMicError(null), 5000);
        }
      }
    });

    if (recognizerRef.current) {
      recognizerRef.current.start();
      setIsRecording(true);
      timerRef.current = setInterval(() => setRecTime(t => t + 1), 1000);
    }
  };

  const handleStop = () => {
    setIsRecording(false);
    clearInterval(timerRef.current);
    // recognizer.stop() triggers onEnd which stops the MediaRecorder and calls stopAndAnalyze
    recognizerRef.current?.stop();
  };

  const handlePlayback = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  useEffect(() => () => {
    clearInterval(timerRef.current);
    recognizerRef.current?.abort();
    recorderRef.current?.abort();
    if (playbackUrl) recorderRef.current?.release(playbackUrl);
  }, []);

  const tabs = [
    { id: "sanskrit", label: "Sanskrit" },
    { id: "hindi",    label: "हिन्दी" },
    { id: "english",  label: "English" },
    { id: "guide",    label: "🔤 Guide" },
  ];

  return (
    <div style={{ paddingTop: 52 }}>
      <button onClick={onBack} style={{ color: T.textMuted, fontSize: 13, marginBottom: 20, display: "flex", alignItems: "center", gap: 6 }}>
        ← Back to Library
      </button>

      <div className="fade-up" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <Chip color="orange">Chapter {shloka.chapter} · Verse {shloka.verse}</Chip>
        <DifficultyBadge level={shloka.difficulty} />
      </div>
      <h2 className="fade-up-2" style={{ fontFamily: "'Spectral', serif", fontSize: 22, marginBottom: 18, color: T.saffronLight }}>
        {shloka.title}
      </h2>

      {/* Tabs */}
      <div className="fade-up-2" style={{
        display: "flex", gap: 2, background: "rgba(255,255,255,0.04)",
        borderRadius: 12, padding: 4, marginBottom: 16
      }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "9px 6px", borderRadius: 9, fontSize: 13, fontWeight: 500,
            background: tab === t.id ? "rgba(255,107,43,0.22)" : "transparent",
            color: tab === t.id ? T.saffronLight : T.textMuted,
            transition: "all 0.2s"
          }}>{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      <Card className="fade-up-3" style={{ minHeight: 170, marginBottom: 16 }}>
        {tab === "sanskrit" && (
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.textFaint, marginBottom: 12 }}>DEVANAGARI</div>
            <p style={{ fontFamily: "'Noto Sans Devanagari', serif", fontSize: 21, lineHeight: 2, color: T.text, marginBottom: 16 }}>
              {shloka.sanskrit}
            </p>
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
              <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.textFaint, marginBottom: 8 }}>IAST TRANSLITERATION</div>
              <p style={{ fontSize: 14, color: T.gold, fontStyle: "italic", lineHeight: 1.9 }}>{shloka.transliteration}</p>
            </div>
          </div>
        )}
        {tab === "hindi" && (
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.textFaint, marginBottom: 12 }}>हिन्दी अर्थ</div>
            <p style={{ fontFamily: "'Noto Sans Devanagari', serif", fontSize: 19, lineHeight: 1.95, color: T.text }}>
              {shloka.hindi}
            </p>
          </div>
        )}
        {tab === "english" && (
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.textFaint, marginBottom: 12 }}>ENGLISH MEANING</div>
            <p style={{ fontSize: 16, lineHeight: 1.9, color: T.text }}>{shloka.english}</p>
          </div>
        )}
        {tab === "guide" && (
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.textFaint, marginBottom: 12 }}>PRONUNCIATION GUIDE</div>
            {shloka.audio_hint && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: T.saffronLight, marginBottom: 6 }}>AUDIO HINT</div>
                <p style={{ fontSize: 13, color: T.textMuted, fontFamily: "monospace", lineHeight: 1.7, background: "rgba(255,107,43,0.07)", padding: "10px 12px", borderRadius: 8 }}>
                  {shloka.audio_hint}
                </p>
              </div>
            )}
            {shloka.hard_sounds?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: T.saffronLight, marginBottom: 8 }}>HARD SOUNDS IN THIS VERSE</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {shloka.hard_sounds.map(s => (
                    <code key={s} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(255,107,43,0.12)", color: T.saffronLight, fontSize: 14 }}>{s}</code>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 12, color: T.saffronLight, marginBottom: 8 }}>QUICK REFERENCE</div>
              {QUICK_REFERENCE.map(([symbol, desc]) => (
                <div key={symbol} style={{ display: "flex", gap: 10, marginBottom: 7, alignItems: "center" }}>
                  <code style={{ minWidth: 52, padding: "3px 8px", background: "rgba(255,255,255,0.06)", borderRadius: 5, fontSize: 12, color: T.gold }}>{symbol}</code>
                  <span style={{ fontSize: 12.5, color: T.textMuted }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Manual text fallback — shown when STT fails (no internet) */}
      {manualMode ? (
        <Card className="fade-up-4" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.gold, marginBottom: 10 }}>
            ✎ TYPE YOUR RECITATION
          </div>
          <p style={{ fontSize: 12, color: T.textFaint, marginBottom: 12, lineHeight: 1.6 }}>
            Speech recognition needs internet. Type what you recited using English letters
            (e.g. "dhritarashtra uvacha") and the AI will still evaluate your pronunciation understanding.
          </p>
          <textarea
            value={manualText}
            onChange={e => setManualText(e.target.value)}
            placeholder="Type your recitation here…"
            rows={3}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 10,
              background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`,
              color: T.text, fontSize: 14, outline: "none", resize: "vertical",
              lineHeight: 1.6, fontFamily: "'Sora', sans-serif"
            }}
            onFocus={e => e.target.style.borderColor = T.borderAccent}
            onBlur={e => e.target.style.borderColor = T.border}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => { setManualMode(false); setMicError(null); }} style={{
              padding: "9px 16px", borderRadius: 50, fontSize: 13,
              background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`,
              color: T.textMuted
            }}>Try mic again</button>
            <button
              onClick={() => stopAndAnalyze({ transcript: manualText, alternatives: [] })}
              disabled={!manualText.trim()}
              style={{
                flex: 1, padding: "9px 16px", borderRadius: 50, fontSize: 14, fontWeight: 600,
                background: manualText.trim()
                  ? `linear-gradient(135deg, ${T.saffron}, ${T.saffronDark})`
                  : "rgba(255,255,255,0.05)",
                color: manualText.trim() ? "#fff" : T.textFaint,
                border: "none", cursor: manualText.trim() ? "pointer" : "default"
              }}
            >Analyse →</button>
          </div>
        </Card>
      ) : (
        /* Recording card */
        <Card className="fade-up-4" style={{ marginBottom: 16, textAlign: "center" }}>
          <WaveformBars isRecording={isRecording} />

          {isRecording && (
            <p style={{ fontSize: 12, color: T.saffron, marginTop: 10, letterSpacing: 1.5, animation: "pulse 1.5s infinite" }}>
              ● REC {formatDuration(recTime)}
            </p>
          )}
          {!isRecording && (transcript || interimText) && (
            <p style={{ fontSize: 12, color: T.textMuted, marginTop: 10, fontStyle: "italic" }}>
              Captured: "{(transcript || interimText).substring(0, 70)}..."
            </p>
          )}
          {!isRecording && !transcript && !interimText && (
            <p style={{ fontSize: 12, color: T.textFaint, marginTop: 10 }}>
              Press record, then recite the shloka clearly
            </p>
          )}

          {/* Playback button — appears after recording */}
          {playbackUrl && !isRecording && (
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <button onClick={handlePlayback} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 18px", borderRadius: 50, fontSize: 13, fontWeight: 500,
                background: isPlaying ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.07)",
                border: `1px solid ${isPlaying ? "rgba(74,222,128,0.35)" : T.border}`,
                color: isPlaying ? T.green : T.textMuted,
                transition: "all 0.2s"
              }}>
                <span style={{ fontSize: 16 }}>{isPlaying ? "⏹" : "▶"}</span>
                {isPlaying ? "Stop" : "Play back my recording"}
              </button>
              {/* Hidden audio element */}
              <audio
                ref={audioRef}
                src={playbackUrl}
                onEnded={() => setIsPlaying(false)}
                style={{ display: "none" }}
              />
            </div>
          )}
        </Card>
      )}

      {micError && !manualMode && (
        <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: T.red }}>
          ⚠ {micError}
        </div>
      )}

      {/* Voice mode buttons */}
      {!manualMode && !isAnalyzing && (
        <div style={{ display: "flex", gap: 12 }}>
          {!isRecording ? (
            <button onClick={startRecording} style={{
              flex: 1, padding: "15px 24px", borderRadius: 50,
              background: `linear-gradient(135deg, ${T.saffron}, ${T.saffronDark})`,
              color: "#fff", fontSize: 16, fontWeight: 600,
              boxShadow: `0 8px 24px rgba(255,107,43,0.35)`,
              transition: "transform 0.15s"
            }}>🎙 Start Recording</button>
          ) : (
            <button onClick={handleStop} style={{
              flex: 1, padding: "15px 24px", borderRadius: 50,
              background: "linear-gradient(135deg, #dc2626, #991b1b)",
              color: "#fff", fontSize: 16, fontWeight: 600,
              boxShadow: "0 8px 24px rgba(220,38,38,0.4)",
              animation: "pulse 2s infinite"
            }}>⏹ Stop & Analyse</button>
          )}
        </div>
      )}

      {/* Analysing spinner — shown in both voice and manual mode */}
      {isAnalyzing && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
          padding: "15px 24px", borderRadius: 50,
          background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`
        }}>
          <Spinner />
          <span style={{ color: T.textMuted, fontSize: 14, letterSpacing: 0.5 }}>
            {audioBlobRef.current ? "Guru Vaak is listening to your voice…" : "Guru Vaak is analysing your recitation…"}
          </span>
        </div>
      )}
    </div>
  );
};

export default PracticeScreen;
