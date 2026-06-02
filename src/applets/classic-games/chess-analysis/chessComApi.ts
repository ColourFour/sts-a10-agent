export type ChessComArchiveListResponse = {
  archives: string[];
};

export type ChessComApiPlayer = {
  username?: string;
  rating?: number;
  result?: string;
};

export type ChessComApiGame = {
  url?: string;
  pgn?: string;
  time_class?: string;
  end_time?: number;
  rated?: boolean;
  rules?: string;
  white?: ChessComApiPlayer;
  black?: ChessComApiPlayer;
};

export type ChessComArchiveResponse = {
  games: ChessComApiGame[];
};

export type ChessComFetch = <T>(url: string) => Promise<T>;

const cachePrefix = "sts2.chessComAnalysis";
const archiveListTtlMs = 60 * 60 * 1000;
const archiveGamesTtlMs = 6 * 60 * 60 * 1000;

type CacheEnvelope<T> = {
  savedAt: number;
  value: T;
};

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readCache<T>(key: string, ttlMs: number): T | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) {
      return null;
    }

    const envelope = JSON.parse(rawValue) as CacheEnvelope<T>;
    if (Date.now() - envelope.savedAt > ttlMs) {
      return null;
    }

    return envelope.value;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // Local cache is a convenience only. Ignore quota and privacy-mode failures.
  }
}

export const defaultChessComFetch: ChessComFetch = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Chess.com request failed (${response.status}) for ${url}`);
  }

  return response.json() as Promise<T>;
};

export async function fetchChessComArchiveUrls(
  username: string,
  fetcher: ChessComFetch = defaultChessComFetch,
): Promise<string[]> {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    throw new Error("Enter a Chess.com username.");
  }

  const cacheKey = `${cachePrefix}.archives.${normalizedUsername}`;
  const cached = readCache<string[]>(cacheKey, archiveListTtlMs);
  if (cached) {
    return cached;
  }

  const response = await fetcher<ChessComArchiveListResponse>(
    `https://api.chess.com/pub/player/${encodeURIComponent(normalizedUsername)}/games/archives`,
  );
  const archives = Array.isArray(response.archives) ? response.archives : [];
  writeCache(cacheKey, archives);
  return archives;
}

export async function fetchChessComArchiveGames(
  archiveUrl: string,
  fetcher: ChessComFetch = defaultChessComFetch,
): Promise<ChessComApiGame[]> {
  const cacheKey = `${cachePrefix}.archive.${archiveUrl}`;
  const cached = readCache<ChessComApiGame[]>(cacheKey, archiveGamesTtlMs);
  if (cached) {
    return cached;
  }

  const response = await fetcher<ChessComArchiveResponse>(archiveUrl);
  const games = Array.isArray(response.games) ? response.games : [];
  writeCache(cacheKey, games);
  return games;
}

export async function fetchRecentChessComGames({
  fetcher = defaultChessComFetch,
  monthCount = 3,
  username,
}: {
  fetcher?: ChessComFetch;
  monthCount?: number;
  username: string;
}): Promise<{ archiveUrls: string[]; games: ChessComApiGame[] }> {
  const archives = await fetchChessComArchiveUrls(username, fetcher);
  const selectedArchiveUrls = archives.slice(-Math.max(1, monthCount));
  const games: ChessComApiGame[] = [];

  for (const archiveUrl of selectedArchiveUrls) {
    const archiveGames = await fetchChessComArchiveGames(archiveUrl, fetcher);
    games.push(...archiveGames);
  }

  return { archiveUrls: selectedArchiveUrls, games };
}

export function saveLastChessComUsername(username: string): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(`${cachePrefix}.lastUsername`, username.trim());
  } catch {
    // Ignore local storage failures.
  }
}

export function readLastChessComUsername(): string {
  if (!canUseLocalStorage()) {
    return "";
  }

  try {
    return window.localStorage.getItem(`${cachePrefix}.lastUsername`) ?? "";
  } catch {
    return "";
  }
}
