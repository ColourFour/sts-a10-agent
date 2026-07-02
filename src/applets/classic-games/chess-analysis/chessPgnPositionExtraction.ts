import { Chess } from "chess.js";
import type { ChessPlayerColor, ExtractedMovePosition, NormalizedChessGame } from "./chessReportTypes";

type PgnPositionGame = Pick<NormalizedChessGame, "gameUrl" | "pgn" | "playerColor">;

export type ExtractedGameMovePosition = ExtractedMovePosition & {
  isPlayerMove: boolean;
  ply: number;
};

function colorFromMove(color: "b" | "w"): ChessPlayerColor {
  return color === "w" ? "white" : "black";
}

function uciFromVerboseMove(move: { from: string; promotion?: string; to: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

export function extractPlayerMovePositions(game: NormalizedChessGame): ExtractedMovePosition[] {
  return extractGameMovePositions(game)
    .filter((move) => move.isPlayerMove)
    .map(({ isPlayerMove: _isPlayerMove, ply: _ply, ...move }) => move);
}

export function extractGameMovePositions(game: PgnPositionGame): ExtractedGameMovePosition[] {
  const chess = new Chess();
  chess.loadPgn(game.pgn);

  return chess
    .history({ verbose: true })
    .map((move, index) => {
      const sideToMove = colorFromMove(move.color);

      return {
        fenAfter: move.after,
        fenBefore: move.before,
        gameUrl: game.gameUrl,
        isPlayerMove: sideToMove === game.playerColor,
        moveNumber: Number(move.before.split(" ")[5]),
        playedMove: move.san,
        playedMoveUci: uciFromVerboseMove(move),
        playerColor: game.playerColor,
        ply: index + 1,
        sideToMove,
      };
    });
}
