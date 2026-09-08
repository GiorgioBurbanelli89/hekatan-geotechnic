// La línea de órdenes tiene que verse SIN hacer scroll en una pantalla normal (Jorge: "el deploy no me deja hacer eso").
//   node tests/check_cmd_visible.mjs [url] [outdir]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(), out = process.argv[3] || "tests/shots/cmd_visible"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = true;
for (const [w, h] of [[1998, 1139], [1536, 864], [1366, 768]]) {
  await page.setViewport({ width: w, height: h }); await page.goto(url, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 }); await wait(300);
  const r = await page.$eval("#cmdin", (e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; });
  const vis = r.bottom <= h && r.top >= 0; ok &&= vis;
  console.log(`${w}x${h}: Orden: en y=${r.top}…${r.bottom} → ${vis ? "VISIBLE" : "FUERA DE PANTALLA"}`);
  await page.screenshot({ path: `${out}/inicio_${w}.png` });
}
// y se puede usar: nuevo → margenes → interfaz escrita → suelo → FS
await page.setViewport({ width: 1998, height: 1139 }); await page.goto(url, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
const cmd = async (t) => { await page.focus("#cmdin"); await page.$eval("#cmdin", (e, v) => { e.value = v; }, t); await page.keyboard.press("Enter"); await wait(400); try { await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 120000 }); } catch {} };
for (const t of ["nuevo", "margenes xmin=0 xmax=40 fondo=-20", "interfaz", "0,-8", "12,-8", "22,-2", "40,-2", "", "suelo RELLENO E=30000 nu=0.3 phi=25 c=5 gamma=18"]) await cmd(t);
await wait(800); await page.screenshot({ path: `${out}/talud_por_ordenes.png` });
console.log("FS:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
await browser.close(); process.exit(ok ? 0 : 1);
