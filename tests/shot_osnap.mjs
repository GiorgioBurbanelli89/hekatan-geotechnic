// Snaps de objeto: mueve el cursor cerca de un extremo, un punto medio, una intersección y un tramo y
// captura el marcador + el texto de estado.   node tests/shot_osnap.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = process.argv[2] || "http://localhost:4700/", out = "tests/shots";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 900 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const waitTotal = async () => page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
const moveWorld = async (x, z) => { const { px, py } = await page.evaluate((x, z) => { const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height }; }, x, z); await page.mouse.move(px, py, { steps: 4 }); await wait(150); };
await page.goto(url, { waitUntil: "networkidle0" }); await waitTotal();
await page.select("#model", "hgeo"); await wait(300); await waitTotal(); await wait(300);
// una interfaz que CRUZA la 2ª para tener una intersección
await page.$eval("#hgeo", (e) => { e.value = e.value.replace("malla 2.3", "interfaz 0,-8 40,-12\nmalla 2.3"); }); await page.click("#apply"); await wait(300); await waitTotal(); await wait(300);
await page.click('.tb[data-tool="interfaz"]'); await wait(200);
const casos = [["extremo", 11.2, -9.15], ["medio", 16.15, -5.6], ["interseccion", 10.2, -9.15], ["cercano", 6, -8.5], ["perpendicular", 13.7, -7.4]];
let k = 0;
for (const [nombre, x, z] of casos) {
  if (nombre === "perpendicular") { await moveWorld(16, -11); await page.mouse.down(); await page.mouse.up(); }   // punto de referencia
  await moveWorld(x, z);
  const st = await page.$eval("#dstatus", (e) => e.textContent);
  k++; await page.screenshot({ path: `${out}/osnap_${k}_${nombre}.png`, clip: { x: 330, y: 60, width: 1060, height: 720 } });
  console.log(`${nombre.padEnd(14)} cursor en (${x},${z}) → ${st}`);
}
await browser.close();
