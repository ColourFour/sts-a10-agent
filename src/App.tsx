import { useEffect, useState } from "react";
import { AppletHub } from "./applets/AppletHub";
import {
  AmazonsMiniPage,
  ChessPage,
  DomineeringPage,
  HexPage,
  KonanePage,
  MiniShogiPage,
  NineMensMorrisPage,
  SuperHexagonPage,
} from "./applets/classic-games/ClassicGamePages";
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

  if (route === "/applets/super-hexagon") {
    return <SuperHexagonPage />;
  }

  return <AppletHub />;
}
