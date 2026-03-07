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
  HISTORY: "vaaksiddhi_history",
  SETTINGS: "vaaksiddhi_settings",
  STREAK: "vaaksiddhi_streak"
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
