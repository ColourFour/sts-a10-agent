import type { ChessComApiGame, ChessComApiPlayer } from "./chessComApi";
import type {
  ChessGameResult,
  ChessPlayerColor,
  ChessComTrackedTimeClass,
  NormalizedChessGame,
} from "./chessReportTypes";

const trackedTimeClasses = new Set<ChessComTrackedTimeClass>(["bullet", "blitz", "rapid"]);
const drawResults = new Set([
  "agreed",
  "repetition",
  "stalemate",
  "insufficient",
  "50move",
  "timevsinsufficient",
]);

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function isTrackedTimeClass(timeClass: string | undefined): timeClass is ChessComTrackedTimeClass {
  return timeClass === "bullet" || timeClass === "blitz" || timeClass === "rapid";
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
    return "loss";
  }

  return cleanResult(player.result);
}

function localDateFromTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeChessComGame(
  game: ChessComApiGame,
  username: string,
): NormalizedChessGame | null {
  if (!isTrackedTimeClass(game.time_class) || game.rules !== "chess") {
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

  return {
    gameUrl: game.url,
    pgn: game.pgn,
    timeClass: game.time_class,
    endTimestamp: game.end_time,
    endDate: localDateFromTimestamp(game.end_time),
    playerColor,
    result: resultForPlayer(player ?? {}, opponent ?? {}),
    playerRatingAfterGame: player?.rating ?? null,
    opponentUsername: opponent?.username ?? "Unknown opponent",
    opponentRating: opponent?.rating ?? null,
    rated: game.rated === true,
  };
}

export function normalizeChessComGames(
  games: ChessComApiGame[],
  username: string,
  options: { ratedOnly?: boolean } = { ratedOnly: true },
): NormalizedChessGame[] {
  return games
    .map((game) => normalizeChessComGame(game, username))
    .filter((game): game is NormalizedChessGame => Boolean(game))
    .filter((game) => !options.ratedOnly || game.rated)
    .sort((left, right) => left.endTimestamp - right.endTimestamp);
}
