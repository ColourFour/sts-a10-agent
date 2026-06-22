import type {
  PersonalChessGame,
  PersonalChessImportResult,
  PersonalChessMistake,
  PersonalChessSyncMeta,
  PersonalDrillReview,
  PersonalDrillStatus,
} from "./chessPersonalTypes";

const databaseName = "sts2-blake-chess-trainer";
const databaseVersion = 1;
const gameStoreName = "games";
const mistakeStoreName = "mistakes";
const localGamesKey = "sts2.blakeChessTrainer.games";
const localMistakesKey = "sts2.blakeChessTrainer.mistakes";
const syncMetaKey = "sts2.blakeChessTrainer.syncMeta";
const drillStatusKey = "sts2.blakeChessTrainer.drillStatuses";

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function openPersonalChessDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onerror = () => reject(request.error ?? new Error("Could not open local chess database."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(gameStoreName)) {
        const gameStore = database.createObjectStore(gameStoreName, { keyPath: "gameUrl" });
        gameStore.createIndex("timeClass", "timeClass", { unique: false });
        gameStore.createIndex("endTimestamp", "endTimestamp", { unique: false });
      }

      if (!database.objectStoreNames.contains(mistakeStoreName)) {
        const mistakeStore = database.createObjectStore(mistakeStoreName, { keyPath: "id" });
        mistakeStore.createIndex("gameUrl", "gameUrl", { unique: false });
        mistakeStore.createIndex("date", "date", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function readIndexedDbGames(): Promise<PersonalChessGame[]> {
  const database = await openPersonalChessDatabase();
  try {
    const transaction = database.transaction(gameStoreName, "readonly");
    const store = transaction.objectStore(gameStoreName);
    return await requestToPromise<PersonalChessGame[]>(store.getAll());
  } finally {
    database.close();
  }
}

async function writeIndexedDbGames(games: PersonalChessGame[]): Promise<void> {
  const database = await openPersonalChessDatabase();
  try {
    const transaction = database.transaction(gameStoreName, "readwrite");
    const store = transaction.objectStore(gameStoreName);
    store.clear();
    for (const game of games) {
      store.put(game);
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save imported games."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Could not save imported games."));
    });
  } finally {
    database.close();
  }
}

async function readIndexedDbMistakes(): Promise<PersonalChessMistake[]> {
  const database = await openPersonalChessDatabase();
  try {
    const transaction = database.transaction(mistakeStoreName, "readonly");
    const store = transaction.objectStore(mistakeStoreName);
    return await requestToPromise<PersonalChessMistake[]>(store.getAll());
  } finally {
    database.close();
  }
}

async function writeIndexedDbMistakes(mistakes: PersonalChessMistake[]): Promise<void> {
  const database = await openPersonalChessDatabase();
  try {
    const transaction = database.transaction(mistakeStoreName, "readwrite");
    const store = transaction.objectStore(mistakeStoreName);
    store.clear();
    for (const mistake of mistakes) {
      store.put(mistake);
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save analyzed mistakes."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Could not save analyzed mistakes."));
    });
  } finally {
    database.close();
  }
}

function readJsonFromLocalStorage<T>(key: string, fallback: T): T {
  if (!canUseLocalStorage()) {
    return fallback;
  }

  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonToLocalStorage<T>(key: string, value: T): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Browser quota can be tight for full PGN history; IndexedDB is preferred when available.
  }
}

function mergeGames(existingGames: PersonalChessGame[], importedGames: PersonalChessGame[]): {
  games: PersonalChessGame[];
  result: PersonalChessImportResult;
} {
  const byUrl = new Map(existingGames.map((game) => [game.gameUrl, game]));
  let duplicateCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;

  function comparableGame(game: PersonalChessGame): Omit<PersonalChessGame, "importedAt"> {
    const { importedAt: _importedAt, ...rest } = game;
    return rest;
  }

  for (const game of importedGames) {
    const existingGame = byUrl.get(game.gameUrl);
    if (!existingGame) {
      insertedCount += 1;
      byUrl.set(game.gameUrl, game);
      continue;
    }

    duplicateCount += 1;
    if (JSON.stringify(comparableGame(existingGame)) !== JSON.stringify(comparableGame(game))) {
      updatedCount += 1;
      byUrl.set(game.gameUrl, {
        ...game,
        importedAt: existingGame.importedAt,
      });
    }
  }

  const games = [...byUrl.values()].sort((left, right) => left.endTimestamp - right.endTimestamp);
  return {
    games,
    result: {
      duplicateCount,
      importedCount: importedGames.length,
      insertedCount,
      totalCount: games.length,
      updatedCount,
    },
  };
}

export async function readPersonalChessGames(): Promise<PersonalChessGame[]> {
  if (canUseIndexedDb()) {
    try {
      return (await readIndexedDbGames()).sort((left, right) => left.endTimestamp - right.endTimestamp);
    } catch {
      return readJsonFromLocalStorage<PersonalChessGame[]>(localGamesKey, []).sort(
        (left, right) => left.endTimestamp - right.endTimestamp,
      );
    }
  }

  return readJsonFromLocalStorage<PersonalChessGame[]>(localGamesKey, []).sort(
    (left, right) => left.endTimestamp - right.endTimestamp,
  );
}

export async function importPersonalChessGames(importedGames: PersonalChessGame[]): Promise<PersonalChessImportResult> {
  const existingGames = await readPersonalChessGames();
  const merged = mergeGames(existingGames, importedGames);

  if (canUseIndexedDb()) {
    try {
      await writeIndexedDbGames(merged.games);
      return merged.result;
    } catch {
      writeJsonToLocalStorage(localGamesKey, merged.games);
      return merged.result;
    }
  }

  writeJsonToLocalStorage(localGamesKey, merged.games);
  return merged.result;
}

export async function replacePersonalChessMistakes(mistakes: PersonalChessMistake[]): Promise<void> {
  const orderedMistakes = [...mistakes].sort((left, right) => right.centipawnLoss - left.centipawnLoss);

  if (canUseIndexedDb()) {
    try {
      await writeIndexedDbMistakes(orderedMistakes);
      return;
    } catch {
      writeJsonToLocalStorage(localMistakesKey, orderedMistakes);
      return;
    }
  }

  writeJsonToLocalStorage(localMistakesKey, orderedMistakes);
}

export async function readPersonalChessMistakes(): Promise<PersonalChessMistake[]> {
  if (canUseIndexedDb()) {
    try {
      return (await readIndexedDbMistakes()).sort((left, right) => right.centipawnLoss - left.centipawnLoss);
    } catch {
      return readJsonFromLocalStorage<PersonalChessMistake[]>(localMistakesKey, []).sort(
        (left, right) => right.centipawnLoss - left.centipawnLoss,
      );
    }
  }

  return readJsonFromLocalStorage<PersonalChessMistake[]>(localMistakesKey, []).sort(
    (left, right) => right.centipawnLoss - left.centipawnLoss,
  );
}

export function readPersonalChessSyncMeta(): PersonalChessSyncMeta | null {
  return readJsonFromLocalStorage<PersonalChessSyncMeta | null>(syncMetaKey, null);
}

export function writePersonalChessSyncMeta(meta: PersonalChessSyncMeta): void {
  writeJsonToLocalStorage(syncMetaKey, meta);
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysToLocalDate(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

export function createDefaultPersonalDrillReview(today = localDateKey(new Date())): PersonalDrillReview {
  return {
    attempts: 0,
    correct: 0,
    incorrect: 0,
    intervalDays: 0,
    lastReviewedDate: null,
    nextDueDate: today,
    status: "needs-review",
  };
}

function migrateLegacyDrillStatus(status: string, today: string): PersonalDrillReview {
  if (status === "understood") {
    return {
      attempts: 1,
      correct: 1,
      incorrect: 0,
      intervalDays: 7,
      lastReviewedDate: null,
      nextDueDate: addDaysToLocalDate(today, 7),
      status: "solved",
    };
  }

  if (status === "repeat") {
    return {
      attempts: 1,
      correct: 0,
      incorrect: 1,
      intervalDays: 1,
      lastReviewedDate: null,
      nextDueDate: addDaysToLocalDate(today, 1),
      status: "failed",
    };
  }

  return createDefaultPersonalDrillReview(today);
}

function normalizePersonalDrillReview(value: unknown, today: string): PersonalDrillReview {
  if (typeof value === "string") {
    return migrateLegacyDrillStatus(value, today);
  }

  if (!value || typeof value !== "object") {
    return createDefaultPersonalDrillReview(today);
  }

  const candidate = value as Partial<PersonalDrillReview>;
  const status: PersonalDrillStatus =
    candidate.status === "solved" || candidate.status === "failed" || candidate.status === "needs-review"
      ? candidate.status
      : "needs-review";
  const attempts = Number.isFinite(candidate.attempts) ? Math.max(0, Math.round(candidate.attempts ?? 0)) : 0;
  const correct = Number.isFinite(candidate.correct) ? Math.max(0, Math.round(candidate.correct ?? 0)) : 0;
  const incorrect = Number.isFinite(candidate.incorrect) ? Math.max(0, Math.round(candidate.incorrect ?? 0)) : 0;
  const intervalDays = Number.isFinite(candidate.intervalDays)
    ? Math.max(0, Math.round(candidate.intervalDays ?? 0))
    : 0;
  const nextDueDate =
    typeof candidate.nextDueDate === "string" && candidate.nextDueDate.trim()
      ? candidate.nextDueDate
      : today;
  const lastReviewedDate =
    typeof candidate.lastReviewedDate === "string" && candidate.lastReviewedDate.trim()
      ? candidate.lastReviewedDate
      : null;

  return {
    attempts,
    correct,
    incorrect,
    intervalDays,
    lastReviewedDate,
    nextDueDate,
    status,
  };
}

export function readPersonalDrillReviews(): Record<string, PersonalDrillReview> {
  const today = localDateKey(new Date());
  const rawReviews = readJsonFromLocalStorage<Record<string, unknown>>(drillStatusKey, {});
  return Object.fromEntries(
    Object.entries(rawReviews).map(([id, review]) => [id, normalizePersonalDrillReview(review, today)]),
  );
}

export function schedulePersonalDrillReview(
  currentReview: PersonalDrillReview | undefined,
  status: PersonalDrillStatus,
  reviewedDate = localDateKey(new Date()),
): PersonalDrillReview {
  const review = currentReview ?? createDefaultPersonalDrillReview(reviewedDate);
  const isSolved = status === "solved";
  const nextInterval =
    status === "solved"
      ? review.intervalDays <= 0
        ? 3
        : Math.min(30, Math.max(3, review.intervalDays * 2))
      : status === "failed"
        ? 1
        : 0;

  return {
    attempts: review.attempts + 1,
    correct: review.correct + (isSolved ? 1 : 0),
    incorrect: review.incorrect + (isSolved ? 0 : 1),
    intervalDays: nextInterval,
    lastReviewedDate: reviewedDate,
    nextDueDate: addDaysToLocalDate(reviewedDate, nextInterval),
    status,
  };
}

export function writePersonalDrillReview(
  id: string,
  status: PersonalDrillStatus,
): Record<string, PersonalDrillReview> {
  const reviews = readPersonalDrillReviews();
  const nextReviews = {
    ...reviews,
    [id]: schedulePersonalDrillReview(reviews[id], status),
  };
  writeJsonToLocalStorage(drillStatusKey, nextReviews);
  return nextReviews;
}
