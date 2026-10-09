import type { Puzzle } from "@/lib/puzzles";

const DB_NAME = "grok-chess-puzzles";
const STORE = "puzzles";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("rating", "rating", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir a base de puzzles."));
  });
}

export async function countPuzzles() {
  const db = await openDb();
  try {
    return await new Promise<number>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function clearPuzzles() {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function putPuzzles(puzzles: Puzzle[]) {
  if (puzzles.length === 0) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const puzzle of puzzles) store.put(puzzle);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Importação interrompida."));
    });
  } finally {
    db.close();
  }
}

export async function randomNear(rating: number, avoid: Set<string>, theme: string): Promise<Puzzle | null> {
  const db = await openDb();
  try {
    const spans = [250, 550, 1200, 4000];
    for (const span of spans) {
      const found = await sample(db, Math.max(0, rating - span), rating + span, avoid, theme);
      if (found) return found;
    }
    return null;
  } finally {
    db.close();
  }
}

function sample(db: IDBDatabase, min: number, max: number, avoid: Set<string>, theme: string) {
  const range = IDBKeyRange.bound(min, max);
  return new Promise<Puzzle | null>((resolve, reject) => {
    const index = db.transaction(STORE, "readonly").objectStore(STORE).index("rating");
    const countRequest = index.count(range);
    countRequest.onerror = () => reject(countRequest.error);
    countRequest.onsuccess = () => {
      const total = countRequest.result;
      if (total === 0) {
        resolve(null);
        return;
      }
      const offset = Math.floor(Math.random() * total);
      const indexAgain = db.transaction(STORE, "readonly").objectStore(STORE).index("rating");
      walk(indexAgain, range, offset, avoid, theme, (found) => {
        if (found || offset === 0) {
          resolve(found);
          return;
        }
        const retry = db.transaction(STORE, "readonly").objectStore(STORE).index("rating");
        walk(retry, range, 0, avoid, theme, resolve, reject);
      }, reject);
    };
  });
}

function walk(
  index: IDBIndex,
  range: IDBKeyRange,
  offset: number,
  avoid: Set<string>,
  theme: string,
  resolve: (puzzle: Puzzle | null) => void,
  reject: (reason?: unknown) => void,
) {
  const request = index.openCursor(range);
  let skipped = offset;
  let tries = 0;
  let fallback: Puzzle | null = null;
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor || tries > (theme === "all" ? 40 : 500)) {
      resolve(fallback);
      return;
    }
    if (skipped > 0) {
      const jump = Math.min(skipped, 200);
      skipped -= jump;
      cursor.advance(jump);
      return;
    }
    const puzzle = cursor.value as Puzzle;
    const themed = theme === "all" || puzzle.themes.includes(theme);
    if (themed) {
      if (!avoid.has(puzzle.id)) {
        resolve(puzzle);
        return;
      }
      if (!fallback) fallback = puzzle;
    }
    tries += 1;
    cursor.continue();
  };
}

