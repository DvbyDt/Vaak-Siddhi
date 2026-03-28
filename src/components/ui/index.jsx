// Reusable UI primitives shared across all screens.
import { T } from "../../styles/tokens.js";

export const Chip = ({ children, color = "orange", style }) => {
  const colors = {
    orange: { bg: "rgba(255,107,43,0.15)", text: T.saffronLight, border: "rgba(255,107,43,0.25)" },
    gold:   { bg: "rgba(232,184,75,0.12)",  text: T.goldLight,    border: "rgba(232,184,75,0.25)" },
    green:  { bg: "rgba(74,222,128,0.1)",   text: T.green,        border: "rgba(74,222,128,0.2)"  },
    red:    { bg: "rgba(248,113,113,0.1)",  text: T.red,          border: "rgba(248,113,113,0.2)" },
    blue:   { bg: "rgba(125,211,252,0.1)",  text: T.blue,         border: "rgba(125,211,252,0.2)" },
    purple: { bg: "rgba(192,132,252,0.1)",  text: T.purple,       border: "rgba(192,132,252,0.2)" },
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

export const Card = ({ children, style, onClick, accent, className }) => (
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

export const ScoreRing = ({ score, size = 110 }) => {
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

export const WaveformBars = ({ isRecording, barCount = 28 }) => (
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

export const ProgressBar = ({ value, max = 100, color = T.saffron }) => (
  <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
    <div style={{
      height: "100%", borderRadius: 2,
      background: `linear-gradient(90deg, ${color}, ${T.gold})`,
      width: `${Math.min((value / max) * 100, 100)}%`,
      transition: "width 1s cubic-bezier(0.4,0,0.2,1)"
    }} />
  </div>
);

export const DifficultyBadge = ({ level }) => {
  const map = { beginner: ["green", "●"], intermediate: ["gold", "●●"], advanced: ["red", "●●●"] };
  const [color, dots] = map[level] || ["blue", "?"];
  return <Chip color={color}>{dots} {level}</Chip>;
};

export const Spinner = () => (
  <div style={{
    width: 20, height: 20, borderRadius: "50%",
    border: `2px solid rgba(255,255,255,0.1)`,
    borderTopColor: T.saffron,
    animation: "spin 0.7s linear infinite"
  }} />
);
