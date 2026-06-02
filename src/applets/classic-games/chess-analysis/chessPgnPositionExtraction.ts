import { Chess } from "chess.js";
import type { ChessPlayerColor, ExtractedMovePosition, NormalizedChessGame } from "./chessReportTypes";

function colorFromMove(color: "b" | "w"): ChessPlayerColor {
  return color === "w" ? "white" : "black";
}

function uciFromVerboseMove(move: { from: string; promotion?: string; to: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

export function extractPlayerMovePositions(game: NormalizedChessGame): ExtractedMovePosition[] {
  const chess = new Chess();
  chess.loadPgn(game.pgn);

  return chess
    .history({ verbose: true })
    .filter((move) => colorFromMove(move.color) === game.playerColor)
    .map((move) => ({
      fenAfter: move.after,
      fenBefore: move.before,
      gameUrl: game.gameUrl,
      moveNumber: Number(move.before.split(" ")[5]),
      playedMove: move.san,
      playedMoveUci: uciFromVerboseMove(move),
      playerColor: game.playerColor,
      sideToMove: colorFromMove(move.color),
    }));
}
