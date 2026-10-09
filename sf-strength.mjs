import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const logs = [];
page.on("console", (msg) => {
  const t = msg.text();
  if (msg.type() === "error" || t.startsWith("SF") || t.includes("eval") || t.includes("NNUE") || t.includes("bestmove")) logs.push(t);
});
page.on("pageerror", (err) => logs.push("PAGE " + err.message));
await page.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded" });
await page.getByText("motor pronto", { exact: false }).waitFor({ timeout: 30000 });
await page.locator("#skill").focus();
for (let i = 0; i < 15; i += 1) await page.keyboard.press("ArrowRight");
await page.getByText("Stockfish pleno").waitFor({ timeout: 5000 });
await page.locator("[data-square='e2']").click();
await page.locator("[data-square='e4']").click();
await page.waitForTimeout(8000);
const mid = await page.locator("body").innerText();
console.log("--- MID ---\n", mid.slice(0, 1500));
await page.waitForTimeout(8000);
const end = await page.locator("body").innerText();
console.log("--- END ---\n", end.slice(0, 1500));
console.log("LOGS", logs.slice(-20));
await page.screenshot({ path: "/workspace/screenshots/engine-move.png", fullPage: true });
await browser.close();
