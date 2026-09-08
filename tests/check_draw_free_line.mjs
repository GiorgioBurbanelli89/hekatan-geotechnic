// LÍNEA LIBRE dibujada con CLICS (la línea roja de Jorge): toca el borde izquierdo, va y vuelve y termina en la cara del
// talud → debe cerrar una región con su propio suelo (GEO5 Free line).  node tests/check_draw_free_line.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(); mkdirSync("tests/shots/free", { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); const page = await browser.newPage(); await page.setViewport({ width: 1998, height: 1139 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const idle = async () => { await wait(400); try { await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 120000 }); } catch {} await wait(250); };
const clickWorld = async (x, z) => { const { px, py } = await page.evaluate((x, z) => { const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height }; }, x, z); await page.mouse.move(px, py); await wait(80); await page.mouse.click(px, py); await wait(150); };
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.select("#model", "hgeo"); await wait(300);
await page.$eval("#hgeo", (e, v) => { e.value = v; }, `margenes xmin=0 xmax=40 fondo=-20\ninterfaz 0,-6 10,-6 13,1 28,1 29,-1 40,-1\nsuelo LIMO_ARENOSO E=20000 nu=0.3 phi=26 c=10 gamma=18\nsuelo ARCILLA E=8000 nu=0.35 phi=18 c=15 gamma=17\nmalla 2\netapa peso propio\n`);
await page.click("#apply"); await idle(); console.log("base:", (await page.$eval("#edmsg", (e) => e.textContent)).slice(0, 40));
await page.click('.tb[data-tool="interfaz"]'); await wait(200);
for (const [x, z] of [[0, -9], [12, -7], [15, -3], [11, -1.7]]) { await clickWorld(x, z); console.log("  clic", x, z, "→", (await page.$eval("#cmdhist", (e) => e.innerText)).split("\n").slice(-1)[0]); }
await page.keyboard.press("Enter"); await idle();
console.log("tras Enter:", (await page.$eval("#cmdhist", (e) => e.innerText)).split("\n").filter((l) => l.includes("→")).slice(-1)[0]);
console.log("estado:", await page.$eval("#dstatus", (e) => e.textContent));
console.log("hgeo:", (await page.$eval("#hgeo", (e) => e.value)).split("\n").filter((l) => /^(linea|asignar)/.test(l)).join(" | "));
console.log("log:", (await page.$eval("#log", (e) => e.textContent)).split("\n").filter((l) => /MALLA/.test(l)).slice(-1)[0]);
console.log("FS:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
await page.screenshot({ path: "tests/shots/free/01.png" }); console.log("errores JS:", errs);
await browser.close(); process.exit(errs.length ? 1 : 0);
