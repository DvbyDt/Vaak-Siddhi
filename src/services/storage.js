/**
 * VaakSiddhi — Progress Storage Service
 *
 * Stage 1: localStorage (browser, no backend, no login)
 * Stage 2: Supabase (cloud, cross-device, with auth)
 * Stage 3: Supabase Pro with analytics
 *
 * All external calls go through this module — swap storage backend here.
 */

const STORAGE_KEYS = {
  HISTORY:  "vaaksiddhi_history",
  SETTINGS: "vaaksiddhi_settings",
  STREAK:   "vaaksiddhi_streak",
  SRS:      "vaaksiddhi_srs",        // spaced-repetition schedule per shlokaId
};

/**
 * Save a practice session result
 */
export function savePracticeResult({ shlokaId, chapter, verse, score, grade, transcript }) {
  const history = getPracticeHistory();
  const entry = {
    id: Date.now(),
    shlokaId,
    chapter,
    verse,
    score,
    grade,
    transcript: transcript?.slice(0, 200),
    date: new Date().toISOString(),
    dateDisplay: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })
  };
  history.unshift(entry);
  const trimmed = history.slice(0, 100); // keep last 100 sessions
  try {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(trimmed));
    updateStreak();
    updateSRSSchedule(shlokaId, score);
  } catch (e) {
    console.warn("Storage full — clearing old history");
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(trimmed.slice(0, 20)));
  }
  return entry;
}

/**
 * Get all practice history
 */
export function getPracticeHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || "[]");
  } catch {
    return [];
  }
}

/**
 * Get best score for a specific shloka
 */
export function getBestScore(shlokaId) {
  const history = getPracticeHistory();
  const attempts = history.filter(h => h.shlokaId === shlokaId);
  if (!attempts.length) return null;
  return Math.max(...attempts.map(a => a.score));
}

/**
 * Get statistics for the home screen
 */
export function getStats() {
  const history = getPracticeHistory();
  if (!history.length) return { totalSessions: 0, avgScore: 0, bestScore: 0, uniqueShlokas: 0 };

  const scores = history.map(h => h.score);
  const uniqueShlokas = new Set(history.map(h => h.shlokaId)).size;

  return {
    totalSessions: history.length,
    avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    bestScore: Math.max(...scores),
    uniqueShlokas
  };
}

/**
 * Update daily streak counter
 */
function updateStreak() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEYS.STREAK) || "{}");
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    if (data.lastDate === today) return; // already practiced today
    if (data.lastDate === yesterday) {
      data.count = (data.count || 0) + 1;
    } else {
      data.count = 1; // reset streak
    }
    data.lastDate = today;
    localStorage.setItem(STORAGE_KEYS.STREAK, JSON.stringify(data));
  } catch (e) {}
}

/**
 * Get current streak count
 */
export function getStreak() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEYS.STREAK) || "{}");
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (data.lastDate === today || data.lastDate === yesterday) {
      return data.count || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SPACED REPETITION (SRS)
//
// Algorithm (SM-2 simplified):
//   score >= 80  →  interval doubles (max 30 days)  — mastered
//   score >= 60  →  interval stays (3 days default)  — needs polish
//   score <  60  →  interval resets to 1 day         — needs re-learning
//
// Each entry in the SRS map:
//   { nextReview: ISO string, interval: days, easiness: 0-3 }
// ─────────────────────────────────────────────────────────────────────────────

function _readSRS() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.SRS) || "{}"); } catch { return {}; }
}
function _writeSRS(map) {
  try { localStorage.setItem(STORAGE_KEYS.SRS, JSON.stringify(map)); } catch {}
}

/** Called automatically inside savePracticeResult */
export function updateSRSSchedule(shlokaId, score) {
  const map   = _readSRS();
  const entry = map[shlokaId] || { interval: 1, easiness: 1 };

  let { interval, easiness } = entry;

  if (score >= 80) {
    easiness  = Math.min(3, easiness + 1);
    interval  = Math.min(30, Math.round(interval * (1.5 + easiness * 0.2)));
  } else if (score >= 60) {
    interval  = Math.max(3, interval);      // keep at 3 days minimum
  } else {
    easiness  = Math.max(0, easiness - 1);
    interval  = 1;                          // review tomorrow
  }

  const nextReview = new Date(Date.now() + interval * 86400000).toISOString();
  map[shlokaId]    = { nextReview, interval, easiness, lastScore: score };
  _writeSRS(map);
}

/**
 * Returns shlokas due for review today, sorted by urgency (most overdue first).
 * Each item: { shlokaId, daysOverdue, lastScore, interval }
 */
export function getSRSQueue() {
  const map  = _readSRS();
  const now  = Date.now();
  return Object.entries(map)
    .filter(([, v]) => new Date(v.nextReview).getTime() <= now)
    .map(([shlokaId, v]) => ({
      shlokaId,
      daysOverdue: Math.floor((now - new Date(v.nextReview).getTime()) / 86400000),
      lastScore:   v.lastScore,
      interval:    v.interval,
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/**
 * Returns the next review date for a shloka, or null if never practiced.
 */
export function getNextReviewDate(shlokaId) {
  const entry = _readSRS()[shlokaId];
  return entry ? new Date(entry.nextReview) : null;
}

/**
 * Save user settings
 */
export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (e) {}
}

/**
 * Get user settings with defaults
 */
export function getSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || "{}");
    return {
      showTransliteration: true,
      autoPlayReference: false,
      preferredLanguage: "hindi",
      ...saved
    };
  } catch {
    return { showTransliteration: true, autoPlayReference: false, preferredLanguage: "hindi" };
  }
}
