const configStorageKey = "sts2.blakeChessTrainer.username";

type ImportMetaWithEnv = ImportMeta & {
  env?: Record<string, string | undefined>;
};

export const blakeChessTrainerConfig = {
  defaultUsername:
    ((import.meta as ImportMetaWithEnv).env?.VITE_BLAKE_CHESS_COM_USERNAME ?? "").trim() || "sbrooker02",
};

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function readConfiguredChessComUsername(): string {
  if (canUseLocalStorage()) {
    try {
      const savedUsername = window.localStorage.getItem(configStorageKey);
      if (savedUsername?.trim()) {
        return savedUsername.trim();
      }
    } catch {
      // Config storage is optional.
    }
  }

  return blakeChessTrainerConfig.defaultUsername;
}

export function saveConfiguredChessComUsername(username: string): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(configStorageKey, username.trim());
  } catch {
    // Config storage is optional.
  }
}
