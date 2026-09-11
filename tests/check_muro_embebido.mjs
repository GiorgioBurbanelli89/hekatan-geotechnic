// MURO EMBEBIDO (Jorge, 11-sep-2026: «no puedo bajar más y se supone que la pantalla debe sostener el
// terreno y no puedo embeberlo»): el pie del muro tiene que poder ir DONDE ESTÉ EL CURSOR, y si queda por
// debajo del terreno el programa excava por delante y la pantalla sostiene el terreno de arriba.
//   node tests/check_muro_embebido.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(), out = "tests/shots/embebido"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 1000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const idle = async () => { await wait(400); try { await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 180000 }); } catch {} await wait(300); };
const w2px = (x, z) => page.evaluate((x, z) => { const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + (px * r.width) / c.width, py: r.top + (py * r.height) / c.height }; }, x, z);
const moveW = async (x, z) => { const p = await w2px(x, z); await page.mouse.move(p.px, p.py, { steps: 4 }); await wait(180); };
const clickW = async (x, z) => { const p = await w2px(x, z); await page.mouse.move(p.px, p.py, { steps: 4 }); await wait(120); await page.mouse.click(p.px, p.py); await wait(300); };
const estado = () => page.$eval("#dstatus", (e) => e.textContent.trim());
const hgeo = () => page.$eval("#hgeo", (e) => e.value);

await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.select("#model", "hgeo"); await wait(300);
// el talud del caso de Jorge: terreno de -9 al pie y -2 arriba
await page.$eval("#hgeo", (e, v) => { e.value = v; }, `# muro a media ladera\nmargenes xmin=0 xmax=40 fondo=-20\ninterfaz 0,-9 10,-9 22,-2 40,-2\nsuelo LIMO E=25000 nu=0.3 phi=30 c=15 gamma=19\nmalla 1.8\netapa peso propio\n`);
await page.click("#apply"); await idle();
console.log("talud limpio:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\s+/g, " ").trim());

await page.click('.tb[data-tool="muro"]'); await wait(300);
// 1) el cursor BAJA por debajo del terreno: la marca del pie tiene que seguirlo y avisar de que va embebido
await moveW(16, -5.5); const e1 = await estado();
await moveW(16, -6.5); const e2 = await estado();
await moveW(16, -8);   const e3 = await estado();
await page.screenshot({ path: `${out}/01_pie_bajando.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });
console.log("pie sobre el terreno (-5.5):", e1.slice(0, 70));
console.log("pie 1 m más abajo  (-6.5):", e2.slice(0, 70));
console.log("pie 2.5 m más abajo (-8):", e3.slice(0, 70));

// 2) dos clics: pie embebido a -6 y coronación a -2 → la pantalla sostiene el terreno de arriba
await clickW(16, -6); console.log("\ntras el 1er clic:", (await estado()).slice(0, 110));
await moveW(16, -4); await page.screenshot({ path: `${out}/02_fantasma_H.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });
await clickW(16, -2); await idle();
const t = await hgeo();
console.log("orden escrita:", (t.match(/^muro.*$/m) || ["(NINGUNA ✖)"])[0]);
console.log("¿lleva la cota del pie?", /z=-6/.test(t) ? "✓ z=-6" : "✖ no");
console.log("FS con el muro:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\s+/g, " ").trim());
console.log("malla:", await page.$eval("#edmsg", (e) => e.textContent));
await page.click('.tb[data-tool="ver"]'); await wait(400);
await page.screenshot({ path: `${out}/03_embebido.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });
// el terreno efectivo tiene que llevar la EXCAVACIÓN: un tramo horizontal a la cota del pie delante del muro
const terr = await page.evaluate(() => (window.__terrEf ? window.__terrEf() : null));
console.log("terreno efectivo:", terr ? terr.map((p) => p.join(",")).join(" ") : "(no expuesto)");
console.log("verificación:", (await page.$eval("#wout", (e) => e.innerText)).replace(/\s+/g, " ").slice(0, 200));
console.log("\nerrores JS:", errs); await browser.close(); process.exit(errs.length ? 1 : 0);
