// Fotogramas del VÍDEO TUTORIAL de Hekatan Geotechnic (sitio público): un talud desde cero por PASOS (formularios + clics)
// y, sobre un modelo hecho, sliders de geometría/suelo y edición de un suelo. Salida: hekatan-school/frames_geo_<escena>/fNNN.png
//   node tests/frames_tutorial.mjs [url]
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
    #pasos{font-size:13.5px!important} #pasos .pl li{padding:2px 8px!important} #pasos .pf input,#pasos .pf select{font-size:13px!important} #pasos .pq{font-size:13px!important}
    #editor{display:none!important} .fs table{font-size:13px!important} #cmd{font-size:15px!important} #cmdhist{min-height:3.6em!important;max-height:3.6em!important}`;
  document.head.appendChild(css); window.scrollTo(0, 0);
  const cur = document.createElement("div"); cur.id = "__cur"; cur.style.cssText = "position:fixed;left:-100px;top:-100px;width:30px;height:38px;z-index:99999;pointer-events:none;filter:drop-shadow(0 0 3px #000)";
  cur.innerHTML = '<svg viewBox="0 0 24 32" width="30" height="38"><path d="M2 2 L2 24 L8 18 L13 29 L17 27 L12 17 L20 17 Z" fill="#fff" stroke="#000" stroke-width="1.6"/></svg>';
  document.body.appendChild(cur);
  const ring = document.createElement("div"); ring.id = "__ring"; ring.style.cssText = "position:fixed;left:-100px;top:-100px;width:34px;height:34px;border:3px solid #ffb300;border-radius:50%;z-index:99998;pointer-events:none;transform:translate(-50%,-50%);display:none";
  document.body.appendChild(ring);
  const modo = document.createElement("style"); modo.id = "__modo"; document.head.appendChild(modo);
  window.__modo = (m) => { modo.textContent = m === "sliders"
    ? "aside.panel>*:not(#gsliders):not(#sliders):not(#fs):not(h2){display:none!important} #sliders .sl:nth-child(n+7){display:none!important} .sl{font-size:13px!important}"
    : m === "pasos" ? "aside.panel>*:not(#pasos):not(#fs):not(#archivo){display:none!important} #archivo{margin-bottom:8px!important}" : "aside.panel>*:not(#pasos):not(#fs):not(#gsliders){display:none!important}"; };
  window.__modo("pasos");
});
const showCursor = (px, py) => page.evaluate((x, y) => { const c = document.getElementById("__cur"); c.style.left = x + "px"; c.style.top = y + "px"; }, px, py);
const flash = () => page.evaluate(() => { const c = document.getElementById("__cur"), r = document.getElementById("__ring"); r.style.left = c.style.left; r.style.top = c.style.top; r.style.display = "block"; });
const unflash = () => page.evaluate(() => { document.getElementById("__ring").style.display = "none"; });
const clip = await page.evaluate(() => { const r = document.querySelector("main").getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(Math.min(r.height, r.width * 9 / 16)) }; });
console.log("clip:", clip);
const beats = {}; let cur = null, k = 0;
const start = (name) => { cur = name; k = 0; rmSync(`${SCHOOL}/frames_geo_${name}`, { recursive: true, force: true }); mkdirSync(`${SCHOOL}/frames_geo_${name}`, { recursive: true }); beats[name] = 0; };
const frame = async () => { const path = `${SCHOOL}/frames_geo_${cur}/f${String(k).padStart(3, "0")}.png`; try { await page.screenshot({ path, clip, timeout: 60000 }); } catch { await wait(800); await page.screenshot({ path, clip, timeout: 60000 }); } k++; beats[cur] = k; };
const frames = async (n, ms = 120) => { for (let i = 0; i < n; i++) { await frame(); await wait(ms); } };
const worldPx = (x, z) => page.evaluate((x, z) => { const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height }; }, x, z);
const moveTo = async (x, z, n = 6) => { const { px, py } = await worldPx(x, z); await page.mouse.move(px, py, { steps: n }); await showCursor(px, py); await wait(80); };
const moveToEl = async (sel, frac = 0.5) => { const r = await page.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; }); const px = r.l + r.w * frac, py = r.t + r.h / 2; await page.mouse.move(px, py, { steps: 4 }); await showCursor(px, py); await wait(60); return { px, py }; };
const clickEl = async (sel) => { await moveToEl(sel); await flash(); await page.click(sel); await wait(200); await frame(); await unflash(); };
const glide = async (x, z, n = 4) => { for (let i = 1; i <= n; i++) { await moveTo(x, z, 3); await frame(); } };
const click = async () => { await flash(); await page.mouse.down(); await page.mouse.up(); await wait(150); await frame(); await unflash(); };
const typeIn = async (sel, text, chunk = 3) => { await moveToEl(sel, 0.1); await page.click(sel, { clickCount: 3 }); for (let i = chunk; i < text.length + chunk; i += chunk) { await page.$eval(sel, (e, v) => { e.value = v; }, text.slice(0, i)); await frame(); } await page.$eval(sel, (e) => e.dispatchEvent(new Event("change", { bubbles: true }))); };
const slide = async (id, values) => {
  const r = await page.$eval("#" + id, (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height, min: +e.min, max: +e.max }; });
  for (const v of values) { const px = r.l + 8 + (r.w - 16) * (v - r.min) / (r.max - r.min), py = r.t + r.h / 2; await page.mouse.move(px, py, { steps: 3 }); await showCursor(px, py); await flash(); await page.$eval("#" + id, (e, v) => { e.value = String(v); e.dispatchEvent(new Event("input", { bubbles: true })); }, v); await wait(120); await frame(); await frame(); }
  await unflash(); await page.$eval("#" + id, (e) => e.dispatchEvent(new Event("change", { bubbles: true }))); await waitIdle(); await frames(3, 200);
};

// ---- 1) Nuevo: salen los PASOS; el rango por formulario ----
start("nuevo"); await frames(2, 200);
await clickEl("#fNuevo"); await frames(4, 250);
await page.click("#pasos .pr summary").catch(() => {}); await wait(200);
await typeIn("#pm_xmax", "60"); await typeIn("#pm_fondo", "-26"); await clickEl("#pm_ok"); await waitIdle(); await frames(3, 250);
// ---- 2) Terreno con clics ----
start("terreno"); await clickEl('#pasos .pt[data-tool="interfaz"]'); await frames(2, 150);
for (const [x, z] of [[0, -14], [16, -14], [24, -9], [32, -9], [40, -3], [60, -3]]) { await glide(x, z, 4); await click(); }
await page.keyboard.press("Enter"); await waitIdle(); await frames(4, 250);
// ---- 3) Primer suelo por FORMULARIO ----
start("suelo");
await typeIn("#ps_name", "LIMO_ARENOSO"); await typeIn("#ps_E", "20000"); await typeIn("#ps_nu", "0.30"); await typeIn("#ps_phi", "26"); await typeIn("#ps_c", "10"); await typeIn("#ps_g", "17.5");
await clickEl("#ps_add"); await waitIdle(); await frames(5, 300);
// ---- 4) Capa + segundo suelo + asignar con clic ----
start("capa");
await page.click('#pasos .pl li[data-p="terreno"]'); await wait(200); await clickEl('#pasos .pt[data-tool="interfaz"]');
for (const [x, z] of [[0, -17], [30, -16.5], [60, -15]]) { await glide(x, z, 4); await click(); }
await page.keyboard.press("Enter"); await waitIdle(); await frames(3, 250);
await page.click('#pasos .pl li[data-p="suelos"]'); await wait(200); await frame();
await typeIn("#ps_name", "ARCILLA_BLANDA"); await typeIn("#ps_E", "6000"); await typeIn("#ps_nu", "0.40"); await typeIn("#ps_phi", "15"); await typeIn("#ps_c", "18"); await typeIn("#ps_g", "16");
await clickEl("#ps_add"); await waitIdle(); await frames(4, 300);
// ---- 5) Malla + etapa con sobrecarga y ancla ----
start("etapas");
await page.click('#pasos .pl li[data-p="malla"]'); await wait(200); await typeIn("#pml_h", "2"); await clickEl("#pml_ok"); await waitIdle(); await frames(3, 250);
await page.click('#pasos .pl li[data-p="etapas"]'); await wait(200); await clickEl("#pe_add"); await waitIdle(); await typeIn("#pe_q", "40");
await clickEl('#pasos .pt[data-tool="sobrecarga"]'); await glide(44, -3, 4); await click(); await glide(56, -3, 4); await click(); await waitIdle(); await frames(3, 250);
await clickEl("#pe_add"); await waitIdle(); await typeIn("#pe_F", "200"); await typeIn("#pe_ang", "-15");
await clickEl('#pasos .pt[data-tool="ancla"]'); await glide(36, -6, 5); await click(); await waitIdle(); await frames(4, 300);
// ---- 6) Resultados: los campos de GEO5 ----
start("resultados");
for (const [st, f] of [["2", "dx"], ["2", "sz"], ["2", "Edpl"], ["1", "Edpl"]]) { await page.select("#stage", st); await waitIdle(); await page.select("#field", f); await wait(400); await frames(4, 300); }
// ---- 7) Modelo HECHO: sliders de geometría (en vivo) y de suelo; editar un suelo en el formulario ----
start("sliders"); await page.evaluate(() => window.__modo("sliders")); await page.select("#stage", "0"); await waitIdle(); await frames(2, 200);
await slide("gs_beta0", [36, 40, 45, 50]); await slide("gs_H0", [6, 7, 8]); await slide("gs_H0", [7, 6, 5]); await slide("gs_beta0", [45, 40, 32]);
await slide("sl_phi0", [24, 22, 20, 18]); await slide("sl_phi0", [22, 26]); await frames(3, 250);
start("editar"); await page.evaluate(() => window.__modo("pasos")); await page.click("#gAyuda"); await wait(300); await page.click('#pasos .pl li[data-p="suelos"]'); await wait(300); await frame();
await page.click('#pasos .pli li[data-soil="ARCILLA_BLANDA"]'); await wait(300); await frame();
await typeIn("#ps_c", "30"); await typeIn("#ps_phi", "20"); await clickEl("#ps_add"); await waitIdle(); await frames(5, 300);
console.log((await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
await browser.close(); console.log(beats); writeFileSync(`${SCHOOL}/frames_geo_beats.json`, JSON.stringify(beats));
