import { Chess, type Square } from "chess.js";

export type Puzzle = {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
};

export type PuzzleProfile = {
  rating: number;
  streak: number;
  best: number;
  solved: number;
  failed: number;
  played: number;
  recent: string[];
  autoNext: boolean;
};

export const PROFILE_KEY = "grok-chess-puzzle-v1";

export const DEFAULT_PROFILE: PuzzleProfile = {
  rating: 1000,
  streak: 0,
  best: 0,
  solved: 0,
  failed: 0,
  played: 0,
  recent: [],
  autoNext: true,
};

/** Lichess convention: the first move is the opponent's, then the solver answers. */
export const BUILTIN_PUZZLES: Puzzle[] = [
  {
    id: "base-rook",
    fen: "k7/8/1K6/8/8/8/7R/8 b - - 0 1",
    moves: ["a8b8", "h2h8"],
    rating: 560,
    themes: ["mate", "mateIn1", "endgame", "short"],
  },
  {
    id: "base-scholars",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3",
    moves: ["g8f6", "h5f7"],
    rating: 640,
    themes: ["mate", "mateIn1", "opening", "short"],
  },
  {
    id: "base-two-rooks",
    fen: "k7/8/1K6/8/8/8/R7/7R b - - 0 1",
    moves: ["a8b8", "h1h8"],
    rating: 720,
    themes: ["mate", "mateIn1", "endgame", "short"],
  },
  {
    id: "base-queen-corner",
    fen: "k7/8/1K6/2Q5/8/8/8/8 b - - 0 1",
    moves: ["a8b8", "c5f8"],
    rating: 780,
    themes: ["mate", "mateIn1", "endgame", "short"],
  },
  {
    id: "base-back-rank",
    fen: "r5k1/5ppp/8/8/8/8/8/4R2K b - - 0 1",
    moves: ["a8a7", "e1e8"],
    rating: 860,
    themes: ["mate", "mateIn1", "backRankMate", "short"],
  },
  {
    id: "base-back-rank-black",
    fen: "4r1k1/8/8/8/8/8/5PPP/R5K1 w - - 0 1",
    moves: ["a1a2", "e8e1"],
    rating: 900,
    themes: ["mate", "mateIn1", "backRankMate", "short"],
  },
  {
    id: "base-ladder",
    fen: "6k1/6pp/8/8/8/8/5PPP/R4RK1 b - - 0 1",
    moves: ["g8h8", "a1a8"],
    rating: 980,
    themes: ["mate", "mateIn1", "endgame", "short"],
  },
  {
    id: "base-heavy",
    fen: "3r2k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1",
    moves: ["g8h8", "d1d8"],
    rating: 1040,
    themes: ["mate", "mateIn1", "backRankMate", "short"],
  },
  {
    id: "base-queen-dash",
    fen: "6k1/5ppp/8/6Q1/8/8/8/6K1 b - - 0 1",
    moves: ["g8h8", "g5d8"],
    rating: 1120,
    themes: ["mate", "mateIn1", "middlegame", "short"],
  },
  {
    id: "base-deflection",
    fen: "r5k1/5ppp/8/8/8/8/4Q3/4R2K b - - 0 1",
    moves: ["a8b8", "e2e8", "b8e8", "e1e8"],
    rating: 1240,
    themes: ["mate", "mateIn2", "sacrifice", "backRankMate", "middlegame"],
  },
];

export const THEME_LABELS: Record<string, string> = {
  mate: "Mate",
  mateIn1: "Mate em 1",
  mateIn2: "Mate em 2",
  mateIn3: "Mate em 3",
  mateIn4: "Mate em 4",
  backRankMate: "Última fila",
  smotheredMate: "Mate sufocado",
  fork: "Garfo",
  pin: "Cravada",
  skewer: "Raio-x",
  sacrifice: "Sacrifício",
  discoveredAttack: "Descoberto",
  hangingPiece: "Peça pendurada",
  trappedPiece: "Peça presa",
  endgame: "Final",
  middlegame: "Meio-jogo",
  opening: "Abertura",
  short: "Curto",
  long: "Longo",
  veryLong: "Bem longo",
  crushing: "Decisivo",
  advantage: "Vantagem",
  equality: "Igualdade",
  master: "Mestre",
  deflection: "Desvio",
  attraction: "Atração",
  clearance: "Desobstrução",
  quietMove: "Lance quieto",
  advancedPawn: "Peão avançado",
  promotion: "Promoção",
  kingsideAttack: "Ataque na ala do rei",
  queensideAttack: "Ataque na ala da dama",
  exposedKing: "Rei exposto",
  oneMove: "Um lance",
};

export const THEME_FILTERS = [
  "all",
  "mate",
  "mateIn1",
  "mateIn2",
  "fork",
  "pin",
  "sacrifice",
  "endgame",
  "middlegame",
  "opening",
  "crushing",
] as const;

export type ThemeFilter = (typeof THEME_FILTERS)[number];

export function themeLabel(theme: string) {
  if (theme === "all") return "Todos os temas";
  return THEME_LABELS[theme] ?? theme;
}

export function loadProfile(): PuzzleProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const saved = JSON.parse(raw) as Partial<PuzzleProfile>;
    return {
      rating: clampRating(Number(saved.rating ?? DEFAULT_PROFILE.rating)),
      streak: nonNeg(saved.streak),
      best: nonNeg(saved.best),
      solved: nonNeg(saved.solved),
      failed: nonNeg(saved.failed),
      played: nonNeg(saved.played),
      recent: Array.isArray(saved.recent) ? saved.recent.filter((id) => typeof id === "string").slice(-40) : [],
      autoNext: saved.autoNext !== false,
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(profile: PuzzleProfile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore quota */
  }
}

export function puzzleDelta(userRating: number, puzzleRating: number, success: boolean, played: number) {
  const expected = 1 / (1 + 10 ** ((puzzleRating - userRating) / 400));
  const k = played < 20 ? 36 : 22;
  const raw = Math.round(k * ((success ? 1 : 0) - expected));
  if (raw === 0) return success ? 1 : -1;
  return raw;
}

export function applyResult(profile: PuzzleProfile, puzzle: Puzzle, success: boolean, hinted: boolean): PuzzleProfile {
  const delta = hinted && success ? Math.max(1, Math.round(puzzleDelta(profile.rating, puzzle.rating, true, profile.played) * 0.35)) : puzzleDelta(profile.rating, puzzle.rating, success, profile.played);
  const streak = success && !hinted ? profile.streak + 1 : success ? profile.streak : 0;
  const recent = [...profile.recent.filter((id) => id !== puzzle.id), puzzle.id].slice(-40);
  return {
    ...profile,
    rating: clampRating(profile.rating + delta),
    streak,
    best: Math.max(profile.best, streak),
    solved: profile.solved + (success ? 1 : 0),
    failed: profile.failed + (success ? 0 : 1),
    played: profile.played + 1,
    recent,
    autoNext: profile.autoNext,
  };
}

export type AppliedMove = {
  fen: string;
  from: Square;
  to: Square;
  san: string;
};

export function applyUci(fen: string, uci: string): AppliedMove | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.length > 4 ? (uci[4] as "q" | "r" | "b" | "n") : undefined,
    });
    if (!move) return null;
    return { fen: chess.fen(), from: move.from, to: move.to, san: move.san };
  } catch {
    return null;
  }
}

export function isMateFen(fen: string) {
  try {
    return new Chess(fen).isCheckmate();
  } catch {
    return false;
  }
}

export function solverColor(puzzle: Puzzle): "w" | "b" {
  try {
    const turn = new Chess(puzzle.fen).turn();
    if (puzzle.moves.length < 2) return turn;
    return turn === "w" ? "b" : "w";
  } catch {
    return "w";
  }
}

export function pickFromList(list: Puzzle[], rating: number, avoid: Set<string>, theme: string): Puzzle | null {
  if (list.length === 0) return null;
  const themed = theme === "all" ? list : list.filter((puzzle) => puzzle.themes.includes(theme));
  const fresh = themed.filter((puzzle) => !avoid.has(puzzle.id));
  const source = fresh.length > 0 ? fresh : themed.length > 0 ? themed : list;
  const ranked = [...source].sort((a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating));
  const band = ranked.filter((puzzle) => Math.abs(puzzle.rating - rating) <= 300);
  const choices = (band.length > 0 ? band : ranked).slice(0, 8);
  const index = Math.floor(Math.random() * choices.length);
  return choices[index] ?? null;
}

export function parsePuzzleDocument(text: string): { puzzles: Puzzle[]; skipped: number } {
  const trimmed = text.trim();
  if (!trimmed) return { puzzles: [], skipped: 0 };
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return parseJsonPuzzles(trimmed);
  return parseDelimited(trimmed);
}

function parseJsonPuzzles(text: string): { puzzles: Puzzle[]; skipped: number } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { puzzles: [], skipped: 1 };
  }
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { puzzles?: unknown }).puzzles)
      ? (data as { puzzles: unknown[] }).puzzles
      : [];
  const puzzles: Puzzle[] = [];
  let skipped = 0;
  rows.forEach((row, index) => {
    const puzzle = puzzleFromRecord(row, `json-${index + 1}`);
    if (puzzle) puzzles.push(puzzle);
    else skipped += 1;
  });
  return { puzzles, skipped };
}

function parseDelimited(text: string): { puzzles: Puzzle[]; skipped: number } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const puzzles: Puzzle[] = [];
  let skipped = 0;
  let header: string[] | null = null;
  for (const line of lines) {
    if (line.trim().startsWith("#")) continue;
    const cells = splitCsv(line);
    if (!header && cells.some((cell) => /^(puzzleid|fen|moves|rating|themes)$/i.test(cell.trim()))) {
      header = cells.map((cell) => cell.trim().toLowerCase());
      continue;
    }
    const puzzle = header ? puzzleFromHeader(header, cells) : puzzleFromLoose(cells);
    if (puzzle) puzzles.push(puzzle);
    else skipped += 1;
  }
  return { puzzles, skipped };
}

function puzzleFromHeader(header: string[], cells: string[]): Puzzle | null {
  const value = (name: string) => {
    const index = header.indexOf(name);
    return index >= 0 ? (cells[index] ?? "").trim() : "";
  };
  return normalizePuzzle({
    id: value("puzzleid") || value("id"),
    fen: value("fen"),
    moves: value("moves") || value("solution"),
    rating: value("rating"),
    themes: value("themes") || value("theme"),
  });
}

function puzzleFromLoose(cells: string[]): Puzzle | null {
  if (cells.length >= 3 && looksLikeFen(cells[1] ?? "")) {
    return normalizePuzzle({
      id: cells[0] ?? "",
      fen: cells[1] ?? "",
      moves: cells[2] ?? "",
      rating: cells[3] ?? "",
      themes: cells[4] ?? "",
    });
  }
  const joined = cells.join(",");
  const semi = joined.split(";").map((part) => part.trim());
  if (semi.length >= 2 && looksLikeFen(semi[0] ?? "")) {
    return normalizePuzzle({ id: "", fen: semi[0] ?? "", moves: semi[1] ?? "", rating: semi[2] ?? "", themes: semi[3] ?? "" });
  }
  if (looksLikeFen(cells[0] ?? "")) {
    return normalizePuzzle({ id: "", fen: cells[0] ?? "", moves: cells[1] ?? "", rating: cells[2] ?? "", themes: cells[3] ?? "" });
  }
  return null;
}

function puzzleFromRecord(row: unknown, fallbackId: string): Puzzle | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const moves = record.moves ?? record.solution ?? record.line;
  return normalizePuzzle({
    id: typeof record.id === "string" ? record.id : typeof record.puzzleId === "string" ? record.puzzleId : fallbackId,
    fen: typeof record.fen === "string" ? record.fen : "",
    moves: Array.isArray(moves) ? moves.join(" ") : typeof moves === "string" ? moves : "",
    rating: record.rating ?? record.elo,
    themes: Array.isArray(record.themes) ? record.themes.join(" ") : typeof record.themes === "string" ? record.themes : "",
  });
}

function normalizePuzzle(input: { id: string; fen: string; moves: string; rating: unknown; themes: string }): Puzzle | null {
  const fen = input.fen.trim();
  const moves = input.moves
    .trim()
    .split(/[\s,]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(token));
  if (!looksLikeFen(fen) || moves.length === 0) return null;
  if (!linePlays(fen, moves)) return null;
  const rating = clampRating(Number(input.rating) || 1200);
  const themes = input.themes
    .split(/[\s,|]+/)
    .map((theme) => theme.trim())
    .filter(Boolean);
  const id = input.id.trim() || `p-${hashText(`${fen}|${moves.join(" ")}`)}`;
  return { id, fen, moves, rating, themes };
}

function linePlays(fen: string, moves: string[]) {
  try {
    const chess = new Chess(fen);
    for (const uci of moves) {
      const moved = chess.move({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: uci.length > 4 ? (uci[4] as "q" | "r" | "b" | "n") : undefined,
      });
      if (!moved) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function looksLikeFen(value: string) {
  const parts = value.trim().split(/\s+/);
  return parts.length >= 4 && parts[0].includes("/");
}

function splitCsv(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else quoted = false;
      } else current += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "," || char === "\t") {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

function clampRating(value: number) {
  if (!Number.isFinite(value)) return 1000;
  return Math.max(400, Math.min(2800, Math.round(value)));
}

function nonNeg(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number);
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
