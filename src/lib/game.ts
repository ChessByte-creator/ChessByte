import { Chess, type Move, type Square } from "chess.js";
import { type WhiteEval } from "@/lib/eval";

export type Ply = {
  fen: string;
  san?: string;
  uci?: string;
  color?: "w" | "b";
  from?: Square;
  to?: Square;
};

export function startPlies(): Ply[] {
  return [{ fen: new Chess().fen() }];
}

export function pliesKey(plies: Ply[]) {
  return plies.map((ply) => ply.uci ?? "start").join(" ");
}

export function playUci(fen: string, uci: string): Move | null {
  if (!uci || uci === "(none)" || uci.length < 4) return null;
  const chess = new Chess(fen);
  const moved = chess.move({
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci.length > 4 ? (uci[4] as "q" | "r" | "b" | "n") : undefined,
  });
  return moved ?? null;
}

export function appendMove(plies: Ply[], fen: string, from: Square, to: Square, promotion?: "q" | "r" | "b" | "n") {
  const chess = new Chess(fen);
  const moved = chess.move({ from, to, promotion });
  if (!moved) return null;
  const ply: Ply = {
    fen: chess.fen(),
    san: moved.san,
    uci: `${moved.from}${moved.to}${moved.promotion ?? ""}`,
    color: moved.color,
    from: moved.from,
    to: moved.to,
  };
  return { plies: [...plies, ply], move: moved };
}

export function sanOfUci(fen: string, uci: string) {
  const moved = playUci(fen, uci);
  return moved?.san ?? uci;
}

export function formatPv(fen: string, pv: string, max = 8) {
  const chess = new Chess(fen);
  const parts: string[] = [];
  let turn = chess.turn();
  let moveNo = chess.moveNumber();
  let started = false;
  for (const token of pv.split(/\s+/)) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(token)) break;
    if (parts.length >= max) break;
    let moved: Move | null = null;
    try {
      moved = chess.move({
        from: token.slice(0, 2) as Square,
        to: token.slice(2, 4) as Square,
        promotion: token.length > 4 ? (token[4] as "q" | "r" | "b" | "n") : undefined,
      });
    } catch {
      moved = null;
    }
    if (!moved) break;
    if (!started && turn === "b") parts.push(`${moveNo}...`);
    else if (turn === "w") parts.push(`${moveNo}.`);
    parts.push(moved.san);
    if (turn === "b") moveNo += 1;
    turn = turn === "w" ? "b" : "w";
    started = true;
  }
  return parts.join(" ");
}

export function kingInCheck(fen: string): Square | null {
  const chess = new Chess(fen);
  if (!chess.isCheck()) return null;
  const turn = chess.turn();
  const board = chess.board();
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rank]?.[file];
      if (piece?.type === "k" && piece.color === turn) {
        return `${"abcdefgh"[file]}${8 - rank}` as Square;
      }
    }
  }
  return null;
}

export function resultText(fen: string): string | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    return chess.turn() === "w" ? "Xeque-mate. Vitória das pretas." : "Xeque-mate. Vitória das brancas.";
  }
  if (chess.isStalemate()) return "Empate por afogamento.";
  if (chess.isThreefoldRepetition()) return "Empate por repetição.";
  if (chess.isInsufficientMaterial()) return "Empate por material insuficiente.";
  if (chess.isDraw()) return "Empate.";
  return null;
}

export function pgnOf(plies: Ply[]) {
  const chess = new Chess();
  for (const ply of plies.slice(1)) {
    if (!ply.from || !ply.to) break;
    try {
      const moved = chess.move({
        from: ply.from,
        to: ply.to,
        promotion: ply.uci && ply.uci.length > 4 ? (ply.uci[4] as "q" | "r" | "b" | "n") : undefined,
      });
      if (!moved) break;
    } catch {
      break;
    }
  }
  return chess.pgn();
}

export function pliesFromText(text: string): Ply[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const asFen = new Chess();
  if (!trimmed.includes("[") && trimmed.split(/\s+/).length >= 4) {
    try {
      asFen.load(trimmed);
      return replay(asFen);
    } catch {
      /* try pgn */
    }
  }
  const asPgn = new Chess();
  try {
    asPgn.loadPgn(trimmed);
    return replay(asPgn);
  } catch {
    return null;
  }
}

function replay(finalGame: Chess): Ply[] {
  const verbose = finalGame.history({ verbose: true });
  const chess = new Chess();
  const plies: Ply[] = [{ fen: chess.fen() }];
  for (const move of verbose) {
    chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    plies.push({
      fen: chess.fen(),
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      color: move.color,
      from: move.from,
      to: move.to,
    });
  }
  return plies;
}

export function terminalEval(fen: string): WhiteEval | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    const whiteMated = chess.turn() === "w";
    return { cp: whiteMated ? -10000 : 10000, mate: whiteMated ? -1 : 1 };
  }
  if (chess.isDraw()) return { cp: 0, mate: null };
  return null;
}

export function positionEvalOr(fen: string, fallback: WhiteEval): WhiteEval {
  return terminalEval(fen) ?? fallback;
}
