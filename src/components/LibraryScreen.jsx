import { useState, useEffect, useMemo, useRef } from "react";
import { T } from "../styles/tokens.js";
import { Chip, Card, DifficultyBadge, ProgressBar, Spinner } from "./ui/index.jsx";
import { getBestScore } from "../services/storage.js";

const PAGE_SIZE   = 20;
const SCROLL_KEY  = "vaaksiddhi_library_scroll";
const FILTER_KEY  = "vaaksiddhi_library_filter";

const LibraryScreen = ({ onSelect }) => {
  // ── lazy-load shlokas (16 MB JSON — don't block first paint) ──────────────
  const [shlokas, setShlokas]       = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    import("../data/shlokas.json").then(mod => {
      setShlokas(mod.default);
      setDataLoading(false);
    });
  }, []);

  // ── derived lists (memoised so they don't recompute on every keystroke) ───
  const chapters = useMemo(
    () => [...new Set(shlokas.map(s => s.chapter))].sort((a, b) => a - b),
    [shlokas]
  );
  const chapterNames = useMemo(() => {
    const m = {};
    shlokas.forEach(s => { if (s.chapter_name) m[s.chapter] = s.chapter_name; });
    return m;
  }, [shlokas]);

  // ── filters — restored from sessionStorage so they survive navigation ─────
  const savedFilters = (() => {
    try { return JSON.parse(sessionStorage.getItem(FILTER_KEY) || "{}"); } catch { return {}; }
  })();

  const [filter,        setFilter]        = useState(savedFilters.filter        || "all");
  const [chapterFilter, setChapterFilter] = useState(savedFilters.chapterFilter || "all");
  const [search,        setSearch]        = useState(savedFilters.search        || "");
  const [page,          setPage]          = useState(1);

  // Persist filters to sessionStorage whenever they change
  useEffect(() => {
    sessionStorage.setItem(FILTER_KEY, JSON.stringify({ filter, chapterFilter, search }));
    setPage(1);
  }, [filter, chapterFilter, search]);

  // ── scroll restoration ────────────────────────────────────────────────────
  const listRef = useRef(null);

  useEffect(() => {
    if (!dataLoading) {
      const savedY = parseInt(sessionStorage.getItem(SCROLL_KEY) || "0", 10);
      window.scrollTo({ top: savedY, behavior: "instant" });
    }
  }, [dataLoading]);

  useEffect(() => {
    const onScroll = () => sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => shlokas.filter(s => {
    const matchDiff    = filter === "all" || s.difficulty === filter;
    const matchChapter = chapterFilter === "all" || s.chapter === Number(chapterFilter);
    const q = search.toLowerCase();
    const matchSearch  = !q
      || s.english.toLowerCase().includes(q)
      || (s.hindi && s.hindi.includes(search))
      || s.keywords.some(k => k.includes(q))
      || `ch${s.chapter}`.includes(q)
      || s.title.toLowerCase().includes(q)
      || (s.chapter_name && s.chapter_name.toLowerCase().includes(q))
      || s.sanskrit.includes(search);
    return matchDiff && matchChapter && matchSearch;
  }), [shlokas, filter, chapterFilter, search]);

  const paged = filtered.slice(0, page * PAGE_SIZE);

  if (dataLoading) {
    return (
      <div style={{ paddingTop: 80, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <Spinner />
        <p style={{ color: T.textFaint, fontSize: 13 }}>Loading 700+ shlokas…</p>
      </div>
    );
  }

  return (
    <div ref={listRef} style={{ paddingTop: 52 }}>
      <h2 className="fade-up" style={{ fontFamily: "'Spectral', serif", fontSize: 28, marginBottom: 6 }}>
        Choose a Shloka
      </h2>
      <p className="fade-up" style={{ fontSize: 13, color: T.textMuted, marginBottom: 18 }}>
        {shlokas.length} shlokas across 18 chapters
      </p>

      {/* Search */}
      <div className="fade-up-2" style={{ position: "relative", marginBottom: 14 }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.textFaint, fontSize: 16 }}>🔍</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by keyword, chapter, verse, or theme…"
          aria-label="Search shlokas"
          style={{
            width: "100%", padding: "11px 14px 11px 38px", borderRadius: 12,
            background: T.surface, border: `1px solid ${T.border}`,
            color: T.text, fontSize: 14, outline: "none", transition: "border-color 0.2s"
          }}
          onFocus={e => e.target.style.borderColor = T.borderAccent}
          onBlur={e => e.target.style.borderColor = T.border}
        />
      </div>

      {/* Chapter selector */}
      <div className="fade-up-2" style={{ marginBottom: 12 }}>
        <select
          value={chapterFilter}
          onChange={e => setChapterFilter(e.target.value)}
          aria-label="Filter by chapter"
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 10,
            background: T.deepLight, border: `1px solid ${T.border}`,
            color: T.text, fontSize: 13, outline: "none", cursor: "pointer", appearance: "auto"
          }}
        >
          <option value="all">All Chapters (1–18)</option>
          {chapters.map(ch => (
            <option key={ch} value={ch}>Chapter {ch}: {chapterNames[ch] || ""}</option>
          ))}
        </select>
      </div>

      {/* Difficulty filters */}
      <div className="fade-up-2" style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {["all", "beginner", "intermediate", "advanced"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            style={{
              padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 500, letterSpacing: 0.5,
              border: `1px solid ${filter === f ? T.saffron : T.border}`,
              background: filter === f ? "rgba(255,107,43,0.18)" : "transparent",
              color: filter === f ? T.saffronLight : T.textMuted,
              transition: "all 0.2s"
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span style={{ fontSize: 12, color: T.textFaint, alignSelf: "center", marginLeft: "auto" }}>
          {filtered.length} found
        </span>
      </div>

      {/* Shloka cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {paged.map((shloka, idx) => {
          const best = getBestScore(shloka.id);
          return (
            <Card
              key={shloka.id}
              onClick={() => onSelect(shloka)}
              style={{ animationDelay: `${Math.min(idx % PAGE_SIZE, 5) * 0.05}s` }}
            >
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
                  <span style={{ color: T.textFaint, fontSize: 18 }} aria-hidden="true">→</span>
                </div>
              </div>

              <p style={{ fontSize: 13, fontWeight: 500, color: T.saffronLight, marginBottom: 8, letterSpacing: 0.3 }}>
                {shloka.chapter_name || shloka.title}
              </p>

              <p style={{
                fontFamily: "'Noto Sans Devanagari', serif", fontSize: 17,
                color: T.text, lineHeight: 1.85, marginBottom: 10,
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden"
              }}>
                {shloka.sanskrit.split("\n").slice(0, 2).join(" ")}
              </p>

              <p style={{ fontSize: 12.5, color: T.textFaint, lineHeight: 1.6, fontStyle: "italic" }}>
                "{shloka.english.substring(0, 90)}{shloka.english.length > 90 ? "…" : ""}"
              </p>

              {best !== null && <div style={{ marginTop: 12 }}><ProgressBar value={best} /></div>}
            </Card>
          );
        })}

        {paged.length < filtered.length && (
          <button
            onClick={() => setPage(p => p + 1)}
            aria-label={`Load more shlokas (${filtered.length - paged.length} remaining)`}
            style={{
              padding: "14px 24px", borderRadius: 14,
              background: "rgba(255,107,43,0.1)", border: `1px solid rgba(255,107,43,0.25)`,
              color: T.saffronLight, fontSize: 14, fontWeight: 500, cursor: "pointer", transition: "all 0.2s"
            }}
          >
            Load More ({filtered.length - paged.length} remaining)
          </button>
        )}

        {!dataLoading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: T.textFaint }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🕉</div>
            No shlokas found. Try a different search.
          </div>
        )}
      </div>
    </div>
  );
};

export default LibraryScreen;
