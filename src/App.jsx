/**
 * VaakSiddhi (वाक्सिद्धि) — Root App
 * Handles routing between screens and global state.
 */

import { useState, useEffect } from "react";
import { CSS } from "./styles/tokens.js";
import { T } from "./styles/tokens.js";
import HomeScreen    from "./components/HomeScreen.jsx";
import LibraryScreen from "./components/LibraryScreen.jsx";
import PracticeScreen from "./components/PracticeScreen.jsx";
import ResultsScreen  from "./components/ResultsScreen.jsx";
import { getDailyWord } from "./services/llm.js";

const NAV = [
  { id: "home",     icon: "🏠", label: "HOME"     },
  { id: "library",  icon: "📖", label: "SHLOKAS"  },
  { id: "practice", icon: "🎙", label: "PRACTICE" },
];

export default function VaakSiddhi() {
  const [screen, setScreen] = useState("home");
  const [selectedShloka, setSelectedShloka] = useState(null);
  const [resultsData, setResultsData] = useState(null);
  const [dailyWord, setDailyWord] = useState(null);
  const [loadingWord, setLoadingWord] = useState(true);

  useEffect(() => {
    getDailyWord()
      .then(w => { setDailyWord(w); setLoadingWord(false); })
      .catch(() => setLoadingWord(false));
  }, []);

  const handleSelectShloka = (shloka) => { setSelectedShloka(shloka); setScreen("practice"); };
  const handleResults      = (data)   => { setResultsData(data); setScreen("results"); };
  const handlePracticeAgain = ()      => setScreen("practice");
  const handleChooseNew    = ()       => { setSelectedShloka(null); setScreen("library"); };

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
        {screen === "home" && (
          <HomeScreen onNavigate={setScreen} dailyWord={dailyWord} loadingWord={loadingWord} />
        )}
        {screen === "library" && (
          <LibraryScreen onSelect={handleSelectShloka} />
        )}
        {(screen === "practice" || screen === "results") && !selectedShloka && (
          <LibraryScreen onSelect={handleSelectShloka} />
        )}
        {screen === "practice" && selectedShloka && (
          <PracticeScreen shloka={selectedShloka} onBack={() => setScreen("library")} onResults={handleResults} />
        )}
        {screen === "results" && resultsData && selectedShloka && (
          <ResultsScreen data={resultsData} onPracticeAgain={handlePracticeAgain} onChooseNew={handleChooseNew} />
        )}
      </div>

      {/* Bottom nav */}
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(13,8,24,0.96)", backdropFilter: "blur(24px)",
        borderTop: `1px solid ${T.border}`,
        display: "flex", justifyContent: "space-around", padding: "10px 0 14px",
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
