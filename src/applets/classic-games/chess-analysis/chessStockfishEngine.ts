import type { EngineEvaluation } from "./chessReportTypes";

export type StockfishAnalyzeOptions = {
  depth?: number;
  moveTimeMs?: number;
  signal?: AbortSignal;
};

export type StockfishAnalysisResult = {
  bestMove: string;
  evaluation: EngineEvaluation;
  rawInfo: string[];
};

export type StockfishTopMove = {
  evaluation: EngineEvaluation;
  line: string[];
  move: string;
  rank: number;
};

export type ChessStockfishEngine = {
  analyzeFen: (fen: string, options?: StockfishAnalyzeOptions) => Promise<StockfishAnalysisResult>;
  analyzeTopMoves: (fen: string, options?: StockfishAnalyzeOptions & { lineCount?: number }) => Promise<StockfishTopMove[]>;
  dispose: () => void;
  initialize: () => Promise<void>;
  stop: () => void;
};

const defaultMoveTimeMs = 400;
const defaultDepth = 10;

function defaultEnginePath(): string {
  if (typeof document === "undefined") {
    return "/vendor/stockfish/stockfish-18-lite-single.js";
  }

  return new URL("vendor/stockfish/stockfish-18-lite-single.js", document.baseURI).toString();
}

function parseEvaluation(line: string): EngineEvaluation | null {
  const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  if (!scoreMatch) {
    return null;
  }

  return {
    type: scoreMatch[1] as "cp" | "mate",
    value: Number(scoreMatch[2]),
  };
}

function parseMultiPvRank(line: string): number {
  const match = line.match(/\bmultipv\s+(\d+)/);
  return match ? Number(match[1]) : 1;
}

function parsePrincipalVariation(line: string): string[] {
  const match = line.match(/\bpv\s+(.+)$/);
  return match ? match[1].trim().split(/\s+/).filter(Boolean) : [];
}

function timeoutSignal(signal: AbortSignal | undefined, timeoutMs: number, onTimeout: () => void): () => void {
  if (signal?.aborted) {
    onTimeout();
    return () => undefined;
  }

  const timeout = window.setTimeout(onTimeout, timeoutMs);
  const abort = () => onTimeout();
  signal?.addEventListener("abort", abort, { once: true });

  return () => {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  };
}

export function createStockfishEngine(enginePath = defaultEnginePath()): ChessStockfishEngine {
  let worker: Worker | null = null;
  let initialized = false;
  const listeners = new Set<(message: string) => void>();

  function post(command: string): void {
    if (!worker) {
      throw new Error("Stockfish worker is not initialized.");
    }

    worker.postMessage(command);
  }

  function waitFor(predicate: (message: string) => boolean, timeoutMs = 12000, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      const listener = (message: string) => {
        if (message.startsWith("error ")) {
          cleanup();
          listeners.delete(listener);
          reject(new Error(message.replace(/^error\s+/, "")));
          return;
        }

        if (!predicate(message)) {
          return;
        }

        cleanup();
        listeners.delete(listener);
        resolve(message);
      };
      const cleanup = timeoutSignal(signal, timeoutMs, () => {
        listeners.delete(listener);
        reject(signal?.aborted ? new Error("Analysis cancelled.") : new Error("Timed out waiting for Stockfish."));
      });

      listeners.add(listener);
    });
  }

  async function initialize(): Promise<void> {
    if (initialized) {
      return;
    }

    if (typeof Worker === "undefined") {
      throw new Error("Engine analysis unavailable in this browser/build.");
    }

    worker = new Worker(enginePath);
    worker.onmessage = (event: MessageEvent<string>) => {
      const message = String(event.data);
      for (const listener of listeners) {
        listener(message);
      }
    };
    worker.onerror = (event) => {
      const message = event.message || "Stockfish worker failed to load.";
      for (const listener of listeners) {
        listener(`error ${message}`);
      }
    };

    post("uci");
    await waitFor((message) => message === "uciok");
    post("isready");
    await waitFor((message) => message === "readyok");
    initialized = true;
  }

  async function analyzeFen(fen: string, options: StockfishAnalyzeOptions = {}): Promise<StockfishAnalysisResult> {
    await initialize();
    const depth = options.depth ?? defaultDepth;
    const moveTimeMs = options.moveTimeMs ?? defaultMoveTimeMs;
    const rawInfo: string[] = [];
    let latestEvaluation: EngineEvaluation | null = null;

    const resultPromise = new Promise<StockfishAnalysisResult>((resolve, reject) => {
      const cleanup = timeoutSignal(options.signal, Math.max(7000, moveTimeMs + depth * 1200 + 5000), () => {
        listeners.delete(listener);
        stop();
        reject(options.signal?.aborted ? new Error("Analysis cancelled.") : new Error("Timed out waiting for best move."));
      });
      const listener = (message: string) => {
        if (message.startsWith("error ")) {
          cleanup();
          listeners.delete(listener);
          reject(new Error(message.replace(/^error\s+/, "")));
          return;
        }

        if (message.startsWith("info ")) {
          rawInfo.push(message);
          latestEvaluation = parseEvaluation(message) ?? latestEvaluation;
          return;
        }

        if (message.startsWith("bestmove ")) {
          cleanup();
          listeners.delete(listener);
          const bestMove = message.split(/\s+/)[1] ?? "";
          if (!bestMove || bestMove === "(none)" || !latestEvaluation) {
            reject(new Error("Stockfish did not return a complete analysis."));
            return;
          }

          resolve({
            bestMove,
            evaluation: latestEvaluation,
            rawInfo,
          });
        }
      };

      listeners.add(listener);
    });

    post("ucinewgame");
    post(`position fen ${fen}`);
    post(depth > 0 ? `go depth ${depth} movetime ${moveTimeMs}` : `go movetime ${moveTimeMs}`);
    return resultPromise;
  }

  async function analyzeTopMoves(
    fen: string,
    options: StockfishAnalyzeOptions & { lineCount?: number } = {},
  ): Promise<StockfishTopMove[]> {
    await initialize();
    const depth = options.depth ?? defaultDepth;
    const moveTimeMs = options.moveTimeMs ?? defaultMoveTimeMs;
    const lineCount = Math.min(5, Math.max(1, Math.round(options.lineCount ?? 3)));
    const latestByRank = new Map<number, StockfishTopMove>();

    const resultPromise = new Promise<StockfishTopMove[]>((resolve, reject) => {
      const cleanup = timeoutSignal(options.signal, Math.max(7000, moveTimeMs + depth * 1200 + 5000), () => {
        listeners.delete(listener);
        stop();
        reject(options.signal?.aborted ? new Error("Analysis cancelled.") : new Error("Timed out waiting for top moves."));
      });
      const listener = (message: string) => {
        if (message.startsWith("error ")) {
          cleanup();
          listeners.delete(listener);
          reject(new Error(message.replace(/^error\s+/, "")));
          return;
        }

        if (message.startsWith("info ")) {
          const evaluation = parseEvaluation(message);
          const line = parsePrincipalVariation(message);
          if (!evaluation || line.length === 0) {
            return;
          }

          const rank = parseMultiPvRank(message);
          if (rank <= lineCount) {
            latestByRank.set(rank, {
              evaluation,
              line,
              move: line[0],
              rank,
            });
          }
          return;
        }

        if (message.startsWith("bestmove ")) {
          cleanup();
          listeners.delete(listener);
          const topMoves = [...latestByRank.values()].sort((left, right) => left.rank - right.rank);
          if (topMoves.length === 0) {
            reject(new Error("Stockfish did not return top-move analysis."));
            return;
          }

          resolve(topMoves.slice(0, lineCount));
        }
      };

      listeners.add(listener);
    });

    post("ucinewgame");
    post(`setoption name MultiPV value ${lineCount}`);
    post("isready");
    await waitFor((message) => message === "readyok", 12000, options.signal);
    post(`position fen ${fen}`);
    post(depth > 0 ? `go depth ${depth} movetime ${moveTimeMs}` : `go movetime ${moveTimeMs}`);

    try {
      return await resultPromise;
    } finally {
      if (worker) {
        post("setoption name MultiPV value 1");
      }
    }
  }

  function stop(): void {
    if (worker) {
      worker.postMessage("stop");
    }
  }

  function dispose(): void {
    if (worker) {
      worker.postMessage("quit");
      worker.terminate();
    }
    worker = null;
    initialized = false;
    listeners.clear();
  }

  return {
    analyzeFen,
    analyzeTopMoves,
    dispose,
    initialize,
    stop,
  };
}
