// Design tokens — single source of truth for all colors, fonts, and CSS animations.
export const T = {
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

export const CSS = `
  /*
   * Google Fonts loaded non-blocking (display=swap) so the app renders
   * immediately with system fonts, then upgrades when the network responds.
   * If offline, the system fallback stack below keeps everything readable.
   */
  @import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,300;0,400;0,600;0,700;1,400&family=Sora:wght@300;400;500;600&family=Noto+Sans+Devanagari:wght@400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }

  body {
    background: ${T.deep};
    color: ${T.text};
    /* Sora → system UI stack. Looks great on all platforms offline. */
    font-family: 'Sora', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    overscroll-behavior: none;
  }

  /* Serif elements (headings, scores) */
  .font-serif {
    font-family: 'Spectral', 'Georgia', 'Cambria', 'Times New Roman', serif;
  }

  /* Devanagari — Android/iOS ship Noto Devanagari; fallback to system Devanagari */
  .font-devanagari {
    font-family: 'Noto Sans Devanagari', 'Kohinoor Devanagari', 'Devanagari MT', serif;
  }

  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

  @keyframes fadeUp  { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse   { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
  @keyframes spin    { to { transform: rotate(360deg); } }
  @keyframes ripple  { 0% { transform:scale(1); opacity:0.6; } 100% { transform:scale(2.5); opacity:0; } }
  @keyframes barWave { 0%,100% { transform:scaleY(0.2); } 50% { transform:scaleY(1); } }
  @keyframes shimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }

  .fade-up   { animation: fadeUp 0.45s ease forwards; }
  .fade-up-2 { animation: fadeUp 0.45s 0.1s ease both; }
  .fade-up-3 { animation: fadeUp 0.45s 0.2s ease both; }
  .fade-up-4 { animation: fadeUp 0.45s 0.3s ease both; }

  button { font-family: inherit; cursor: pointer; border: none; background: none; }
  input, select, textarea { font-family: inherit; }
`;
