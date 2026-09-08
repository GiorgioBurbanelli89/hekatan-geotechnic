// Solo las escenas ETAPAS (hover de carga) y RESULTADOS (pestañas de etapa) sobre un modelo de 3 etapas ya hecho
// (talud_4suelos): robusto, no construye las etapas paso a paso.  node tests/frames_tutorial_etapas.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "https://giorgioburbanelli89.github.io/hekatan-geotechnic/?tema=oscuro") + (process.argv[2] ? "" : "&v=" + Date.now());
const SCHOOL = "C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-school";
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const waitTotal = async () => page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
const waitIdle = async () => { await wait(350); try { await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 120000 }); } catch {} await wait(150); };
await page.goto(url, { waitUntil: "networkidle0" }); await waitTotal();
await page.evaluate(() => {
  const css = document.createElement("style");
  css.textContent = `#log,footer,#hover,#dstatus{display:none!important} main{grid-template-columns:470px 1fr!important;padding:8px 14px!important;gap:10px!important}
    #editor{display:none!important} .fs table{font-size:13px!important} #cmd{font-size:15px!important} #cmdhist{min-height:3.6em!important;max-height:3.6em!important} #etabs button{font-size:13px!important}`;
  document.head.appendChild(css); window.scrollTo(0, 0);
  const cur = document.createElement("div"); cur.id = "__cur"; cur.style.cssText = "position:fixed;left:-100px;top:-100px;width:30px;height:38px;z-index:99999;pointer-events:none;filter:drop-shadow(0 0 3px #000)";
  cur.innerHTML = '<svg viewBox="0 0 24 32" width="30" height="38"><path d="M2 2 L2 24 L8 18 L13 29 L17 27 L12 17 L20 17 Z" fill="#fff" stroke="#000" stroke-width="1.6"/></svg>';
  document.body.appendChild(cur);
  const ring = document.createElement("div"); ring.id = "__ring"; ring.style.cssText = "position:fixed;left:-100px;top:-100px;width:34px;height:34px;border:3px solid #ffb300;border-radius:50%;z-index:99998;pointer-events:none;transform:translate(-50%,-50%);display:none";
  document.body.appendChild(ring);
  const modo = document.createElement("style"); modo.id = "__modo"; document.head.appendChild(modo);
  window.__modo = (m) => { modo.textContent = m === "sliders" ? "aside.panel>*:not(#gsliders):not(#sliders):not(#fs):not(h2){display:none!important}" : "aside.panel>*:not(#pasos):not(#fs):not(#archivo){display:none!important}"; };
  window.__modo("");
});
const showCursor = (px, py) => page.evaluate((x, y) => { const c = document.getElementById("__cur"); c.style.left = x + "px"; c.style.top = y + "px"; }, px, py);
const flash = () => page.evaluate(() => { const c = document.getElementById("__cur"), r = document.getElementById("__ring"); r.style.left = c.style.left; r.style.top = c.style.top; r.style.display = "block"; });
const unflash = () => page.evaluate(() => { document.getElementById("__ring").style.display = "none"; });
const clip = await page.evaluate(() => { const r = document.querySelector("main").getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(Math.min(r.height, r.width * 9 / 16)) }; });
const beats = JSON.parse(readFileSync(`${SCHOOL}/frames_geo_beats.json`, "utf8"));
let cur = null, k = 0;
const start = (name) => { cur = name; k = 0; rmSync(`${SCHOOL}/frames_geo_${name}`, { recursive: true, force: true }); mkdirSync(`${SCHOOL}/frames_geo_${name}`, { recursive: true }); beats[name] = 0; };
const frame = async () => { const path = `${SCHOOL}/frames_geo_${cur}/f${String(k).padStart(3, "0")}.png`; try { await page.screenshot({ path, clip, timeout: 60000 }); } catch { await wait(800); await page.screenshot({ path, clip, timeout: 60000 }); } k++; beats[cur] = k; };
const frames = async (n, ms = 120) => { for (let i = 0; i < n; i++) { await frame(); await wait(ms); } };
const worldPx = (x, z) => page.evaluate((x, z) => { const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height }; }, x, z);
const moveTo = async (x, z, n = 6) => { const { px, py } = await worldPx(x, z); await page.mouse.move(px, py, { steps: n }); await showCursor(px, py); await wait(80); };
const glide = async (x, z, n = 5) => { for (let i = 1; i <= n; i++) { await moveTo(x, z, 3); await frame(); } };
const moveToEl = async (sel, frac = 0.5) => { const r = await page.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; }); const px = r.l + r.w * frac, py = r.t + r.h / 2; await page.mouse.move(px, py, { steps: 4 }); await showCursor(px, py); await wait(60); };

// cargar el modelo de 3 etapas
await page.select("#model", "hgeo"); await wait(300);
await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync("examples/talud_4suelos.hgeo", "utf8"));
await page.$eval("#apply", (e) => e.click()); await waitIdle();

// ---- ETAPAS: el FANTASMA de la carga sigue al ratón (sobrecarga y ancla), sin colocar nada ----
start("etapas");
await page.$eval('.tb[data-tool="sobrecarga"]', (e) => e.click()); await wait(200); await frames(2, 150);
await glide(30, -3, 3); await glide(44, -3, 4); await glide(52, -3, 4); await frames(2, 200);   // banda de sobrecarga fantasma
await page.$eval('.tb[data-tool="ancla"]', (e) => e.click()); await wait(200); await frames(2, 150);
await glide(30, -8, 3); await glide(36, -6, 4); await frames(3, 200);                            // tirante del ancla fantasma
await page.$eval('.tb[data-tool="ver"]', (e) => e.click()); await wait(200);

// ---- RESULTADOS: pestañas de etapa (clic 1/2/3) + campos ----
start("resultados");
const clicTab = async (i) => { const n = await page.$$eval("#etabs button", (l) => l.length); const j = Math.min(i, n - 1); const r = await page.$$eval("#etabs button", (l, j) => { const b = l[j].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, j); await showCursor(r.x, r.y); await flash(); await page.$$eval("#etabs button", (l, j) => l[j].click(), j); await waitIdle(); await frame(); await unflash(); };
await clicTab(0); await frames(2, 250);
await clicTab(1); await frames(3, 250);                          // +sobrecarga
await page.$eval("#field", (e, v) => { e.value = v; e.dispatchEvent(new Event("change")); }, "sz"); await wait(400); await frames(3, 300);
await clicTab(2); await frames(3, 250);                          // +ancla
await page.$eval("#field", (e, v) => { e.value = v; e.dispatchEvent(new Event("change")); }, "Edpl"); await wait(400); await frames(4, 350);
await clicTab(0); await page.$eval("#field", (e, v) => { e.value = v; e.dispatchEvent(new Event("change")); }, "dx"); await wait(300); await frames(2, 250);

console.log("FS:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
console.log("etapas:", beats.etapas, "resultados:", beats.resultados);
await browser.close(); writeFileSync(`${SCHOOL}/frames_geo_beats.json`, JSON.stringify(beats));
