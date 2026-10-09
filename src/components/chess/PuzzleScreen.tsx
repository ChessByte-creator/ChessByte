import { useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Board, type BoardArrow } from "@/components/chess/Board";
import { clearPuzzles, countPuzzles, putPuzzles, randomNear } from "@/lib/puzzle-db";
import { kingInCheck } from "@/lib/game";
import {
  BUILTIN_PUZZLES,
  DEFAULT_PROFILE,
  THEME_FILTERS,
  applyResult,
  applyUci,
  isMateFen,
  loadProfile,
  parsePuzzleDocument,
  pickFromList,
  saveProfile,
  solverColor,
  themeLabel,
  type Puzzle,
  type PuzzleProfile,
  type ThemeFilter,
} from "@/lib/puzzles";

type Phase = "loading" | "setup" | "user" | "reply" | "solved" | "failed" | "showing";
type Promo = "q" | "r" | "b" | "n";

const PROMO_LABEL: Record<Promo, string> = { q: "Dama", r: "Torre", b: "Bispo", n: "Cavalo" };

export function PuzzleScreen() {
  const [profile, setProfile] = useState<PuzzleProfile>(DEFAULT_PROFILE);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [fen, setFen] = useState(BUILTIN_PUZZLES[0].fen);
  const [phase, setPhase] = useState<Phase>("loading");
  const [step, setStep] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [arrows, setArrows] = useState<BoardArrow[]>([]);
  const [promo, setPromo] = useState<{ from: Square; to: Square; color: "w" | "b" } | null>(null);
  const [hintSquare, setHintSquare] = useState<Square | null>(null);
  const [hinted, setHinted] = useState(false);
  const [line, setLine] = useState("Carregando puzzles…");
  const [detail, setDetail] = useState("");
  const [dbCount, setDbCount] = useState(0);
  const [theme, setTheme] = useState<ThemeFilter>("all");
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [ratingDraft, setRatingDraft] = useState("1000");
  const [autoNext, setAutoNext] = useState(true);

  const profileRef = useRef(profile);
  const puzzleRef = useRef(puzzle);
  const fenRef = useRef(fen);
  const stepRef = useRef(step);
  const hintedRef = useRef(false);
  const themeRef = useRef(theme);
  const fileRef = useRef<HTMLInputElement>(null);
  profileRef.current = profile;
  puzzleRef.current = puzzle;
  fenRef.current = fen;
  stepRef.current = step;
  themeRef.current = theme;

  function remember(next: PuzzleProfile) {
    profileRef.current = next;
    setProfile(next);
    setRatingDraft(String(next.rating));
    setAutoNext(next.autoNext);
    saveProfile(next);
  }

  function begin(next: Puzzle) {
    const setup = next.moves.length >= 2;
    puzzleRef.current = next;
    setPuzzle(next);
    setFen(next.fen);
    fenRef.current = next.fen;
    setStep(0);
    stepRef.current = 0;
    setPhase(setup ? "setup" : "user");
    setFlipped(solverColor(next) === "b");
    setSelected(null);
    setPromo(null);
    setArrows([]);
    setHintSquare(null);
    setHinted(false);
    hintedRef.current = false;
    setLastMove(null);
    setLine(setup ? "Observe o lance." : turnLine(next));
    setDetail(goalLine(next, 0));
  }

  async function choose(current: PuzzleProfile, count: number, filter: ThemeFilter) {
    const avoid = new Set(current.recent);
    if (count > 0) {
      try {
        const fromDb = await randomNear(current.rating, avoid, filter);
        if (fromDb) return fromDb;
      } catch {
        /* fall back to the starter pack */
      }
    }
    if (count > 0 && filter !== "all") return null;
    return pickFromList(BUILTIN_PUZZLES, current.rating, avoid, filter);
  }

  async function goNext() {
    const count = dbCount;
    const next = await choose(profileRef.current, count, themeRef.current);
    if (!next) {
      setLine("Nenhum puzzle com esse filtro.");
      setDetail("Importe mais puzzles ou escolha outro tema.");
      setPhase("failed");
      return;
    }
    begin(next);
  }

  useEffect(() => {
    let alive = true;
    const saved = loadProfile();
    remember(saved);
    void (async () => {
      const count = await countPuzzles().catch(() => 0);
      if (!alive) return;
      setDbCount(count);
      const next = await choose(saved, count, "all");
      if (!alive || !next) return;
      begin(next);
    })();
    return () => {
      alive = false;
    };
    // Boot once. remember/choose/begin are stable enough for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "setup" || !puzzle || puzzle.moves.length < 2) return;
    const id = window.setTimeout(() => {
      const played = applyUci(puzzle.fen, puzzle.moves[0] ?? "");
      if (!played) {
        setPhase("failed");
        setLine("Esse puzzle está inválido.");
        return;
      }
      setFen(played.fen);
      setLastMove({ from: played.from, to: played.to });
      setStep(1);
      setPhase("user");
      setLine(turnLine(puzzle));
      setDetail(goalLine(puzzle, 1));
    }, 420);
    return () => window.clearTimeout(id);
  }, [phase, puzzle]);

  useEffect(() => {
    if (phase !== "reply" || !puzzle) return;
    const id = window.setTimeout(() => {
      const played = applyUci(fenRef.current, puzzle.moves[stepRef.current] ?? "");
      if (!played) {
        setPhase("failed");
        setLine("A continuação desse puzzle falhou.");
        return;
      }
      const nextStep = stepRef.current + 1;
      setFen(played.fen);
      setLastMove({ from: played.from, to: played.to });
      setStep(nextStep);
      if (nextStep >= puzzle.moves.length || isMateFen(played.fen)) {
        settle(true);
        return;
      }
      setPhase("user");
      setLine(turnLine(puzzle));
      setDetail(goalLine(puzzle, nextStep));
    }, 460);
    return () => window.clearTimeout(id);
  }, [phase, puzzle]);

  useEffect(() => {
    if (phase !== "showing" || !puzzle) return;
    let cancelled = false;
    let timer = 0;
    const run = (currentFen: string, currentStep: number) => {
      if (cancelled || currentStep >= puzzle.moves.length) return;
      timer = window.setTimeout(() => {
        if (cancelled) return;
        const played = applyUci(currentFen, puzzle.moves[currentStep] ?? "");
        if (!played) return;
        setFen(played.fen);
        setLastMove({ from: played.from, to: played.to });
        setStep(currentStep + 1);
        setArrows([]);
        run(played.fen, currentStep + 1);
      }, 560);
    };
    run(fenRef.current, stepRef.current);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [phase, puzzle]);

  useEffect(() => {
    if (phase !== "solved" || !autoNext) return;
    const id = window.setTimeout(() => {
      void goNext();
    }, 1200);
    return () => window.clearTimeout(id);
    // goNext reads refs; autoNext/phase/puzzle identity are the triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, autoNext, puzzle?.id]);

  function settle(success: boolean, extra?: string) {
    const currentPuzzle = puzzleRef.current;
    if (!currentPuzzle) return;
    const next = applyResult(profileRef.current, currentPuzzle, success, hintedRef.current);
    const delta = next.rating - profileRef.current.rating;
    const signed = `${delta >= 0 ? "+" : "−"}${Math.abs(delta)}`;
    remember(next);
    const ratingBit = success
      ? hintedRef.current
        ? `${signed} de rating · a dica não aumenta a sequência`
        : `${signed} de rating · sequência ${next.streak}`
      : `${signed} de rating · sequência zerada`;
    if (success) {
      setPhase("solved");
      setLine("Resolvido.");
      setDetail(extra ? `${extra} ${ratingBit}` : ratingBit);
      setArrows([]);
      return;
    }
    setPhase("failed");
    setLine("Não era esse lance.");
    setDetail(extra ? `${extra} ${ratingBit}` : ratingBit);
  }

  function commit(from: Square, to: Square, promotion?: Promo) {
    const current = puzzleRef.current;
    if (!current || phase !== "user") return;
    const uci = `${from}${to}${promotion ?? ""}`;
    const played = applyUci(fenRef.current, uci);
    if (!played) return;
    const expected = current.moves[stepRef.current] ?? "";
    const mate = isMateFen(played.fen);
    const correct = uci === expected || (mate && uci !== expected);
    setSelected(null);
    setPromo(null);
    setHintSquare(null);
    if (!correct) {
      const solution = applyUci(fenRef.current, expected);
      if (solution) setArrows([{ from: solution.from, to: solution.to, tone: "good" }]);
      settle(false, `O lance era ${solution?.san ?? expected}.`);
      return;
    }
    setFen(played.fen);
    setLastMove({ from: played.from, to: played.to });
    setArrows([]);
    const nextStep = stepRef.current + 1;
    setStep(nextStep);
    if (mate || nextStep >= current.moves.length) {
      settle(true);
      return;
    }
    setPhase("reply");
    setLine("Observe o lance.");
    setDetail(goalLine(current, nextStep));
  }

  function tryMove(from: Square, to: Square) {
    if (phase !== "user") return;
    const options = new Chess(fenRef.current).moves({ square: from, verbose: true }).filter((move) => move.to === to);
    if (options.length === 0) {
      selectSquare(to);
      return;
    }
    const promotions = options.filter((move) => move.promotion);
    if (promotions.length > 1) {
      setPromo({ from, to, color: new Chess(fenRef.current).turn() });
      setSelected(null);
      return;
    }
    commit(from, to, promotions[0]?.promotion as Promo | undefined);
  }

  function selectSquare(square: Square) {
    if (phase !== "user" || !puzzle) return;
    const chess = new Chess(fen);
    if (selected) {
      const legal = chess.moves({ square: selected, verbose: true });
      if (legal.some((move) => move.to === square)) {
        tryMove(selected, square);
        return;
      }
    }
    const piece = chess.get(square);
    if (piece && piece.color === chess.turn() && piece.color === solverColor(puzzle)) {
      setSelected(square);
      return;
    }
    setSelected(null);
  }

  function showHint() {
    const current = puzzleRef.current;
    if (!current || phase !== "user" || hintedRef.current) return;
    const from = current.moves[stepRef.current]?.slice(0, 2) as Square | undefined;
    if (!from) return;
    hintedRef.current = true;
    setHinted(true);
    setHintSquare(from);
    setSelected(from);
    setDetail("Dica: mova a peça marcada. A sequência não sobe.");
  }

  const targets =
    selected && phase === "user"
      ? [...new Set(new Chess(fen).moves({ square: selected, verbose: true }).map((move) => move.to))]
      : [];

  const interactive = phase === "user";
  const solver = puzzle ? solverColor(puzzle) : "w";

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="flex flex-col gap-3">
        <div className="mx-auto w-full max-w-xl">
          <p className="h-5 truncate text-sm text-ink">{line}</p>
          <p className="h-5 truncate text-sm text-walnut" title={detail}>
            {detail}
          </p>
        </div>
        <div className="relative mx-auto w-full max-w-xl">
          <Board
            fen={fen}
            flipped={flipped}
            selected={selected ?? hintSquare}
            targets={targets}
            lastMove={lastMove}
            checkSquare={kingInCheck(fen)}
            arrows={arrows}
            interactive={interactive}
            player={solver}
            onSquare={selectSquare}
            onDrop={tryMove}
          />
          {promo ? (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink/35 p-4">
              <div className="flex gap-2 rounded-3xl bg-paper p-3">
                {(["q", "r", "b", "n"] as Promo[]).map((piece) => (
                  <button
                    key={piece}
                    type="button"
                    className="flex size-14 items-center justify-center rounded-lg bg-cream"
                    aria-label={PROMO_LABEL[piece]}
                    onClick={() => commit(promo.from, promo.to, piece)}
                  >
                    <img alt="" src={`/pieces/${promo.color}${piece.toUpperCase()}.svg`} className="size-10" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="mx-auto flex w-full max-w-xl flex-wrap gap-2">
          <button type="button" className={btn()} onClick={() => setFlipped((value) => !value)}>
            Virar
          </button>
          <button type="button" className={btn()} onClick={showHint} disabled={phase !== "user" || hinted}>
            Dica
          </button>
          <button
            type="button"
            className={btn()}
            disabled={phase !== "user"}
            onClick={() => {
              const expected = puzzle?.moves[step] ?? "";
              const solution = applyUci(fen, expected);
              if (solution) setArrows([{ from: solution.from, to: solution.to, tone: "good" }]);
              settle(false, solution ? `O lance era ${solution.san}.` : undefined);
              setLine("Você desistiu.");
            }}
          >
            Desistir
          </button>
          {phase === "failed" ? (
            <button type="button" className={btn()} onClick={() => setPhase("showing")}>
              Ver solução
            </button>
          ) : null}
          <button type="button" className={btn(true)} onClick={() => void goNext()} disabled={phase === "loading" || phase === "setup" || phase === "reply" || importing}>
            Próximo
          </button>
        </div>
      </section>

      <aside className="flex flex-col gap-3">
        <section className="rounded-3xl border border-line bg-paper p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Seu rating</h2>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Rating" value={String(profile.rating)} />
            <Stat label="Sequência" value={String(profile.streak)} />
            <Stat label="Recorde" value={String(profile.best)} />
          </div>
          <p className="mt-3 text-sm text-muted">
            {profile.solved} certos · {profile.failed} erros. Acertar sobe o rating conforme a dificuldade. Errar zera a sequência.
          </p>
          <label className="mt-3 mb-1 block text-sm text-muted" htmlFor="puzzle-rating">
            Ajustar rating
          </label>
          <input
            id="puzzle-rating"
            inputMode="numeric"
            value={ratingDraft}
            onChange={(event) => setRatingDraft(event.target.value.replace(/[^\d]/g, "").slice(0, 4))}
            onBlur={() => {
              const rating = Math.max(400, Math.min(2800, Math.round(Number(ratingDraft) || profileRef.current.rating)));
              remember({ ...profileRef.current, rating });
            }}
            className="min-h-11 w-full rounded-lg border border-line bg-cream px-3 font-mono text-sm"
          />
          <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={autoNext}
              onChange={(event) => {
                setAutoNext(event.target.checked);
                remember({ ...profileRef.current, autoNext: event.target.checked });
              }}
            />
            Próximo automático depois de um acerto
          </label>
        </section>

        <section className="rounded-3xl border border-line bg-paper p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Base de puzzles</h2>
          <p className="text-sm text-muted">
            {dbCount > 0
              ? `${dbCount.toLocaleString("pt-BR")} puzzles importados. O próximo sai perto do seu rating.`
              : "Pacote inicial de mates. Importe um CSV da Lichess, ou um JSON, para usar a sua base."}
          </p>
          {puzzle && puzzle.themes.length > 0 ? (
            <p className="mt-2 text-sm text-ink">{puzzle.themes.slice(0, 3).map(themeLabel).join(" · ")} · {puzzle.rating}</p>
          ) : null}
          <label className="mt-3 mb-1 block text-sm text-muted" htmlFor="puzzle-theme">
            Tema do próximo
          </label>
          <select
            id="puzzle-theme"
            value={theme}
            onChange={(event) => setTheme(event.target.value as ThemeFilter)}
            className="min-h-11 w-full rounded-lg border border-line bg-cream px-2 text-sm"
          >
            {THEME_FILTERS.map((item) => (
              <option key={item} value={item}>
                {themeLabel(item)}
              </option>
            ))}
          </select>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json,.txt,text/csv,application/json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importFile(file);
            }}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className={btn(true)} disabled={importing} onClick={() => fileRef.current?.click()}>
              {importing ? "Importando…" : "Importar"}
            </button>
            <button type="button" className={btn()} onClick={downloadSample}>
              Exemplo CSV
            </button>
            <button
              type="button"
              className={btn()}
              disabled={dbCount === 0 || importing}
              onClick={() => {
                if (!confirmClear) {
                  setConfirmClear(true);
                  return;
                }
                void clearPuzzles()
                  .then(() => {
                    setDbCount(0);
                    setConfirmClear(false);
                    setImportNote("Base importada apagada. Voltamos ao pacote inicial.");
                  })
                  .catch(() => setImportNote("Não consegui apagar a base."));
              }}
            >
              {confirmClear ? "Confirmar limpar" : "Limpar base"}
            </button>
            <button type="button" className={btn()} onClick={() => void goNext()} disabled={importing || phase === "setup" || phase === "reply"}>
              Sortear
            </button>
          </div>
          <p className="mt-3 text-sm text-muted">
            O CSV da Lichess usa PuzzleId, FEN, Moves e Rating. O primeiro lance é do adversário; você responde em seguida, e a linha continua até o fim.
          </p>
          {importNote ? <p className="mt-2 text-sm text-ink">{importNote}</p> : null}
        </section>
      </aside>
    </div>
  );

  async function importFile(file: File) {
    setImporting(true);
    setConfirmClear(false);
    setImportNote("Lendo o arquivo…");
    try {
      if (file.size > 120_000_000) {
        setImportNote("Arquivo grande demais. Use um CSV de até 120 MB.");
        return;
      }
      const head = (await file.slice(0, 1).text()).trim();
      let added = 0;
      let skipped = 0;
      if (head === "{" || head === "[") {
        if (file.size > 32_000_000) {
          setImportNote("JSON muito grande. Prefira o CSV da Lichess.");
          return;
        }
        const parsed = parsePuzzleDocument(await file.text());
        await putPuzzles(parsed.puzzles);
        added = parsed.puzzles.length;
        skipped = parsed.skipped;
      } else {
        const result = await streamDelimited(file, (count) => setImportNote(`${count.toLocaleString("pt-BR")} puzzles…`));
        added = result.added;
        skipped = result.skipped;
      }
      const count = await countPuzzles();
      setDbCount(count);
      setImportNote(
        added > 0
          ? `${added.toLocaleString("pt-BR")} puzzles importados${skipped ? ` · ${skipped.toLocaleString("pt-BR")} linhas ignoradas` : ""}.`
          : "Não reconheci puzzles nesse arquivo.",
      );
    } catch {
      setImportNote("Não consegui importar esse arquivo.");
    } finally {
      setImporting(false);
    }
  }
}

function turnLine(puzzle: Puzzle) {
  return solverColor(puzzle) === "w" ? "Sua vez, com as brancas." : "Sua vez, com as pretas.";
}

function goalLine(puzzle: Puzzle, step: number) {
  const start = puzzle.moves.length >= 2 ? 1 : 0;
  const total = Math.max(1, Math.ceil((puzzle.moves.length - start) / 2));
  const index = Math.min(total, Math.floor((Math.max(step, start) - start) / 2) + 1);
  const kind = puzzle.themes.includes("mate") ? "Dê o mate" : "Encontre a continuação";
  return total > 1 ? `${kind} · lance ${index} de ${total}` : kind;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-cream px-2 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-mono text-lg tabular-nums text-ink">{value}</p>
    </div>
  );
}

function btn(active = false) {
  return `min-h-11 rounded-lg px-3 text-sm disabled:opacity-50 ${active ? "bg-walnut text-cream" : "border border-line bg-paper text-ink"}`;
}

function downloadSample() {
  const header = "PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags";
  const lines = BUILTIN_PUZZLES.map((puzzle) =>
    [puzzle.id, puzzle.fen, puzzle.moves.join(" "), puzzle.rating, 80, 90, 20, puzzle.themes.join(" "), "", ""].join(","),
  );
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "puzzles-exemplo.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function streamDelimited(file: File, onCount: (count: number) => void) {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let header = "";
  let sawHeader = false;
  let batch: string[] = [];
  let added = 0;
  let skipped = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    const body = batch;
    batch = [];
    const text = header ? [header, ...body].join("\n") : body.join("\n");
    const parsed = parsePuzzleDocument(text);
    await putPuzzles(parsed.puzzles);
    added += parsed.puzzles.length;
    skipped += parsed.skipped;
    onCount(added);
  };

  const take = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    if (!sawHeader) {
      sawHeader = true;
      const lower = trimmed.toLowerCase();
      if (lower.includes("fen") || lower.includes("puzzleid") || lower.includes("moves")) {
        header = trimmed;
        return;
      }
    }
    batch.push(trimmed);
    if (batch.length >= 400) await flush();
  };

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      await take(line);
      newline = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) await take(buffer);
  await flush();
  return { added, skipped };
}
