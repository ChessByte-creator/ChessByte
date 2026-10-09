import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded" });
const result = await page.evaluate(async () => {
  const w = new Worker("/engine/stockfish-nnue-16-single.js");
  const lines = [];
  w.onmessage = (e) => lines.push(String(e.data));
  const wait = (pred, ms) =>
    new Promise((resolve, reject) => {
      const t = setInterval(() => {
        if (lines.some(pred)) {
          clearInterval(t);
          resolve(true);
        }
      }, 40);
      setTimeout(() => {
        clearInterval(t);
        reject(new Error(lines.slice(-6).join(" | ")));
      }, ms);
    });
  w.postMessage("uci");
  await wait((l) => l === "uciok", 10000);
  w.postMessage("setoption name Use NNUE value true");
  w.postMessage("setoption name Hash value 16");
  w.postMessage("isready");
  await wait((l) => l === "readyok", 20000);
  lines.length = 0;
  w.postMessage("position startpos moves e2e4");
  const t0 = performance.now();
  w.postMessage("go movetime 2000 depth 18");
  await wait((l) => l.startsWith("bestmove"), 45000);
  const infos = lines.filter((l) => l.startsWith("info depth") && !l.includes("bound"));
  return {
    ms: Math.round(performance.now() - t0),
    best: lines.find((l) => l.startsWith("bestmove")),
    last: infos.at(-1),
    nnue: lines.some((l) => l.includes("NNUE")),
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
