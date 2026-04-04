import { useRef, useState, useEffect } from "react";
import { T } from "../styles/tokens.js";
import { Card, Chip, ScoreRing } from "./ui/index.jsx";
import { speak, stopTTS } from "../services/tts.js";

// Normalise a mistake entry — supports both new object format and legacy string format.
// New:    { word, devanagari, issue }
// Legacy: "dhṛta — tongue too flat"
function parseMistake(m) {
  if (m && typeof m === "object") {
    return { word: m.word || "", devanagari: m.devanagari || "", issue: m.issue || "" };
  }
  // legacy string
  const sep = m.indexOf(" — ");
  const sep2 = m.indexOf(" - ");
  const cut = sep !== -1 ? sep : sep2 !== -1 ? sep2 : m.indexOf(" ");
  const word = cut !== -1 ? m.slice(0, cut).trim() : m.split(" ")[0];
  const issue = cut !== -1 ? m.slice(cut).replace(/^\s*[—\-]\s*/, "") : "";
  return { word, devanagari: "", issue };
}

// ─── Speak button ─────────────────────────────────────────────────────────────
// Uses Sarvam TTS (bulbul:v2) for authentic Sanskrit audio,
// with automatic fallback to browser SpeechSynthesis if unavailable.
const SpeakBtn = ({ text, lang = "hi-IN", rate = 0.72, pace = 0.85, label = "Hear pronunciation", size = "sm" }) => {
  const [speaking, setSpeaking] = useState(false);

  const handleClick = async (e) => {
    e.stopPropagation();
    if (speaking) { stopTTS(); setSpeaking(false); return; }
    setSpeaking(true);
    await speak({ text, languageCode: lang, pace, rate });
    setSpeaking(false);
  };

  const isSmall = size === "sm";
  return (
    <button
      onClick={handleClick}
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: 5, padding: isSmall ? "4px 10px" : "7px 14px",
        borderRadius: 50, fontSize: isSmall ? 11 : 13, fontWeight: 500,
        background: speaking ? "rgba(125,211,252,0.18)" : "rgba(255,255,255,0.07)",
        border: `1px solid ${speaking ? "rgba(125,211,252,0.4)" : T.border}`,
        color: speaking ? T.blue : T.textMuted,
        cursor: "pointer", transition: "all 0.2s", flexShrink: 0,
        animation: speaking ? "pulse 1s infinite" : "none",
      }}
    >
      <span style={{ fontSize: isSmall ? 13 : 15 }}>{speaking ? "🔇" : "🔊"}</span>
      {!isSmall && (speaking ? "Speaking…" : label)}
    </button>
  );
};

// ─── Recording player ─────────────────────────────────────────────────────────
const RecordingPlayer = ({ url }) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  // Revoke blob URL on unmount
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  // Chrome MediaRecorder writes WebM without a duration header → duration = Infinity.
  // Fix: seek to a huge time; the browser scans to the real end and corrects duration.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const fix = () => {
      if (audio.duration === Infinity || isNaN(audio.duration)) {
        audio.currentTime = 1e9;
        const reset = () => { audio.currentTime = 0; audio.removeEventListener("timeupdate", reset); };
        audio.addEventListener("timeupdate", reset);
      }
    };
    audio.addEventListener("loadedmetadata", fix);
    return () => audio.removeEventListener("loadedmetadata", fix);
  }, [url]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      audio.currentTime = 0;
      setPlaying(false);
    } else {
      audio.currentTime = 0; // always restart from beginning
      try {
        await audio.play();
        setPlaying(true);
      } catch (err) {
        console.warn("[player] play() failed:", err);
      }
    }
  };

  return (
    <Card style={{ marginBottom: 16, borderColor: "rgba(125,211,252,0.25)", background: "rgba(125,211,252,0.04)" }}>
      <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.blue, marginBottom: 12 }}>🎙 YOUR RECORDING</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={toggle}
          aria-label={playing ? "Stop playback" : "Play your recording"}
          style={{
            width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
            background: playing ? "rgba(74,222,128,0.2)" : `rgba(255,107,43,0.2)`,
            border: `1px solid ${playing ? "rgba(74,222,128,0.4)" : T.borderAccent}`,
            color: playing ? T.green : T.saffron,
            fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "all 0.2s",
          }}
        >
          {playing ? "⏹" : "▶"}
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 2, background: `linear-gradient(90deg, ${T.blue}, ${T.purple})`,
              width: `${progress}%`, transition: "width 0.1s linear"
            }} />
          </div>
          <p style={{ fontSize: 12, color: T.textFaint, marginTop: 6 }}>
            {playing ? "Playing…" : "Tap to hear what you sounded like"}
          </p>
        </div>
      </div>
      <audio
        ref={audioRef}
        src={url}
        preload="auto"
        onEnded={() => setPlaying(false)}
        onTimeUpdate={e => {
          const { currentTime, duration } = e.currentTarget;
          if (duration && isFinite(duration)) setProgress((currentTime / duration) * 100);
        }}
        style={{ display: "none" }}
      />
    </Card>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const ResultsScreen = ({ data, onPracticeAgain, onChooseNew }) => {
  const { analysis, shloka, playbackUrl } = data;

  return (
    <div style={{ paddingTop: 52 }}>
      <div className="fade-up" style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button onClick={onPracticeAgain} style={{ color: T.textMuted, fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
          ← Try Again
        </button>
        <button onClick={onChooseNew} style={{ color: T.textMuted, fontSize: 13, display: "flex", alignItems: "center", gap: 5, marginLeft: "auto" }}>
          New Shloka →
        </button>
      </div>

      <h2 className="fade-up" style={{ fontFamily: "'Spectral', serif", fontSize: 26, marginBottom: 18 }}>
        Your Analysis
      </h2>

      {/* ── Your recording player ── */}
      {playbackUrl && <RecordingPlayer url={playbackUrl} />}

      {/* ── Score card ── */}
      <Card className="fade-up-2" accent style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 16 }}>
        <ScoreRing score={analysis.score} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
            <span style={{
              fontFamily: "'Spectral', serif", fontSize: 48, fontWeight: 700, lineHeight: 1,
              color: analysis.score >= 80 ? T.green : analysis.score >= 60 ? T.gold : T.red
            }}>
              {analysis.grade}
            </span>
            <Chip color={analysis.score >= 80 ? "green" : analysis.score >= 60 ? "gold" : "red"}>
              {analysis.score >= 80 ? "Excellent" : analysis.score >= 60 ? "Good" : "Keep Trying"}
            </Chip>
          </div>
          <p style={{ fontSize: 13.5, color: T.textMuted, lineHeight: 1.65 }}>{analysis.overall}</p>
        </div>
      </Card>

      {/* ── Hear correct pronunciation ── */}
      <Card className="fade-up-2" style={{ marginBottom: 16, borderColor: "rgba(232,184,75,0.2)", background: "rgba(232,184,75,0.03)" }}>
        <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.gold, marginBottom: 10 }}>🕉 CORRECT PRONUNCIATION</div>
        <p className="font-devanagari" style={{ fontSize: 15, color: T.textFaint, marginBottom: 12, lineHeight: 1.8 }}>
          {shloka.sanskrit.slice(0, 100)}{shloka.sanskrit.length > 100 ? "…" : ""}
        </p>
        <SpeakBtn
          text={shloka.sanskrit}
          lang="hi-IN"
          rate={0.55}
          label="Hear correct pronunciation"
          size="lg"
        />
      </Card>

      {/* ── Praise ── */}
      {analysis.praise && (
        <Card className="fade-up-3" style={{ marginBottom: 14, borderColor: "rgba(74,222,128,0.25)", background: "rgba(74,222,128,0.04)" }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.green, marginBottom: 8 }}>✓ WHAT YOU DID WELL</div>
          <p style={{ fontSize: 14.5, lineHeight: 1.7, color: T.text }}>{analysis.praise}</p>
        </Card>
      )}

      {/* ── Mistakes with per-word TTS ── */}
      {analysis.mistakes?.length > 0 && (
        <Card className="fade-up-3" style={{ marginBottom: 14, borderColor: "rgba(248,113,113,0.25)", background: "rgba(248,113,113,0.04)" }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.red, marginBottom: 12 }}>✗ AREAS TO IMPROVE</div>
          {analysis.mistakes.map((m, i) => {
            const { word, devanagari, issue } = parseMistake(m);
            // Prefer Devanagari for TTS — hi-IN voices pronounce it authentically
            const speakText = devanagari || shloka.sanskrit;
            const speakLang = "hi-IN";
            return (
              <div key={i} style={{ marginBottom: i < analysis.mistakes.length - 1 ? 14 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(248,113,113,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ color: T.red, fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                  </div>
                  {/* Devanagari badge (primary) + IAST below */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {devanagari && (
                      <span className="font-devanagari" style={{ padding: "2px 10px", borderRadius: 6, background: "rgba(248,113,113,0.12)", color: T.red, fontSize: 15, fontWeight: 600 }}>
                        {devanagari}
                      </span>
                    )}
                    <code style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(248,113,113,0.07)", color: "rgba(248,113,113,0.7)", fontSize: 11 }}>
                      {word}
                    </code>
                  </div>
                  <SpeakBtn
                    text={speakText}
                    lang={speakLang}
                    rate={0.5}
                    label={`Hear correct pronunciation of ${devanagari || word}`}
                  />
                </div>
                {issue && (
                  <p style={{ fontSize: 13, lineHeight: 1.65, color: "rgba(242,235,224,0.7)", marginLeft: 28 }}>{issue}</p>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {/* ── Tips ── */}
      {analysis.tips?.length > 0 && (
        <Card className="fade-up-4" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.saffron, marginBottom: 12 }}>💡 IMPROVEMENT TIPS</div>
          {analysis.tips.map((tip, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: i < analysis.tips.length - 1 ? 12 : 0, alignItems: "flex-start" }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                background: "rgba(255,107,43,0.15)", border: "1px solid rgba(255,107,43,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1
              }}>
                <span style={{ color: T.saffron, fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "rgba(242,235,224,0.8)", margin: 0 }}>{tip}</p>
            </div>
          ))}
        </Card>
      )}

      {/* ── Phonetic guide with TTS ── */}
      {analysis.phonetic_guide && (
        <Card style={{ marginBottom: 14, borderColor: "rgba(192,132,252,0.25)", background: "rgba(192,132,252,0.04)" }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.purple, marginBottom: 10 }}>🔤 PHONETIC BREAKDOWN</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            {analysis.phonetic_guide.devanagari ? (
              <span className="font-devanagari" style={{ fontSize: 20, color: T.purple, background: "rgba(192,132,252,0.12)", padding: "4px 12px", borderRadius: 8 }}>
                {analysis.phonetic_guide.devanagari}
              </span>
            ) : (
              <code style={{ fontSize: 18, color: T.purple, background: "rgba(192,132,252,0.12)", padding: "4px 12px", borderRadius: 8 }}>
                {analysis.phonetic_guide.word}
              </code>
            )}
            <SpeakBtn
              text={analysis.phonetic_guide.devanagari || analysis.phonetic_guide.word}
              lang="hi-IN"
              rate={0.45}
              label={`Hear "${analysis.phonetic_guide.devanagari || analysis.phonetic_guide.word}" slowly`}
            />
          </div>
          <p style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.7, marginBottom: 4 }}>{analysis.phonetic_guide.breakdown}</p>
          {analysis.phonetic_guide.example && (
            <p style={{ fontSize: 13, color: T.textFaint }}>Similar to: "{analysis.phonetic_guide.example}"</p>
          )}
        </Card>
      )}

      {/* ── Sanskrit rule ── */}
      {analysis.sanskrit_rule && (
        <Card style={{ marginBottom: 14, borderColor: "rgba(125,211,252,0.2)", background: "rgba(125,211,252,0.03)" }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.blue, marginBottom: 8 }}>📚 SANSKRIT RULE</div>
          <p style={{ fontSize: 13.5, color: T.textMuted, lineHeight: 1.7 }}>{analysis.sanskrit_rule}</p>
        </Card>
      )}

      {/* ── Encouragement ── */}
      {analysis.encouragement && (
        <div style={{ textAlign: "center", padding: "14px 20px", marginBottom: 18 }}>
          <p style={{ fontFamily: "'Noto Sans Devanagari', serif", fontSize: 15, color: T.gold, lineHeight: 1.8, fontStyle: "italic" }}>
            "{analysis.encouragement}"
          </p>
        </div>
      )}

      <button onClick={onPracticeAgain} aria-label="Practice this shloka again" style={{
        width: "100%", padding: "15px 24px", borderRadius: 50,
        background: `linear-gradient(135deg, ${T.saffron}, ${T.saffronDark})`,
        color: "#fff", fontSize: 16, fontWeight: 600,
        boxShadow: `0 8px 24px rgba(255,107,43,0.3)`, marginBottom: 10
      }}>🔄 Practice Again</button>

      <button onClick={onChooseNew} aria-label="Choose a different shloka" style={{
        width: "100%", padding: "13px 24px", borderRadius: 50,
        background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`,
        color: T.textMuted, fontSize: 15, fontWeight: 500
      }}>Choose Different Shloka</button>
    </div>
  );
};

export default ResultsScreen;
