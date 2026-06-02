import { useEffect, useState } from "react";
import { AppletHub } from "./applets/AppletHub";
import {
  BlockStackPage,
  BrickBreakerPage,
  NeonSnakePage,
  PaddlePopPage,
  SectorInvadersPage,
  StarDriftPage,
  WallPongPage,
  WingDashPage,
} from "./applets/arcade-games/ArcadeGamePages";
import {
  AmazonsMiniPage,
  ChessComAnalysisPage,
  ChessPage,
  DomineeringPage,
  HexPage,
  KonanePage,
  MiniShogiPage,
  NineMensMorrisPage,
  SuperHexagonPage,
} from "./applets/classic-games/ClassicGamePages";
import {
  LightsOutPage,
  MastermindPage,
  PegSolitairePage,
  SlidingTilesPage,
  SokobanMiniPage,
  TowersOfHanoiPage,
} from "./applets/puzzle-games/PuzzleGamePages";
import { TwelveJanggiPage } from "./applets/twelve-janggi/TwelveJanggiPage";
import { XoGamePage } from "./applets/xo-game-lab/XoGamePage";

function normalizeHashRoute(hash: string): string {
  const route = hash.replace(/^#/, "") || "/";
  return route.startsWith("/") ? route : `/${route}`;
}

export function App() {
  const [route, setRoute] = useState(() =>
    normalizeHashRoute(window.location.hash),
  );

  useEffect(() => {
    function handleHashChange() {
      setRoute(normalizeHashRoute(window.location.hash));
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  if (route === "/applets/twelve-janggi") {
    return <TwelveJanggiPage />;
  }

  if (route === "/applets/xo-game-lab") {
    return <XoGamePage />;
  }

  if (route === "/applets/nine-mens-morris") {
    return <NineMensMorrisPage />;
  }

  if (route === "/applets/mini-shogi") {
    return <MiniShogiPage />;
  }

  if (route === "/applets/amazons-mini") {
    return <AmazonsMiniPage />;
  }

  if (route === "/applets/hex") {
    return <HexPage />;
  }

  if (route === "/applets/domineering") {
    return <DomineeringPage />;
  }

  if (route === "/applets/konane") {
    return <KonanePage />;
  }

  if (route === "/applets/chess") {
    return <ChessPage />;
  }

  if (route === "/applets/chess/analysis") {
    return <ChessComAnalysisPage />;
  }

  if (route === "/applets/super-hexagon") {
    return <SuperHexagonPage />;
  }

  if (route === "/applets/block-stack") {
    return <BlockStackPage />;
  }

  if (route === "/applets/wing-dash") {
    return <WingDashPage />;
  }

  if (route === "/applets/neon-snake") {
    return <NeonSnakePage />;
  }

  if (route === "/applets/brick-breaker") {
    return <BrickBreakerPage />;
  }

  if (route === "/applets/star-drift") {
    return <StarDriftPage />;
  }

  if (route === "/applets/sector-invaders") {
    return <SectorInvadersPage />;
  }

  if (route === "/applets/paddle-pop") {
    return <PaddlePopPage />;
  }

  if (route === "/applets/wall-pong") {
    return <WallPongPage />;
  }

  if (route === "/applets/lights-out") {
    return <LightsOutPage />;
  }

  if (route === "/applets/sliding-tiles") {
    return <SlidingTilesPage />;
  }

  if (route === "/applets/towers-of-hanoi") {
    return <TowersOfHanoiPage />;
  }

  if (route === "/applets/mastermind") {
    return <MastermindPage />;
  }

  if (route === "/applets/peg-solitaire") {
    return <PegSolitairePage />;
  }

  if (route === "/applets/sokoban-mini") {
    return <SokobanMiniPage />;
  }

  return <AppletHub />;
}
