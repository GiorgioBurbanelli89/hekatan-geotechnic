// Igual que frames_dibujo4.mjs pero contra el SITIO PUBLICO y con frames en tests/shots/deploy_dib4/paso_<beat>/ (para el GIF paso a paso).
//   node tests/frames_dibujo4_deploy.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = process.argv[2] || "https://giorgioburbanelli89.github.io/hekatan-geotechnic/?tema=oscuro";
const SCHOOL = "tests/shots/deploy_dib4";
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const waitTotal = async () => page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
const waitIdle = async () => { await wait(350); try { await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 120000 }); } catch {} await wait(150); };
await page.goto(url, { waitUntil: "networkidle0" }); await waitTotal();
await page.evaluate(() => {
  const css = document.createElement("style");
  css.textContent = `#log,footer,#hover,#dstatus{display:none!important} main{grid-template-columns:480px 1fr!important;padding:8px 14px!important;gap:10px!important}
    textarea#hgeo{font-size:13.5px!important;line-height:1.3!important;height:330px!important}
    #edmsg{font-size:12px!important} .fs table{font-size:13px!important}
    #cmd{font-size:17px!important} #cmdhist{min-height:5.4em!important;max-height:5.4em!important} #cmdin{font-size:17px!important}
    #dstatus{font-size:13px!important}`;
  document.head.appendChild(css); window.scrollTo(0, 0);
  // flecha de ratón visible en las capturas (el puntero real no sale en el screenshot)
  const cur = document.createElement("div"); cur.id = "__cur"; cur.style.cssText = "position:fixed;left:-100px;top:-100px;width:30px;height:38px;z-index:99999;pointer-events:none;filter:drop-shadow(0 0 3px #000)";
  cur.innerHTML = '<svg viewBox="0 0 24 32" width="30" height="38"><path d="M2 2 L2 24 L8 18 L13 29 L17 27 L12 17 L20 17 Z" fill="#fff" stroke="#000" stroke-width="1.6"/></svg>';
  document.body.appendChild(cur);
  const ring = document.createElement("div"); ring.id = "__ring"; ring.style.cssText = "position:fixed;left:-100px;top:-100px;width:34px;height:34px;border:3px solid #ffb300;border-radius:50%;z-index:99998;pointer-events:none;transform:translate(-50%,-50%);display:none";
  document.body.appendChild(ring);
  // modo del panel izquierdo: "dibujo" (editor + FS) o "sliders" (parámetros del talud dibujado + FS)
  const modo = document.createElement("style"); modo.id = "__modo"; document.head.appendChild(modo);
  window.__modo = (m) => { modo.textContent = m === "sliders"
    ? "aside.panel>*:not(#gsliders):not(#sliders):not(#fs):not(h2){display:none!important} #sliders .sl:nth-child(n+6){display:none!important} .sl{font-size:13px!important}"
    : "aside.panel>*:not(#editor):not(#fs):not(#pasos):not(h2:first-child){display:none!important}"; };
  window.__modo("dibujo");
});
const showCursor = (px, py) => page.evaluate((x, y) => { const c = document.getElementById("__cur"); c.style.left = x + "px"; c.style.top = y + "px"; }, px, py);
const flash = async () => { await page.evaluate(() => { const c = document.getElementById("__cur"), r = document.getElementById("__ring"); r.style.left = c.style.left; r.style.top = c.style.top; r.style.display = "block"; }); };
const unflash = () => page.evaluate(() => { document.getElementById("__ring").style.display = "none"; });
const clip = await page.evaluate(() => { const r = document.querySelector("main").getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(Math.min(r.height, r.width * 9 / 16)) }; });
console.log("clip:", clip);
const beats = {}; let cur = null, k = 0;
const start = (name) => { cur = name; k = 0; rmSync(`${SCHOOL}/paso_${name}`, { recursive: true, force: true }); mkdirSync(`${SCHOOL}/paso_${name}`, { recursive: true }); beats[name] = 0; };
const frame = async () => {   // la captura puede expirar mientras la página malla/calcula: un reintento
  const path = `${SCHOOL}/paso_${cur}/f${String(k).padStart(3, "0")}.png`;
  try { await page.screenshot({ path, clip, timeout: 60000 }); } catch (e) { console.warn("captura reintentada:", String(e).slice(0, 80)); await wait(800); await page.screenshot({ path, clip, timeout: 60000 }); }
  k++; beats[cur] = k;
};
const frames = async (n, ms = 120) => { for (let i = 0; i < n; i++) { await frame(); await wait(ms); } };
// escribir en la línea de órdenes "a mano" y pulsar Enter
const cmd = async (text, { chunk = 4, settle = true } = {}) => {
  await page.focus("#cmdin"); await moveToEl("#cmdin", 0.02);
  for (let i = chunk; i < text.length + chunk; i += chunk) { await page.$eval("#cmdin", (e, v) => { e.value = v; }, text.slice(0, i)); await frame(); }
  await page.keyboard.press("Enter"); if (settle) await waitIdle(); await frame();
};
const enter = async () => { await page.focus("#cmdin"); await page.keyboard.press("Enter"); await waitIdle(); await frames(2, 150); };
const worldPx = (x, z) => page.evaluate((x, z) => { const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height }; }, x, z);
const moveTo = async (x, z, n = 6) => { const { px, py } = await worldPx(x, z); await page.mouse.move(px, py, { steps: n }); await showCursor(px, py); await wait(80); };
// mover la flecha a un elemento (botón / slider) y opcionalmente al valor v de un slider
const moveToEl = async (sel, frac = 0.5) => { const r = await page.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; }); const px = r.l + r.w * frac, py = r.t + r.h / 2; await page.mouse.move(px, py, { steps: 4 }); await showCursor(px, py); await wait(60); return { px, py }; };
const glide = async (x, z, n = 4) => { for (let i = 1; i <= n; i++) { await moveTo(x, z, 3); await frame(); } };
const click = async () => { await flash(); await page.mouse.down(); await page.mouse.up(); await wait(150); await frame(); await unflash(); };
// arrastrar un slider con la flecha visible: fotograma por valor
const slide = async (id, values) => {
  const r = await page.$eval("#" + id, (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height, min: +e.min, max: +e.max }; });
  for (const v of values) {
    const px = r.l + 8 + (r.w - 16) * (v - r.min) / (r.max - r.min), py = r.t + r.h / 2;
    await page.mouse.move(px, py, { steps: 3 }); await showCursor(px, py); await flash();
    await page.$eval("#" + id, (e, v) => { e.value = String(v); e.dispatchEvent(new Event("input", { bubbles: true })); }, v);
    await wait(450); await waitIdle(); await frame();
  }
  await unflash(); await page.$eval("#" + id, (e) => e.dispatchEvent(new Event("change", { bubbles: true })));
};
const hist = async () => console.log("   ", (await page.$eval("#cmdhist", (e) => e.innerText)).replace(/\n/g, " | "));

// 1) hoja nueva y márgenes (órdenes escritas)
start("nuevo");
await frames(2, 200);
await cmd("nuevo"); await frames(2, 200);
await cmd("margenes xmin=0 xmax=60 fondo=-26"); await frames(3, 200); await hist();
// 2) el terreno con el RATÓN: talud con banqueta, clics con snap (rejilla y margen)
start("terreno");
await cmd("interfaz", { settle: false }); await frames(2, 150);
await moveTo(5, -6, 2); await frames(2, 80);
for (const [x, z] of [[0, -14], [16, -14], [24, -9], [32, -9], [40, -3], [60, -3]]) { await glide(x, z, 4); await click(); }
await enter(); await hist();
// 3) el primer suelo → malla y FS
start("suelo");
await cmd("suelo LIMO_ARENOSO E=20000 nu=0.30 phi=26 c=10 gamma=17.5"); await frames(4, 250); await hist();
// 4) tres capas más por COORDENADAS ESCRITAS (absolutas, relativas y polar) y sus tres suelos
start("capas");
await cmd("interfaz", { settle: false }); await cmd("0,-17", { settle: false }); await cmd("30,-16.5", { settle: false }); await cmd("60,-15", { settle: false }); await enter();
await cmd("interfaz", { settle: false }); await cmd("0,-20", { settle: false }); await cmd("@60,0.5", { settle: false }); await enter();
await cmd("interfaz", { settle: false }); await cmd("0,-23.5", { settle: false }); await cmd("@60<0", { settle: false }); await enter();
await cmd("suelo ARCILLA_BLANDA E=6000 nu=0.40 phi=15 c=18 gamma=16");
await cmd("suelo ARENA_DENSA E=45000 nu=0.30 phi=34 c=2 gamma=19");
await cmd("suelo GRAVA E=90000 nu=0.25 phi=40 c=1 gamma=21"); await frames(3, 250); await hist();
// 5) asignar los cuatro suelos: suelo activo + punto escrito
start("asignar");
await cmd("asignar", { settle: false });
await cmd("suelo arcilla_blanda", { settle: false }); await cmd("30,-18");
await cmd("suelo arena_densa", { settle: false }); await cmd("30,-21.5");
await cmd("suelo grava", { settle: false }); await cmd("30,-25"); await frames(3, 250); await hist();
// 6) malla más fina
start("malla");
await cmd("malla 2.0"); await frames(3, 250);
// 7) etapas: sobrecarga con dos puntos escritos, ancla con un clic del ratón
start("etapas");
await cmd("etapa +sobrecarga"); await cmd("etapa 2", { settle: false }); await cmd("q=40", { settle: false });
await cmd("sobrecarga", { settle: false }); await cmd("44,-3", { settle: false }); await cmd("56,-3"); await frames(2, 250);
await cmd("etapa +ancla"); await cmd("etapa 3", { settle: false }); await cmd("F=200", { settle: false }); await cmd("ang=-15", { settle: false });
await cmd("ancla", { settle: false }); await glide(36, -6, 5); await click(); await waitIdle(); await frames(3, 250); await hist();
// 8) el talud DIBUJADO también tiene parámetros: sliders por vértice del terreno y por capa, y de cada suelo
start("sliders");
await cmd("ver", { settle: false }); await page.evaluate(() => window.__modo("sliders")); await page.select("#stage", "0"); await wait(500); await frames(2, 200);
const v0 = async (id) => parseFloat(await page.$eval("#" + id, (e) => e.value));
const z3 = await v0("gs_z3"), c1 = await v0("gs_dz1"), f0 = await v0("sl_phi0");   // valores dibujados, para volver a ellos
await slide("gs_z3", [-8.5, -8, -7, -6, -5]);          // P4 (32,-9): la banqueta sube → talud más alto y empinado
await slide("gs_z3", [-6, -7, -8, z3]);                // y vuelve
await slide("gs_dz1", [c1 - 0.5, c1 - 1, c1 - 1.5, c1 - 2]);   // la arcilla blanda baja 2 m (su punto de asignación la acompaña)
await slide("sl_phi0", [24, 22, 20]);                  // fricción del limo
await frames(2, 250);
console.log("   sliders:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
// vuelta a los valores dibujados (con φ=20 y el ancla de 200 kN la etapa 3 falla: se ve el aviso, y luego se restaura)
await slide("sl_phi0", [f0]); await slide("gs_dz1", [c1]); await frames(2, 250);
// 9) resultado: las tres etapas
start("resultado");
await page.evaluate(() => window.__modo("dibujo"));
for (const s of ["0", "1", "2"]) { await page.select("#stage", s); await wait(500); await waitIdle(); await frames(4, 250); }
console.log((await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
console.log("--- .hgeo escrito por el dibujo ---\n" + (await page.$eval("#hgeo", (e) => e.value)));
await browser.close();
console.log(beats);
writeFileSync(`${SCHOOL}/paso_beats.json`, JSON.stringify(beats));
