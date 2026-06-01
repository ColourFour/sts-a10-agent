export type HighScoreEntry = {
  date: string;
  gameId: string;
  score: number;
  settings?: string;
};

const storageKey = "sts2.localHighScores.v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getHighScores(gameId: string, limit = 5): HighScoreEntry[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    const scores = raw ? (JSON.parse(raw) as HighScoreEntry[]) : [];
    return scores
      .filter((entry) => entry.gameId === gameId)
      .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))
      .slice(0, limit);
  } catch {
    return [];
  }
}

export function recordHighScore(entry: Omit<HighScoreEntry, "date">): HighScoreEntry[] {
  if (!canUseStorage()) {
    return [];
  }

  let scores: HighScoreEntry[] = [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    scores = raw ? (JSON.parse(raw) as HighScoreEntry[]) : [];
  } catch {
    scores = [];
  }

  try {
    const nextEntry = { ...entry, date: new Date().toISOString() };
    const nextScores = [...scores, nextEntry]
      .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))
      .slice(0, 100);

    window.localStorage.setItem(storageKey, JSON.stringify(nextScores));
    return getHighScores(entry.gameId);
  } catch {
    return [];
  }
}

export function formatScoreDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
