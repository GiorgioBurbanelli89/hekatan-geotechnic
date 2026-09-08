// Fotogramas del VÍDEO "ahora también método analítico": GeoFEM (elementos finitos) vs Analítico (Bishop/Fellenius, dovelas),
// sobre talud_4suelos. Salida: hekatan-school/frames_an_<escena>/fNNN.png   ·   node tests/frames_analitico.mjs [url]
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
  css.textContent = `#log,footer,#hover,#dstatus{display:none!important} main{grid-template-columns:430px 1fr!important;padding:8px 14px!important;gap:10px!important}
    #editor{display:none!important} .fs table{font-size:13px!important} #cmd{font-size:15px!important} #cmdhist{min-height:3.6em!important;max-height:3.6em!important} #etabs button{font-size:13px!important} #metodo{font-size:14px!important} #lemout{font-size:13px!important}`;
  document.head.appendChild(css); window.scrollTo(0, 0);
  const cur = document.createElement("div"); cur.id = "__cur"; cur.style.cssText = "position:fixed;left:-100px;top:-100px;width:30px;height:38px;z-index:99999;pointer-events:none;filter:drop-shadow(0 0 3px #000)";
  cur.innerHTML = '<svg viewBox="0 0 24 32" width="30" height="38"><path d="M2 2 L2 24 L8 18 L13 29 L17 27 L12 17 L20 17 Z" fill="#fff" stroke="#000" stroke-width="1.6"/></svg>';
  document.body.appendChild(cur);
  const modo = document.createElement("style"); modo.id = "__modo"; document.head.appendChild(modo);
  window.__modo = (m) => { modo.textContent = "aside.panel>*:not(#pasos):not(#fs):not(#metodo):not(#lemout):not(h2):not(label){}"; };
});
const showCursor = (px, py) => page.evaluate((x, y) => { const c = document.getElementById("__cur"); c.style.left = x + "px"; c.style.top = y + "px"; }, px, py);
const clip = await page.evaluate(() => { const r = document.querySelector("main").getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(Math.min(r.height, r.width * 9 / 16)) }; });
const beats = {}; let cur = null, k = 0;
const start = (name) => { cur = name; k = 0; rmSync(`${SCHOOL}/frames_an_${name}`, { recursive: true, force: true }); mkdirSync(`${SCHOOL}/frames_an_${name}`, { recursive: true }); beats[name] = 0; };
const frame = async () => { const path = `${SCHOOL}/frames_an_${cur}/f${String(k).padStart(3, "0")}.png`; try { await page.screenshot({ path, clip, timeout: 60000 }); } catch { await wait(800); await page.screenshot({ path, clip, timeout: 60000 }); } k++; beats[cur] = k; };
const frames = async (n, ms = 120) => { for (let i = 0; i < n; i++) { await frame(); await wait(ms); } };
const moveToEl = async (sel, frac = 0.5) => { const r = await page.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; }); await page.mouse.move(r.l + r.w * frac, r.t + r.h / 2, { steps: 4 }); await showCursor(r.l + r.w * frac, r.t + r.h / 2); await wait(60); };
const setMet = async (v) => { await moveToEl("#metodo"); await page.$eval("#metodo", (e, v) => { e.value = v; e.dispatchEvent(new Event("change")); }, v); };
const lemReady = async () => { await page.waitForFunction(() => window.__lem && window.__lem() !== null, { timeout: 40000 }).catch(() => {}); await waitIdle(); };

await page.select("#model", "hgeo"); await wait(300);
await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync("examples/talud_4suelos.hgeo", "utf8"));
await page.$eval("#apply", (e) => e.click()); await waitIdle();

// 1) GeoFEM: elementos finitos, mapa de colores, FS por etapa
start("fem"); await frames(2, 200);
await page.$eval("#field", (e) => { e.value = "dx"; e.dispatchEvent(new Event("change")); }); await wait(300); await frames(4, 300);

// 2) Analítico Bishop: círculo de falla + dovelas
start("bishop"); await setMet("bishop"); await lemReady(); await frames(6, 350);

// 3) Analítico Fellenius
start("fellenius"); await setMet("fellenius"); await lemReady(); await frames(5, 350);

// 4) Volver a GeoFEM (comparación)
start("compara"); await setMet("fem"); await waitIdle(); await frames(5, 350);

console.log("FS:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
await browser.close(); console.log(beats); writeFileSync(`${SCHOOL}/frames_an_beats.json`, JSON.stringify(beats));
