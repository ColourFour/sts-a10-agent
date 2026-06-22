import { Chess } from "chess.js";
import type { ChessComApiGame, ChessComApiPlayer } from "./chessComApi";
import type { ChessGameResult, ChessPlayerColor } from "./chessReportTypes";
import type { PersonalChessGame, PersonalChessOutcome, PersonalChessTimeClass } from "./chessPersonalTypes";

const drawResults = new Set([
  "50move",
  "agreed",
  "insufficient",
  "repetition",
  "stalemate",
  "timevsinsufficient",
]);

const lossResults = new Set(["abandoned", "checkmated", "resigned", "timeout"]);

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function normalizeTimeClass(timeClass: string | undefined): PersonalChessTimeClass {
  if (timeClass === "bullet" || timeClass === "blitz" || timeClass === "rapid" || timeClass === "daily") {
    return timeClass;
  }

  return "other";
}

function cleanResult(result: string | undefined): ChessGameResult {
  if (!result) {
    return "unknown";
  }

  if (result === "timevsinsufficient") {
    return "insufficient";
  }

  if (
    result === "win" ||
    result === "resigned" ||
    result === "timeout" ||
    result === "checkmated" ||
    result === "agreed" ||
    result === "repetition" ||
    result === "stalemate" ||
    result === "insufficient" ||
    result === "abandoned"
  ) {
    return result;
  }

  if (drawResults.has(result)) {
    return "draw";
  }

  return "unknown";
}

function resultForPlayer(player: ChessComApiPlayer, opponent: ChessComApiPlayer): ChessGameResult {
  if (player.result === "win") {
    return "win";
  }

  if (drawResults.has(player.result ?? "") || drawResults.has(opponent.result ?? "")) {
    return "draw";
  }

  if (opponent.result === "win") {
    const playerResult = cleanResult(player.result);
    return playerResult === "unknown" ? "loss" : playerResult;
  }

  return cleanResult(player.result);
}

function outcomeForResult(result: ChessGameResult): PersonalChessOutcome {
  if (result === "win") {
    return "win";
  }

  if (result === "draw" || result === "agreed" || result === "repetition" || result === "stalemate" || result === "insufficient") {
    return "draw";
  }

  if (result === "loss" || lossResults.has(result)) {
    return "loss";
  }

  return "other";
}

function localDateFromTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parsePgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const headerPattern = /^\[([A-Za-z0-9_]+)\s+"((?:\\"|[^"])*)"\]$/gm;
  let match = headerPattern.exec(pgn);

  while (match) {
    headers[match[1]] = match[2].replace(/\\"/g, '"');
    match = headerPattern.exec(pgn);
  }

  return headers;
}

function countMoves(pgn: string): number | null {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    return Math.ceil(chess.history().length / 2);
  } catch {
    const moveMatches = pgn
      .replace(/\{[^}]*\}/g, " ")
      .replace(/\[[^\]]+\]/g, " ")
      .match(/\b\d+\.(?!\.)/g);
    return moveMatches?.length ?? null;
  }
}

function gameIdFromUrl(gameUrl: string): string {
  const cleanedUrl = gameUrl.trim().replace(/\/+$/, "");
  const tail = cleanedUrl.split("/").filter(Boolean).at(-1);
  return tail || cleanedUrl;
}

export function normalizePersonalChessComGame(
  game: ChessComApiGame,
  username: string,
  importedAt = new Date().toISOString(),
): PersonalChessGame | null {
  if (game.rules && game.rules !== "chess") {
    return null;
  }

  const whiteUsername = game.white?.username ?? "";
  const blackUsername = game.black?.username ?? "";
  const normalizedUsername = normalizeUsername(username);
  const whiteMatches = normalizeUsername(whiteUsername) === normalizedUsername;
  const blackMatches = normalizeUsername(blackUsername) === normalizedUsername;

  if (!whiteMatches && !blackMatches) {
    return null;
  }

  if (!game.url || !game.pgn || !game.end_time) {
    return null;
  }

  const playerColor: ChessPlayerColor = whiteMatches ? "white" : "black";
  const player = whiteMatches ? game.white : game.black;
  const opponent = whiteMatches ? game.black : game.white;
  const headers = parsePgnHeaders(game.pgn);
  const result = resultForPlayer(player ?? {}, opponent ?? {});

  return {
    eco: headers.ECO || null,
    endDate: localDateFromTimestamp(game.end_time),
    endTimestamp: game.end_time,
    gameId: gameIdFromUrl(game.url),
    gameUrl: game.url,
    importedAt,
    moveCount: countMoves(game.pgn),
    normalizedResult: outcomeForResult(result),
    opening: headers.Opening || headers.Variant || null,
    opponentRating: opponent?.rating ?? null,
    opponentUsername: opponent?.username ?? "Unknown opponent",
    pgn: game.pgn,
    playerColor,
    playerRatingAfterGame: player?.rating ?? null,
    rated: game.rated === true,
    ratingChange: null,
    rawTimeClass: game.time_class ?? null,
    result,
    rules: game.rules ?? "chess",
    termination: headers.Termination || null,
    timeClass: normalizeTimeClass(game.time_class),
    timeControl: headers.TimeControl || null,
  };
}

export function normalizePersonalChessComGames(games: ChessComApiGame[], username: string): PersonalChessGame[] {
  const importedAt = new Date().toISOString();
  const byUrl = new Map<string, PersonalChessGame>();

  for (const apiGame of games) {
    const normalizedGame = normalizePersonalChessComGame(apiGame, username, importedAt);
    if (normalizedGame) {
      byUrl.set(normalizedGame.gameUrl, normalizedGame);
    }
  }

  const orderedGames = [...byUrl.values()].sort((left, right) => left.endTimestamp - right.endTimestamp);
  const previousRatingByTimeClass = new Map<PersonalChessTimeClass, number>();

  return orderedGames.map((game) => {
    const previousRating = previousRatingByTimeClass.get(game.timeClass);
    const ratingChange =
      previousRating === undefined || game.playerRatingAfterGame === null
        ? null
        : game.playerRatingAfterGame - previousRating;
    if (game.playerRatingAfterGame !== null) {
      previousRatingByTimeClass.set(game.timeClass, game.playerRatingAfterGame);
    }

    return {
      ...game,
      ratingChange,
    };
  });
}
