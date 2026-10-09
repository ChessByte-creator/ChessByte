export type Judgment = "best" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder";

export type WhiteEval = {
  cp: number;
  mate: number | null;
};

export const JUDGMENT_META: Record<
  Judgment,
  { label: string; glyph: string; tone: "ink" | "good" | "muted" | "warn" | "bad" }
> = {
  best: { label: "Melhor lance", glyph: "", tone: "ink" },
  excellent: { label: "Excelente", glyph: "", tone: "good" },
  good: { label: "Bom", glyph: "", tone: "muted" },
  inaccuracy: { label: "Imprecisão", glyph: "?!", tone: "warn" },
  mistake: { label: "Erro", glyph: "?", tone: "bad" },
  blunder: { label: "Erro grave", glyph: "??", tone: "bad" },
};

const TONE_CLASS: Record<(typeof JUDGMENT_META)[Judgment]["tone"], string> = {
  ink: "text-ink",
  good: "text-good",
  muted: "text-muted",
  warn: "text-warn",
  bad: "text-bad",
};

export function judgmentClass(j: Judgment) {
  return TONE_CLASS[JUDGMENT_META[j].tone];
}

/** UCI score is from the side to move. Returns centipawns and mate distance from White's view. */
export function toWhiteEval(scoreCp: number | null, mate: number | null, turn: "w" | "b"): WhiteEval {
  const sign = turn === "w" ? 1 : -1;
  if (mate != null && mate !== 0) {
    const whiteMate = mate * sign;
    const cp = whiteMate > 0 ? 10000 - Math.abs(whiteMate) * 50 : -10000 + Math.abs(whiteMate) * 50;
    return { cp, mate: whiteMate };
  }
  return { cp: (scoreCp ?? 0) * sign, mate: null };
}

export function formatEval(ev: WhiteEval): string {
  if (ev.mate != null) {
    const n = Math.abs(ev.mate);
    return ev.mate > 0 ? `+M${n}` : `−M${n}`;
  }
  const pawns = Math.max(-99.9, Math.min(99.9, ev.cp / 100));
  const abs = Math.abs(pawns).toFixed(1);
  if (pawns >= 0.05) return `+${abs}`;
  if (pawns <= -0.05) return `−${abs}`;
  return "0.0";
}

export function evalBarPercent(ev: WhiteEval): number {
  const cp = ev.mate != null ? (ev.mate > 0 ? 1400 : -1400) : Math.max(-1400, Math.min(1400, ev.cp));
  const t = 1 / (1 + Math.exp(-cp / 280));
  return Math.round(Math.min(0.98, Math.max(0.02, t)) * 1000) / 10;
}

export function moverCp(ev: WhiteEval, color: "w" | "b") {
  return color === "w" ? ev.cp : -ev.cp;
}

/** Lichess win% model, clamped so mate-scale scores do not explode the curve. */
export function cpToWinPercent(cp: number) {
  const c = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

/** Lichess move-accuracy curve. Both win percents are from the mover's side. */
export function moveAccuracy(winBefore: number, winAfter: number) {
  const diff = Math.max(0, winBefore - winAfter);
  const raw = 103.1668100711649 * Math.exp(-0.04354415386709197 * diff) - 3.166924740191411;
  return Math.max(0, Math.min(100, raw));
}

export function classifyMove(lossCp: number, playedBest: boolean): Judgment {
  if (playedBest || lossCp <= 8) return "best";
  if (lossCp <= 25) return "excellent";
  if (lossCp <= 50) return "good";
  if (lossCp <= 100) return "inaccuracy";
  if (lossCp <= 250) return "mistake";
  return "blunder";
}

export function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

export function formatPercent(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export function levelName(skill: number) {
  if (skill <= 4) return "Iniciante";
  if (skill <= 9) return "Casual";
  if (skill <= 14) return "Clube";
  if (skill <= 17) return "Forte";
  return "Mestre";
}
