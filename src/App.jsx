/**
 * VaakSiddhi (वाक्सिद्धि)
 * "Mastery of Voice" — AI-Powered Bhagavad Gita Sanskrit Pronunciation Coach
 *
 * वाक् (Vaak) = Speech/Voice [Sanskrit]
 * सिद्धि (Siddhi) = Mastery/Perfection [Sanskrit/Hindi]
 *
 * Built with React + Google Gemini AI (free) + Web Speech API
 * All 700 shlokas included. Zero cost to run.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import SHLOKAS_RAW from "./data/shlokas.json";
import { analyzePronunciation, getDailyWord } from "./services/llm.js";
import {
  createSpeechRecognizer,
  isSpeechRecognitionAvailable,
  requestMicPermission,
  formatDuration
} from "./services/audio.js";
import {
  savePracticeResult,
  getPracticeHistory,
  getBestScore,
  getStats,
  getStreak
} from "./services/storage.js";

// ─────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────
const T = {
  saffron: "#FF6B2B",
  saffronLight: "#FF8C55",
  saffronDark: "#D94F10",
  gold: "#E8B84B",
  goldLight: "#F5D080",
  deep: "#0D0818",
  deepMid: "#160D28",
  deepLight: "#1F1240",
  surface: "rgba(255,255,255,0.045)",
  surfaceHover: "rgba(255,255,255,0.07)",
  border: "rgba(255,255,255,0.08)",
  borderAccent: "rgba(255,107,43,0.35)",
  text: "#F2EBE0",
  textMuted: "rgba(242,235,224,0.5)",
  textFaint: "rgba(242,235,224,0.28)",
  green: "#4ADE80",
  red: "#F87171",
  blue: "#7DD3FC",
  purple: "#C084FC",
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,300;0,400;0,600;0,700;1,400&family=Sora:wght@300;400;500;600&family=Noto+Sans+Devanagari:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body { background: ${T.deep}; color: ${T.text}; font-family: 'Sora', sans-serif; overscroll-behavior: none; }
  ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes ripple { 0% { transform:scale(1); opacity:0.6; } 100% { transform:scale(2.5); opacity:0; } }
  @keyframes barWave { 0%,100% { transform:scaleY(0.2); } 50% { transform:scaleY(1); } }
  @keyframes shimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
  .fade-up { animation: fadeUp 0.45s ease forwards; }
  .fade-up-2 { animation: fadeUp 0.45s 0.1s ease both; }
  .fade-up-3 { animation: fadeUp 0.45s 0.2s ease both; }
  .fade-up-4 { animation: fadeUp 0.45s 0.3s ease both; }
  button { font-family: 'Sora', sans-serif; cursor: pointer; border: none; background: none; }
  input, select { font-family: 'Sora', sans-serif; }
`;

// ─────────────────────────────────────────────
// SMALL REUSABLE COMPONENTS
// ─────────────────────────────────────────────

const Chip = ({ children, color = "orange", style }) => {
  const colors = {
    orange: { bg: "rgba(255,107,43,0.15)", text: T.saffronLight, border: "rgba(255,107,43,0.25)" },
    gold: { bg: "rgba(232,184,75,0.12)", text: T.goldLight, border: "rgba(232,184,75,0.25)" },
    green: { bg: "rgba(74,222,128,0.1)", text: T.green, border: "rgba(74,222,128,0.2)" },
    red: { bg: "rgba(248,113,113,0.1)", text: T.red, border: "rgba(248,113,113,0.2)" },
    blue: { bg: "rgba(125,211,252,0.1)", text: T.blue, border: "rgba(125,211,252,0.2)" },
    purple: { bg: "rgba(192,132,252,0.1)", text: T.purple, border: "rgba(192,132,252,0.2)" },
  };
  const c = colors[color] || colors.orange;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, letterSpacing: 0.5,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`, ...style
    }}>{children}</span>
  );
};

const Card = ({ children, style, onClick, accent, className }) => (
  <div onClick={onClick} className={className} style={{
    background: T.surface,
    border: `1px solid ${accent ? T.borderAccent : T.border}`,
    borderRadius: 16, padding: 20,
    transition: "border-color 0.2s, background 0.2s, transform 0.15s",
    cursor: onClick ? "pointer" : "default",
    ...style
  }}
    onMouseEnter={onClick ? e => { e.currentTarget.style.borderColor = T.borderAccent; e.currentTarget.style.background = T.surfaceHover; } : undefined}
    onMouseLeave={onClick ? e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surface; } : undefined}
  >
    {children}
  </div>
);

const ScoreRing = ({ score, size = 110 }) => {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(score, 100) / 100) * circ;
  const color = score >= 80 ? T.green : score >= 60 ? T.gold : T.red;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={7} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={7}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.24, fontWeight: 700, color, fontFamily: "'Spectral', serif", lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 9, color: T.textFaint, letterSpacing: 1.5, marginTop: 2 }}>SCORE</span>
      </div>
    </div>
  );
};

const WaveformBars = ({ isRecording, barCount = 28 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 3, height: 44, justifyContent: "center" }}>
    {Array.from({ length: barCount }).map((_, i) => (
      <div key={i} style={{
        width: 3.5, borderRadius: 2,
        background: isRecording
          ? `linear-gradient(to top, ${T.saffron}, ${T.gold})`
          : "rgba(255,255,255,0.12)",
        transformOrigin: "bottom",
        animationName: isRecording ? "barWave" : "none",
        animationDuration: isRecording ? `${0.6 + (i % 7) * 0.08}s` : "0s",
        animationTimingFunction: "ease-in-out",
        animationIterationCount: "infinite",
        animationDelay: `${i * 0.04}s`,
        height: isRecording ? "100%" : "18%",
        transition: "background 0.4s, height 0.4s"
      }} />
    ))}
  </div>
);

const ProgressBar = ({ value, max = 100, color = T.saffron }) => (
  <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
    <div style={{
      height: "100%", borderRadius: 2,
      background: `linear-gradient(90deg, ${color}, ${T.gold})`,
      width: `${Math.min((value / max) * 100, 100)}%`,
      transition: "width 1s cubic-bezier(0.4,0,0.2,1)"
    }} />
  </div>
);

const DifficultyBadge = ({ level }) => {
  const map = { beginner: ["green", "●"], intermediate: ["gold", "●●"], advanced: ["red", "●●●"] };
  const [color, dots] = map[level] || ["blue", "?"];
  return <Chip color={color}>{dots} {level}</Chip>;
};

const Spinner = () => (
  <div style={{
    width: 20, height: 20, borderRadius: "50%",
    border: `2px solid rgba(255,255,255,0.1)`,
    borderTopColor: T.saffron,
    animation: "spin 0.7s linear infinite"
  }} />
);

// ─────────────────────────────────────────────
// SCREENS
// ─────────────────────────────────────────────

// HOME SCREEN
const HomeScreen = ({ onNavigate, dailyWord, loadingWord }) => {
  const stats = getStats();
  const streak = getStreak();
  const history = getPracticeHistory().slice(0, 4);

  return (
    <div style={{ paddingTop: 52 }}>
      {/* Header */}
      <div className="fade-up" style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 10, lineHeight: 1 }}>🕉</div>
        <h1 style={{
          fontFamily: "'Spectral', serif", fontSize: 40, fontWeight: 700, lineHeight: 1.1,
          background: `linear-gradient(135deg, ${T.text} 30%, ${T.saffron})`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 6
        }}>VaakSiddhi</h1>
        <p style={{ fontFamily: "'Noto Sans Devanagari', serif", fontSize: 16, color: T.gold, marginBottom: 4 }}>वाक्सिद्धि</p>
        <p style={{ color: T.textMuted, fontSize: 13, letterSpacing: 1.5 }}>MASTERY OF VOICE</p>
      </div>

      {/* Stats row */}
      <div className="fade-up-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
        {[
          { val: stats.totalSessions, label: "Sessions" },
          { val: stats.avgScore || "—", label: "Avg Score" },
          { val: streak + "🔥", label: "Streak" },
          { val: stats.uniqueShlokas, label: "Shlokas" },
        ].map(({ val, label }) => (
          <div key={label} style={{
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
            padding: "12px 8px", textAlign: "center"
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Spectral', serif", color: T.saffronLight }}>{val}</div>
            <div style={{ fontSize: 10, color: T.textFaint, marginTop: 2, letterSpacing: 0.5 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Daily Word */}
      <Card className="fade-up-3" accent style={{ marginBottom: 18, background: "rgba(232,184,75,0.05)", borderColor: "rgba(232,184,75,0.25)" }}>
        <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.gold, marginBottom: 10 }}>✦ WORD OF THE DAY</div>
        {loadingWord ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Spinner />
            <span style={{ color: T.textMuted, fontSize: 13 }}>Loading Sanskrit wisdom...</span>
          </div>
        ) : dailyWord ? (
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
              <span style={{ fontFamily: "'Noto Sans Devanagari', serif", fontSize: 26, color: T.text }}>{dailyWord.word}</span>
              <span style={{ fontSize: 14, color: T.gold, fontStyle: "italic" }}>{dailyWord.transliteration}</span>
            </div>
            <div style={{ fontSize: 14, color: T.textMuted, marginBottom: 4 }}>{dailyWord.meaning}</div>
            <div style={{ fontSize: 12, color: T.textFaint }}>{dailyWord.usage}</div>
          </div>
        ) : (
          <div style={{ fontFamily: "'Noto Sans Devanagari', serif", fontSize: 20, color: T.text }}>
            कर्म — <span style={{ fontSize: 14, color: T.textMuted }}>Action, Duty (Ch. 2, V. 47)</span>
          </div>
        )}
      </Card>

      {/* Recent practice */}
      {history.length > 0 && (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.textFaint, marginBottom: 12 }}>RECENT PRACTICE</div>
          {history.map((h, i) => (
            <div key={h.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              paddingBottom: i < history.length - 1 ? 10 : 0,
              marginBottom: i < history.length - 1 ? 10 : 0,
              borderBottom: i < history.length - 1 ? `1px solid ${T.border}` : "none"
            }}>
              <div>
                <span style={{ fontSize: 13 }}>Chapter {h.chapter} · Verse {h.verse}</span>
                <span style={{ fontSize: 11, color: T.textFaint, marginLeft: 8 }}>{h.dateDisplay}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontWeight: 700, fontSize: 15, fontFamily: "'Spectral', serif",
                  color: h.score >= 80 ? T.green : h.score >= 60 ? T.gold : T.red
                }}>{h.score}</span>
                <Chip color={h.score >= 80 ? "green" : h.score >= 60 ? "gold" : "red"}>{h.grade}</Chip>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* CTA */}
      <button className="fade-up-4" onClick={() => onNavigate("library")} style={{
        width: "100%", padding: "16px 24px", borderRadius: 50,
        background: `linear-gradient(135deg, ${T.saffron}, ${T.saffronDark})`,
        color: "#fff", fontSize: 17, fontWeight: 600, letterSpacing: 0.5,
        boxShadow: `0 8px 30px rgba(255,107,43,0.3)`,
        transition: "transform 0.15s, box-shadow 0.15s"
      }}
        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 12px 36px rgba(255,107,43,0.4)`; }}
        onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = `0 8px 30px rgba(255,107,43,0.3)`; }}
      >
        Begin Practice →
      </button>
    </div>
  );
};

// LIBRARY SCREEN — handles 700+ shlokas with chapter filter + pagination
const CHAPTERS = [...new Set(SHLOKAS_RAW.map(s => s.chapter))].sort((a, b) => a - b);
const CHAPTER_NAMES = {};
SHLOKAS_RAW.forEach(s => { if (s.chapter_name) CHAPTER_NAMES[s.chapter] = s.chapter_name; });
const PAGE_SIZE = 20;

const LibraryScreen = ({ onSelect }) => {
  const [filter, setFilter] = useState("all");
  const [chapterFilter, setChapterFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [filter, chapterFilter, search]);

  const filtered = SHLOKAS_RAW.filter(s => {
    const matchDiff = filter === "all" || s.difficulty === filter;
    const matchChapter = chapterFilter === "all" || s.chapter === Number(chapterFilter);
    const q = search.toLowerCase();
    const matchSearch = !q || s.english.toLowerCase().includes(q)
      || (s.hindi && s.hindi.includes(search))
      || s.keywords.some(k => k.includes(q))
      || `ch${s.chapter}`.includes(q)
      || s.title.toLowerCase().includes(q)
      || (s.chapter_name && s.chapter_name.toLowerCase().includes(q))
      || s.sanskrit.includes(search);
    return matchDiff && matchChapter && matchSearch;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(0, page * PAGE_SIZE);

  return (
    <div style={{ paddingTop: 52 }}>
      <h2 className="fade-up" style={{ fontFamily: "'Spectral', serif", fontSize: 28, marginBottom: 6 }}>
        Choose a Shloka
      </h2>
      <p className="fade-up" style={{ fontSize: 13, color: T.textMuted, marginBottom: 18 }}>
        {SHLOKAS_RAW.length} shlokas across 18 chapters
      </p>

      {/* Search */}
      <div className="fade-up-2" style={{ position: "relative", marginBottom: 14 }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.textFaint, fontSize: 16 }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by keyword, chapter, verse, or theme..."
          style={{
            width: "100%", padding: "11px 14px 11px 38px", borderRadius: 12,
            background: T.surface, border: `1px solid ${T.border}`,
            color: T.text, fontSize: 14, outline: "none",
            transition: "border-color 0.2s"
          }}
          onFocus={e => e.target.style.borderColor = T.borderAccent}
          onBlur={e => e.target.style.borderColor = T.border}
        />
      </div>

      {/* Chapter selector */}
      <div className="fade-up-2" style={{ marginBottom: 12 }}>
        <select value={chapterFilter} onChange={e => setChapterFilter(e.target.value)} style={{
          width: "100%", padding: "10px 14px", borderRadius: 10,
          background: T.deepLight, border: `1px solid ${T.border}`,
          color: T.text, fontSize: 13, outline: "none",
          cursor: "pointer", appearance: "auto"
        }}>
          <option value="all">All Chapters (1–18)</option>
          {CHAPTERS.map(ch => (
            <option key={ch} value={ch}>
              Chapter {ch}: {CHAPTER_NAMES[ch] || ""}
            </option>
          ))}
        </select>
      </div>

      {/* Difficulty Filters */}
      <div className="fade-up-2" style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {["all", "beginner", "intermediate", "advanced"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 500, letterSpacing: 0.5,
            border: `1px solid ${filter === f ? T.saffron : T.border}`,
            background: filter === f ? "rgba(255,107,43,0.18)" : "transparent",
            color: filter === f ? T.saffronLight : T.textMuted,
            transition: "all 0.2s"
          }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
        ))}
        <span style={{ fontSize: 12, color: T.textFaint, alignSelf: "center", marginLeft: "auto" }}>
          {filtered.length} found
        </span>
      </div>

      {/* Shloka cards — paginated */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {paged.map((shloka, idx) => {
          const best = getBestScore(shloka.id);
          return (
            <Card key={shloka.id} onClick={() => onSelect(shloka)} style={{ animationDelay: `${Math.min(idx, 5) * 0.05}s` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Chip color="orange">Ch {shloka.chapter} · V {shloka.verse}</Chip>
                  <DifficultyBadge level={shloka.difficulty} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {best !== null && (
                    <span style={{ fontSize: 12, color: best >= 80 ? T.green : T.gold, fontWeight: 600 }}>
                      Best: {best}
                    </span>
                  )}
                  <span style={{ color: T.textFaint, fontSize: 18 }}>→</span>
                </div>
              </div>

              <p style={{ fontSize: 13, fontWeight: 500, color: T.saffronLight, marginBottom: 8, letterSpacing: 0.3 }}>
                {shloka.chapter_name ? `${shloka.chapter_name}` : shloka.title}
              </p>

              <p style={{
                fontFamily: "'Noto Sans Devanagari', serif", fontSize: 17,
                color: T.text, lineHeight: 1.85, marginBottom: 10,
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden"
              }}>{shloka.sanskrit.split("\n").slice(0, 2).join(" ")}</p>

              <p style={{ fontSize: 12.5, color: T.textFaint, lineHeight: 1.6, fontStyle: "italic" }}>
                "{shloka.english.substring(0, 90)}{shloka.english.length > 90 ? "..." : ""}"
              </p>

              {best !== null && (
                <div style={{ marginTop: 12 }}>
                  <ProgressBar value={best} />
                </div>
              )}
            </Card>
          );
        })}

        {/* Load More button */}
        {paged.length < filtered.length && (
          <button onClick={() => setPage(p => p + 1)} style={{
            padding: "14px 24px", borderRadius: 14,
            background: "rgba(255,107,43,0.1)", border: `1px solid rgba(255,107,43,0.25)`,
            color: T.saffronLight, fontSize: 14, fontWeight: 500,
            cursor: "pointer", transition: "all 0.2s"
          }}>
            Load More ({filtered.length - paged.length} remaining)
          </button>
        )}

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: T.textFaint }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🕉</div>
            No shlokas found. Try a different search.
          </div>
        )}
      </div>
    </div>
  );
};

// PRACTICE SCREEN
const PracticeScreen = ({ shloka, onBack, onResults }) => {
  const [tab, setTab] = useState("sanskrit");
  const [isRecording, setIsRecording] = useState(false);
  const [recTime, setRecTime] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [micError, setMicError] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const recognizerRef = useRef(null);
  const timerRef = useRef(null);

  const startRecording = async () => {
    setMicError(null);
    const granted = await requestMicPermission();
    if (!granted) { setMicError("Microphone access denied. Please allow in browser settings."); return; }
    if (!isSpeechRecognitionAvailable()) { setMicError("Speech recognition not available. Please use Chrome or Edge."); return; }

    setTranscript("");
    setInterimText("");
    setRecTime(0);

    recognizerRef.current = createSpeechRecognizer({
      onResult: ({ final, interim }) => {
        if (final) setTranscript(final);
        setInterimText(interim);
      },
      onEnd: (final) => { if (final) setTranscript(final); },
      onError: (msg) => { setMicError(msg); setTimeout(() => setMicError(null), 4000); }
    });

    if (recognizerRef.current) {
      recognizerRef.current.start();
      setIsRecording(true);
      timerRef.current = setInterval(() => setRecTime(t => t + 1), 1000);
    }
  };

  const stopAndAnalyze = useCallback(async () => {
      console.log('[VaakSiddhi] stopAndAnalyze called. Transcript:', transcript);
    setIsRecording(false);
    clearInterval(timerRef.current);
    const recognizerResult = recognizerRef.current?.stop();
    const spokenRaw = recognizerResult || transcript;
    const spoken = (spokenRaw || "").trim();

    setIsAnalyzing(true);
    try {
      const result = await analyzePronunciation({
        expectedTranslit: shloka.transliteration,
        spokenText: spoken,
        shlokaEnglish: shloka.english,
        shlokaHardSounds: shloka.hard_sounds
      });
      if (!result || typeof result !== 'object') {
        setMicError('Failed to get analysis from backend.');
        onResults({
          analysis: {
            score: 0,
            grade: "F",
            overall: "No speech was detected for this recitation attempt, indicating the student did not vocalize any part of the shloka.",
            praise: "While no speech was detected in this attempt, the student has shown initiative by engaging with the practice session.",
            mistakes: ["No words were detected. Please ensure your microphone is working and you are speaking clearly into it for the next attempt."],
            tips: [
              "Ensure your microphone is properly connected and functioning before beginning your recitation.",
              "Take a deep breath and start by vocalizing the very first syllable slowly to build confidence.",
              "Review the IAST transliteration carefully, focusing on the diacritics, before attempting to speak."
            ],
            encouragement: "शुद्ध उच्चारण अभ्यास से आता है — Pure pronunciation comes with practice."
          },
          shloka,
          transcript: spoken,
          sessionId: null
        });
        setIsAnalyzing(false);
        return;
      }
      const saved = savePracticeResult({
        shlokaId: shloka.id, chapter: shloka.chapter, verse: shloka.verse,
        score: result.score, grade: result.grade, transcript: spoken
      });
      onResults({ analysis: result, shloka, transcript: spoken, sessionId: saved.id });
    } catch (err) {
      console.error(err);
      setMicError('Error calling backend: ' + err);
      onResults({
        analysis: {
          score: 55, grade: "C", overall: "Connection error — showing fallback analysis.",
          praise: "Dedication to practice is itself a form of yoga.",
          mistakes: ["Could not reach AI analysis server"],
          tips: ["Ensure stable internet connection", "Try using Chrome browser", "Allow microphone permissions"],
          phonetic_guide: { word: "karma", breakdown: "kar-muh (short 'a')", example: "Like 'car' + 'muh'" },
          sanskrit_rule: "In Sanskrit, every syllable is equally stressed — avoid English stress patterns.",
          encouragement: "योगः कर्मसु कौशलम् — Yoga is skill in action (Gita 2.50)"
        },
        shloka, transcript: spoken
      });
    }
    setIsAnalyzing(false);
  }, [transcript, shloka, onResults]);

  useEffect(() => () => { clearInterval(timerRef.current); recognizerRef.current?.abort(); }, []);

  const tabs = [
    { id: "sanskrit", label: "Sanskrit" },
    { id: "hindi", label: "हिन्दी" },
    { id: "english", label: "English" },
    { id: "guide", label: "🔤 Guide" }
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

      {/* Content */}
      <Card className="fade-up-3" style={{ minHeight: 170, marginBottom: 16 }}>
        {tab === "sanskrit" && (
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.textFaint, marginBottom: 12 }}>DEVANAGARI</div>
            <p style={{
              fontFamily: "'Noto Sans Devanagari', serif", fontSize: 21,
              lineHeight: 2, color: T.text, marginBottom: 16
            }}>{shloka.sanskrit}</p>
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
              <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.textFaint, marginBottom: 8 }}>IAST TRANSLITERATION</div>
              <p style={{ fontSize: 14, color: T.gold, fontStyle: "italic", lineHeight: 1.9 }}>
                {shloka.transliteration}
              </p>
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
            {shloka.hard_sounds && shloka.hard_sounds.length > 0 && (
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
              {[["ā / आ", "Long 'a' — like father"], ["ṭ ḍ ṇ", "Tongue curls to palate"], ["ṣ", "Harder than 'sh'"], ["ḥ", "Soft breath at end"], ["ṃ / ṁ", "Nasal hum"]].map(([s, d]) => (
                <div key={s} style={{ display: "flex", gap: 10, marginBottom: 7, alignItems: "center" }}>
                  <code style={{ minWidth: 52, padding: "3px 8px", background: "rgba(255,255,255,0.06)", borderRadius: 5, fontSize: 12, color: T.gold }}>{s}</code>
                  <span style={{ fontSize: 12.5, color: T.textMuted }}>{d}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Recording Card */}
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
      </Card>

      {micError && (
        <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: T.red }}>
          ⚠ {micError}
        </div>
      )}

      {/* Buttons */}
      {!isAnalyzing ? (
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
            <button onClick={stopAndAnalyze} style={{
              flex: 1, padding: "15px 24px", borderRadius: 50,
              background: "linear-gradient(135deg, #dc2626, #991b1b)",
              color: "#fff", fontSize: 16, fontWeight: 600,
              boxShadow: "0 8px 24px rgba(220,38,38,0.4)",
              animation: "pulse 2s infinite"
            }}>⏹ Stop & Analyse</button>
          )}
        </div>
      ) : (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
          padding: "15px 24px", borderRadius: 50,
          background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`
        }}>
          <Spinner />
          <span style={{ color: T.textMuted, fontSize: 14, letterSpacing: 0.5 }}>Guru Vaak is analysing your recitation...</span>
        </div>
      )}
    </div>
  );
};

// RESULTS SCREEN
const ResultsScreen = ({ data, onPracticeAgain, onChooseNew }) => {
  const { analysis, shloka } = data;

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

      {/* Score card */}
      <Card className="fade-up-2" accent style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 16 }}>
        <ScoreRing score={analysis.score} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
            <span style={{ fontFamily: "'Spectral', serif", fontSize: 48, fontWeight: 700, color: analysis.score >= 80 ? T.green : analysis.score >= 60 ? T.gold : T.red, lineHeight: 1 }}>
              {analysis.grade}
            </span>
            <Chip color={analysis.score >= 80 ? "green" : analysis.score >= 60 ? "gold" : "red"}>
              {analysis.score >= 80 ? "Excellent" : analysis.score >= 60 ? "Good" : "Keep Trying"}
            </Chip>
          </div>
          <p style={{ fontSize: 13.5, color: T.textMuted, lineHeight: 1.65 }}>{analysis.overall}</p>
        </div>
      </Card>

      {/* Praise */}
      {analysis.praise && (
        <Card className="fade-up-3" style={{ marginBottom: 14, borderColor: "rgba(74,222,128,0.25)", background: "rgba(74,222,128,0.04)" }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.green, marginBottom: 8 }}>✓ WHAT YOU DID WELL</div>
          <p style={{ fontSize: 14.5, lineHeight: 1.7, color: T.text }}>{analysis.praise}</p>
        </Card>
      )}

      {/* Mistakes */}
      {analysis.mistakes?.length > 0 && (
        <Card className="fade-up-3" style={{ marginBottom: 14, borderColor: "rgba(248,113,113,0.25)", background: "rgba(248,113,113,0.04)" }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.red, marginBottom: 12 }}>✗ AREAS TO IMPROVE</div>
          {analysis.mistakes.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: i < analysis.mistakes.length - 1 ? 10 : 0, alignItems: "flex-start" }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(248,113,113,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                <span style={{ color: T.red, fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "rgba(242,235,224,0.8)", margin: 0 }}>{m}</p>
            </div>
          ))}
        </Card>
      )}

      {/* Tips */}
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

      {/* Phonetic guide */}
      {analysis.phonetic_guide && (
        <Card style={{ marginBottom: 14, borderColor: "rgba(192,132,252,0.25)", background: "rgba(192,132,252,0.04)" }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.purple, marginBottom: 10 }}>🔤 PHONETIC BREAKDOWN</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
            <code style={{ fontSize: 18, color: T.purple, background: "rgba(192,132,252,0.12)", padding: "4px 12px", borderRadius: 8 }}>
              {analysis.phonetic_guide.word}
            </code>
          </div>
          <p style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.7, marginBottom: 4 }}>{analysis.phonetic_guide.breakdown}</p>
          {analysis.phonetic_guide.example && (
            <p style={{ fontSize: 13, color: T.textFaint }}>Similar to: "{analysis.phonetic_guide.example}"</p>
          )}
        </Card>
      )}

      {/* Sanskrit rule */}
      {analysis.sanskrit_rule && (
        <Card style={{ marginBottom: 14, borderColor: "rgba(125,211,252,0.2)", background: "rgba(125,211,252,0.03)" }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.blue, marginBottom: 8 }}>📚 SANSKRIT RULE</div>
          <p style={{ fontSize: 13.5, color: T.textMuted, lineHeight: 1.7 }}>{analysis.sanskrit_rule}</p>
        </Card>
      )}

      {/* Encouragement */}
      {analysis.encouragement && (
        <div style={{ textAlign: "center", padding: "14px 20px", marginBottom: 18 }}>
          <p style={{ fontFamily: "'Noto Sans Devanagari', serif", fontSize: 15, color: T.gold, lineHeight: 1.8, fontStyle: "italic" }}>
            "{analysis.encouragement}"
          </p>
        </div>
      )}

      <button onClick={onPracticeAgain} style={{
        width: "100%", padding: "15px 24px", borderRadius: 50,
        background: `linear-gradient(135deg, ${T.saffron}, ${T.saffronDark})`,
        color: "#fff", fontSize: 16, fontWeight: 600,
        boxShadow: `0 8px 24px rgba(255,107,43,0.3)`,
        marginBottom: 10
      }}>🔄 Practice Again</button>

      <button onClick={onChooseNew} style={{
        width: "100%", padding: "13px 24px", borderRadius: 50,
        background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`,
        color: T.textMuted, fontSize: 15, fontWeight: 500
      }}>Choose Different Shloka</button>
    </div>
  );
};

// ─────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────
export default function VaakSiddhi() {
  const [screen, setScreen] = useState("home");
  const [selectedShloka, setSelectedShloka] = useState(null);
  const [resultsData, setResultsData] = useState(null);
  const [dailyWord, setDailyWord] = useState(null);
  const [loadingWord, setLoadingWord] = useState(true);

  useEffect(() => {
    getDailyWord().then(w => { setDailyWord(w); setLoadingWord(false); }).catch(() => setLoadingWord(false));
  }, []);

  const handleSelectShloka = (shloka) => { setSelectedShloka(shloka); setScreen("practice"); };
  const handleResults = (data) => { setResultsData(data); setScreen("results"); };
  const handlePracticeAgain = () => setScreen("practice");
  const handleChooseNew = () => { setSelectedShloka(null); setScreen("library"); };

  const NAV = [
    { id: "home", icon: "🏠", label: "HOME" },
    { id: "library", icon: "📖", label: "SHLOKAS" },
    { id: "practice", icon: "🎙", label: "PRACTICE" },
  ];

  return (
    <>
      <style>{CSS}</style>
      {/* Ambient background */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: `
          radial-gradient(ellipse at 15% 40%, rgba(255,107,43,0.10) 0%, transparent 55%),
          radial-gradient(ellipse at 85% 15%, rgba(232,184,75,0.08) 0%, transparent 50%),
          radial-gradient(ellipse at 60% 85%, rgba(120,40,200,0.07) 0%, transparent 50%)
        `
      }} />

      {/* Scrollable content */}
      <div style={{
        position: "relative", zIndex: 1,
        maxWidth: 500, margin: "0 auto",
        padding: "0 18px 90px",
        minHeight: "100vh",
        overflowY: "auto"
      }}>
        {screen === "home" && <HomeScreen onNavigate={setScreen} dailyWord={dailyWord} loadingWord={loadingWord} />}
        {screen === "library" && <LibraryScreen onSelect={handleSelectShloka} />}
        {screen === "practice" && selectedShloka && (
          <PracticeScreen shloka={selectedShloka} onBack={() => setScreen("library")} onResults={handleResults} />
        )}
        {screen === "results" && resultsData && (
          <ResultsScreen data={resultsData} onPracticeAgain={handlePracticeAgain} onChooseNew={handleChooseNew} />
        )}
        {screen === "practice" && !selectedShloka && <LibraryScreen onSelect={handleSelectShloka} />}
      </div>

      {/* Bottom nav */}
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(13,8,24,0.96)", backdropFilter: "blur(24px)",
        borderTop: `1px solid ${T.border}`,
        display: "flex", justifyContent: "space-around", padding: "10px 0 14px",
        maxWidth: "100vw"
      }}>
        {NAV.map(n => {
          const active = screen === n.id || (n.id === "practice" && screen === "results");
          return (
            <button key={n.id} onClick={() => {
              if (n.id === "practice" && !selectedShloka) { setScreen("library"); return; }
              setScreen(n.id);
            }} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              color: active ? T.saffron : T.textFaint,
              fontSize: 10, letterSpacing: 1.5, padding: "4px 24px",
              transition: "color 0.2s",
              borderBottom: active ? `2px solid ${T.saffron}` : "2px solid transparent"
            }}>
              <span style={{ fontSize: 22 }}>{n.icon}</span>
              {n.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}
