import { T } from "../styles/tokens.js";
import { Card, Chip, ProgressBar, Spinner } from "./ui/index.jsx";
import { getStats, getStreak, getPracticeHistory } from "../services/storage.js";

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

export default HomeScreen;
