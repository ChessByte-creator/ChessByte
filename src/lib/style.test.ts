import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PERSONALITIES, pickStyledMove, styleScore } from "./style.ts";

const OPENING = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
const MATE = "k7/8/1K6/8/8/8/8/7R w - - 0 1";

function line(pv: string, scoreCp: number | null, mate: number | null = null) {
  return { pv, scoreCp, mate };
}

describe("pickStyledMove", () => {
  it("keeps the engine move when the personality is balanced", () => {
    const choice = pickStyledMove({
      fen: OPENING,
      bestmove: "f1b5",
      personalityId: "balanced",
      skill: 8,
      lines: [line("f1b5", 28), line("f1c4", 26), line("d2d4", 18), line("f3g5", 4)],
    });
    assert.equal(choice.uci, "f1b5");
    assert.equal(choice.diverged, false);
  });

  it("takes a short mate even if another check looks more stylish", () => {
    const choice = pickStyledMove({
      fen: MATE,
      bestmove: "h1h8",
      personalityId: "aggressive",
      skill: 1,
      lines: [line("h1h8", null, 1), line("h1a1", 80)],
    });
    assert.equal(choice.uci, "h1h8");
  });

  it("lets a materialist grab a pawn the engine almost likes", () => {
    const fen = "rnbqkbnr/ppp2ppp/8/3pp3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3";
    const choice = pickStyledMove({
      fen,
      bestmove: "f1c4",
      personalityId: "materialist",
      skill: 6,
      lines: [line("f1c4", 20), line("e4d5", 8), line("d2d3", 12)],
    });
    assert.equal(choice.uci, "e4d5");
    assert.match(choice.note, /Materialista/);
  });

  it("splits the same candidate list across styles", () => {
    const lines = [line("f1b5", 30), line("f1c4", 27), line("d2d4", 16), line("f3g5", 6), line("b1c3", 22)];
    const picks = Object.fromEntries(
      PERSONALITIES.filter((item) => item.id !== "balanced").map((item) => [
        item.id,
        pickStyledMove({ fen: OPENING, lines, bestmove: "f1b5", personalityId: item.id, skill: 4 }).uci,
      ]),
    );
    const unique = new Set(Object.values(picks));
    assert.ok(unique.size >= 3, `expected several different moves, got ${JSON.stringify(picks)}`);
  });

  it("does not restyle a shallow line when the level is high", () => {
    const fen = "rnbqkbnr/ppp2ppp/8/3pp3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3";
    const choice = pickStyledMove({
      fen,
      bestmove: "f1c4",
      personalityId: "materialist",
      skill: 18,
      depth: 4,
      lines: [line("f1c4", 40), line("e4d5", 30)],
    });
    assert.equal(choice.uci, "f1c4");
    assert.equal(choice.diverged, false);
  });

  it("scores a king attack above a quiet developing move for the attacker", () => {
    const attack = styleScore(OPENING, "f3g5", "aggressive");
    const quiet = styleScore(OPENING, "b1c3", "aggressive");
    assert.ok(attack != null && quiet != null && attack > quiet);
  });

  it("scores a developing move above an early queen for the positional player", () => {
    const start = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
    const develop = styleScore(start, "g1f3", "positional");
    const queen = styleScore(start, "d1h5", "positional");
    assert.ok(develop != null && queen != null && develop > queen, `${develop} vs ${queen}`);
  });
});
