import { openingBookEntries } from "./chessOpenings.generated";
import type { PersonalOpeningLeak } from "./chessPersonalInsights";

export type OpeningBookVolume = "A" | "B" | "C" | "D" | "E";

export type OpeningBookEntry = {
  eco: string;
  epd: string;
  family: string;
  fen: string;
  name: string;
  pgn: string;
  ply: number;
  uci: string[];
  volume: OpeningBookVolume;
};

export type OpeningSearchFilters = {
  family?: string;
  personalRepairOnly?: boolean;
  query?: string;
  volume?: OpeningBookVolume | "all";
};

export type OpeningPersonalMatch = {
  entry: OpeningBookEntry;
  leak: PersonalOpeningLeak;
};

export function parseOpeningTsv(text: string): Pick<OpeningBookEntry, "eco" | "name" | "pgn" | "volume">[] {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift()?.split("\t") ?? [];
  const ecoIndex = headers.indexOf("eco");
  const nameIndex = headers.indexOf("name");
  const pgnIndex = headers.indexOf("pgn");

  if (ecoIndex === -1 || nameIndex === -1 || pgnIndex === -1) {
    throw new Error("Opening TSV must include eco, name, and pgn columns.");
  }

  return lines
    .filter(Boolean)
    .map((line) => {
      const columns = line.split("\t");
      const eco = columns[ecoIndex] ?? "";
      return {
        eco,
        name: columns[nameIndex] ?? "",
        pgn: columns.slice(pgnIndex).join("\t"),
        volume: eco[0] as OpeningBookVolume,
      };
    });
}

export function epdToPreviewFen(epd: string): string {
  const fields = epd.trim().split(/\s+/);
  if (fields.length < 4) {
    return "8/8/8/8/8/8/8/8 w - - 0 1";
  }

  return `${fields.slice(0, 4).join(" ")} 0 1`;
}

export function getOpeningFamilies(entries: OpeningBookEntry[] = openingBookEntries): string[] {
  return [...new Set(entries.map((entry) => entry.family))].sort((left, right) => left.localeCompare(right));
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function openingKey(value: { eco: string; opening: string }): string {
  return `${value.eco.toUpperCase()}|${normalizeSearchText(value.opening)}`;
}

export function buildPersonalOpeningMatches(
  entries: OpeningBookEntry[],
  leaks: PersonalOpeningLeak[],
): Map<string, PersonalOpeningLeak> {
  const leaksByKey = new Map(leaks.map((leak) => [openingKey(leak), leak]));
  const matches = new Map<string, PersonalOpeningLeak>();

  for (const entry of entries) {
    const exactLeak = leaksByKey.get(openingKey({ eco: entry.eco, opening: entry.name }));
    if (exactLeak) {
      matches.set(entryKey(entry), exactLeak);
      continue;
    }

    const familyLeak = leaks.find(
      (leak) =>
        leak.eco.toUpperCase() === entry.eco.toUpperCase() &&
        normalizeSearchText(entry.name).startsWith(normalizeSearchText(leak.opening)),
    );
    if (familyLeak) {
      matches.set(entryKey(entry), familyLeak);
    }
  }

  return matches;
}

export function entryKey(entry: OpeningBookEntry): string {
  return `${entry.eco}|${entry.name}|${entry.pgn}`;
}

function scoreOpening(entry: OpeningBookEntry, query: string): number {
  if (!query) {
    return 0;
  }

  const normalizedQuery = normalizeSearchText(query);
  const normalizedName = normalizeSearchText(entry.name);
  const normalizedPgn = normalizeSearchText(entry.pgn);
  const normalizedUci = entry.uci.join(" ");
  const combinedText = normalizeSearchText(`${entry.eco} ${entry.name} ${entry.pgn} ${entry.uci.join(" ")}`);
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const eco = entry.eco.toLowerCase();
  const rawQuery = query.trim().toLowerCase();

  if (eco === rawQuery) {
    return 100;
  }

  if (eco.startsWith(rawQuery)) {
    return 90;
  }

  if (normalizedName === normalizedQuery) {
    return 80;
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return 70;
  }

  if (normalizedName.includes(normalizedQuery)) {
    return 60;
  }

  if (queryTokens.length > 1 && queryTokens.every((token) => combinedText.includes(token))) {
    return 55;
  }

  if (normalizedPgn.includes(normalizedQuery)) {
    return 45;
  }

  if (normalizedUci.startsWith(rawQuery.replace(/\s+/g, " "))) {
    return 40;
  }

  return 0;
}

export function searchOpeningBook({
  entries = openingBookEntries,
  filters,
  personalMatches = new Map(),
}: {
  entries?: OpeningBookEntry[];
  filters: OpeningSearchFilters;
  personalMatches?: Map<string, PersonalOpeningLeak>;
}): OpeningBookEntry[] {
  const query = filters.query?.trim() ?? "";

  return entries
    .map((entry) => ({ entry, score: scoreOpening(entry, query) }))
    .filter(({ entry, score }) => {
      if (filters.volume && filters.volume !== "all" && entry.volume !== filters.volume) {
        return false;
      }

      if (filters.family && entry.family !== filters.family) {
        return false;
      }

      if (filters.personalRepairOnly && !personalMatches.has(entryKey(entry))) {
        return false;
      }

      return !query || score > 0;
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entry.eco.localeCompare(right.entry.eco) ||
        left.entry.ply - right.entry.ply ||
        left.entry.name.localeCompare(right.entry.name),
    )
    .map(({ entry }) => entry);
}
