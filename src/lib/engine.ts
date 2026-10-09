export type EngineLine = {
  multipv: number;
  depth: number;
  scoreCp: number | null;
  mate: number | null;
  pv: string;
};

export type SearchUpdate = {
  fen: string;
  lines: EngineLine[];
  depth: number;
};

export type SearchResult = {
  cancelled: boolean;
  fen: string;
  bestmove: string;
  lines: EngineLine[];
  depth: number;
};

export type SearchOpts = {
  fen: string;
  depth?: number;
  movetime?: number;
  multipv?: number;
  /** Ignored. Skill/Elo limits made Stockfish commit to a random worse move. */
  skill?: number;
  elo?: number | null;
};

type Waiter = {
  fen: string;
  lines: EngineLine[];
  resolve: (result: SearchResult) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** Time and depth for an honest search. Strength is applied later, on real scores. */
export function thinkBudget(level: number, opts?: { pace?: number | null; styled?: boolean }) {
  const skill = Math.max(0, Math.min(20, level));
  const styled = opts?.styled ?? false;
  const pace = opts?.pace;
  const base = 1000 + (skill / 20) * 3200;
  let factor = 1;
  if (pace != null && pace <= 400) factor = 0.8;
  else if (pace != null && pace >= 1500) factor = 1.2;
  if (styled && skill < 18) factor *= 1.12;
  const movetime = Math.round(Math.max(900, Math.min(6000, base * factor)));
  const depth = skill >= 18 ? 18 : skill >= 12 ? 15 : skill >= 6 ? 13 : 11;
  const multipv = styled ? (skill >= 16 ? 3 : 4) : 1;
  return { movetime, depth, multipv };
}

export function parseInfo(line: string): Partial<EngineLine> | null {
  if (!line.startsWith("info ") || !line.includes(" score ")) return null;
  if (line.includes(" lowerbound") || line.includes(" upperbound")) return null;
  const depth = Number(line.match(/depth (\d+)/)?.[1] ?? 0);
  const multipv = Number(line.match(/multipv (\d+)/)?.[1] ?? 1);
  const cp = line.match(/score cp (-?\d+)/);
  const mate = line.match(/score mate (-?\d+)/);
  const pv = line.match(/ pv (.+)/)?.[1]?.trim() ?? "";
  return {
    depth,
    multipv,
    scoreCp: cp ? Number(cp[1]) : null,
    mate: mate ? Number(mate[1]) : null,
    pv,
  };
}

export class StockfishEngine {
  private worker: Worker | null = null;
  private waiter: Waiter | null = null;
  private searching = false;
  private stopWaiters: Array<() => void> = [];
  private readyWaiters: Array<() => void> = [];
  private session = 0;
  private readySettled = false;
  private nnue = false;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  ready: Promise<void>;

  constructor() {
    this.ready = this.makeReady();
  }

  private makeReady() {
    this.readySettled = false;
    this.nnue = false;
    return new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
  }

  start() {
    if (this.worker || typeof Worker === "undefined") return;
    this.boot();
  }

  private boot() {
    const session = ++this.session;
    const worker = new Worker("/engine/stockfish-nnue-16-single.js");
    this.worker = worker;
    worker.onmessage = (event) => {
      if (session !== this.session) return;
      this.onLine(String(event.data ?? ""));
    };
    worker.onerror = () => {
      if (session !== this.session) return;
      this.fail(new Error("Falha ao carregar o Stockfish"));
    };
    this.send("uci");
    this.send("setoption name Use NNUE value true");
    this.send("setoption name Hash value 64");
    this.send("setoption name Skill Level value 20");
    this.send("setoption name UCI_LimitStrength value false");
    this.send("setoption name MultiPV value 1");
    this.send("isready");
  }

  private fail(error: Error) {
    if (!this.readySettled) {
      this.readySettled = true;
      this.rejectReady(error);
    }
  }

  private settleReady() {
    if (this.readySettled) return;
    if (!this.nnue) {
      this.fail(new Error("Rede neural do Stockfish não carregou"));
      return;
    }
    this.readySettled = true;
    this.resolveReady();
  }

  private finishWaiter(bestmove: string, cancelled: boolean) {
    const waiter = this.waiter;
    this.waiter = null;
    this.searching = false;
    if (!waiter) return;
    clearTimeout(waiter.timer);
    const lines = waiter.lines.slice().sort((a, b) => a.multipv - b.multipv);
    waiter.resolve({
      cancelled,
      fen: waiter.fen,
      bestmove,
      lines,
      depth: lines.reduce((max, item) => Math.max(max, item.depth), 0),
    });
  }

  private releaseStops() {
    const pending = this.stopWaiters;
    this.stopWaiters = [];
    for (const fn of pending) fn();
  }

  private releaseReady() {
    const pending = this.readyWaiters;
    this.readyWaiters = [];
    for (const fn of pending) fn();
  }

  private onLine(line: string) {
    if (line.includes("Load eval file success: 1") || line.includes("NNUE evaluation enabled")) this.nnue = true;
    if (line === "readyok") {
      this.settleReady();
      this.releaseReady();
    }
    if (line.startsWith("bestmove")) {
      const bestmove = line.split(/\s+/)[1] ?? "(none)";
      const cancelled = this.stopWaiters.length > 0;
      this.finishWaiter(bestmove, cancelled);
      this.releaseStops();
      return;
    }
    if (!this.waiter) return;
    const info = parseInfo(line);
    if (!info || (info.scoreCp == null && info.mate == null)) return;
    const entry: EngineLine = {
      multipv: info.multipv ?? 1,
      depth: info.depth ?? 0,
      scoreCp: info.scoreCp ?? null,
      mate: info.mate ?? null,
      pv: info.pv ?? "",
    };
    const index = this.waiter.lines.findIndex((item) => item.multipv === entry.multipv);
    if (index >= 0) {
      if (entry.depth >= this.waiter.lines[index].depth) this.waiter.lines[index] = entry;
    } else this.waiter.lines.push(entry);
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  private snapshot(onUpdate?: (update: SearchUpdate) => void) {
    if (!this.waiter || !onUpdate) return;
    const lines = this.waiter.lines.slice().sort((a, b) => a.multipv - b.multipv);
    if (lines.length === 0) return;
    onUpdate({
      fen: this.waiter.fen,
      lines,
      depth: lines.reduce((max, item) => Math.max(max, item.depth), 0),
    });
  }

  private reboot() {
    this.worker?.terminate();
    this.worker = null;
    this.finishWaiter("(none)", true);
    this.releaseStops();
    this.releaseReady();
    this.ready = this.makeReady();
    if (typeof Worker !== "undefined") this.boot();
  }

  cancel(): Promise<void> {
    if (!this.searching) return Promise.resolve();
    return new Promise((resolve) => {
      this.stopWaiters.push(resolve);
      this.send("stop");
      setTimeout(() => {
        if (!this.stopWaiters.includes(resolve)) return;
        this.reboot();
        resolve();
      }, 1600);
    });
  }

  private whenReady() {
    return new Promise<void>((resolve) => {
      this.readyWaiters.push(resolve);
      this.send("isready");
    });
  }

  async search(opts: SearchOpts, onUpdate?: (update: SearchUpdate) => void): Promise<SearchResult> {
    await this.ready;
    await this.cancel();
    await this.ready;
    this.send("setoption name Skill Level value 20");
    this.send("setoption name UCI_LimitStrength value false");
    this.send(`setoption name MultiPV value ${opts.multipv ?? 1}`);
    await this.whenReady();
    this.send(`position fen ${opts.fen}`);

    let pushUpdate: ReturnType<typeof setInterval> | null = null;
    const result = await new Promise<SearchResult>((resolve) => {
      const timer = setTimeout(() => this.send("stop"), 28000);
      this.waiter = { fen: opts.fen, lines: [], resolve, timer };
      this.searching = true;
      if (onUpdate) pushUpdate = setInterval(() => this.snapshot(onUpdate), 140);
      const depth = opts.depth ?? 14;
      if (opts.movetime) this.send(`go movetime ${Math.max(200, opts.movetime)} depth ${depth}`);
      else this.send(`go depth ${depth}`);
    });
    if (pushUpdate) clearInterval(pushUpdate);
    if (!result.cancelled) this.snapshot(onUpdate);
    return result;
  }

  dispose() {
    this.session += 1;
    this.finishWaiter("(none)", true);
    this.releaseStops();
    this.releaseReady();
    this.worker?.terminate();
    this.worker = null;
    this.searching = false;
  }
}
