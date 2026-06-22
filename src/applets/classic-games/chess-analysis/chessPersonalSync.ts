import {
  fetchChessComArchiveGames,
  fetchChessComArchiveUrls,
  type ChessComApiGame,
  type ChessComFetch,
} from "./chessComApi";
import { normalizePersonalChessComGames } from "./chessPersonalImport";
import type { PersonalChessGame } from "./chessPersonalTypes";

export type PersonalChessSyncProgress = {
  current: number;
  message: string;
  total: number;
};

export type PersonalChessSyncScope = "all" | "recent";

export type PersonalChessSyncResult = {
  archiveUrls: string[];
  games: PersonalChessGame[];
  rawGameCount: number;
};

export async function fetchPersonalChessComHistory({
  fetcher,
  onProgress,
  scope = "all",
  username,
}: {
  fetcher?: ChessComFetch;
  onProgress?: (progress: PersonalChessSyncProgress) => void;
  scope?: PersonalChessSyncScope;
  username: string;
}): Promise<PersonalChessSyncResult> {
  const trimmedUsername = username.trim();
  if (!trimmedUsername) {
    throw new Error("Enter Blake's Chess.com username.");
  }

  onProgress?.({ current: 0, message: "Fetching archive list.", total: 0 });
  const archiveUrls = await fetchChessComArchiveUrls(trimmedUsername, fetcher);
  const selectedArchiveUrls = scope === "recent" ? archiveUrls.slice(-3) : archiveUrls;
  const games: ChessComApiGame[] = [];

  for (const [index, archiveUrl] of selectedArchiveUrls.entries()) {
    onProgress?.({
      current: index,
      message: `Fetching archive ${index + 1} of ${selectedArchiveUrls.length}.`,
      total: selectedArchiveUrls.length,
    });
    const archiveGames = await fetchChessComArchiveGames(archiveUrl, fetcher);
    games.push(...archiveGames);
  }

  onProgress?.({
    current: selectedArchiveUrls.length,
    message: "Normalizing imported games.",
    total: selectedArchiveUrls.length,
  });

  return {
    archiveUrls: selectedArchiveUrls,
    games: normalizePersonalChessComGames(games, trimmedUsername),
    rawGameCount: games.length,
  };
}
