// FOTOGRAMAS del vídeo del MURO (cuerpo rígido) y de los dos taludes paramétricos.
//   node tests/frames_muro_video.mjs [url]
// Sigue GUIA_VIDEO.md de hekatan-school: app en TEMA OSCURO, VENTANA ENTERA (<main>) en 16:9,
// deviceScaleFactor 2 y lienzo grande (k=3), cursor y anillo de clic dibujados encima.
// Escenas: rigido (cómo se AÑADE el cuerpo rígido, 2 clics) · murosl (sus sliders) · verif (la tabla
// de verificación) · solido (los sólidos H8) · t1 (talud de 1 inclinación) · t2 (2 inclinaciones).
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/?tema=oscuro") + "&v=" + Date.now();
const SCHOOL = "C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-school";
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const waitTotal = () => page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 180000 });
const waitIdle = async () => { await wait(350); try { await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 180000 }); } catch {} await wait(150); };
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto(url, { waitUntil: "networkidle0" }); await waitTotal();
await page.evaluate(() => {
  const css = document.createElement("style");
  css.textContent = `#log,footer,#hover,#dstatus,#pasos{display:none!important}
    main{grid-template-columns:430px 1fr!important;padding:8px 14px!important;gap:10px!important}
    #editor{display:none!important} .fs table{font-size:13px!important} #cmd{font-size:15px!important}
    #cmdhist{min-height:3.6em!important;max-height:3.6em!important} #etabs button{font-size:13px!important}
    #wout table{font-size:12px!important}`;
  document.head.appendChild(css); window.scrollTo(0, 0);
  const cur = document.createElement("div"); cur.id = "__cur";
  cur.style.cssText = "position:fixed;left:-100px;top:-100px;width:30px;height:38px;z-index:99999;pointer-events:none;filter:drop-shadow(0 0 3px #000)";
  cur.innerHTML = '<svg viewBox="0 0 24 32" width="30" height="38"><path d="M2 2 L2 24 L8 18 L13 29 L17 27 L12 17 L20 17 Z" fill="#fff" stroke="#000" stroke-width="1.6"/></svg>';
  document.body.appendChild(cur);
  const ring = document.createElement("div"); ring.id = "__ring";
  ring.style.cssText = "position:fixed;left:-100px;top:-100px;width:34px;height:34px;border:3px solid #ffb300;border-radius:50%;z-index:99998;pointer-events:none;transform:translate(-50%,-50%);display:none";
  document.body.appendChild(ring);
  // qué parte del panel se enseña en cada escena (el panel completo no cabe legible en 16:9)
  const modo = document.createElement("style"); modo.id = "__modo"; document.head.appendChild(modo);
  window.__modo = (m) => {
    modo.textContent = m === "sliders" ? "aside.panel>*:not(#gsliders):not(#fs):not(h2){display:none!important}"
      : m === "muro" ? "aside.panel>*:not(#murowrap):not(#fs){display:none!important}"
      : "";
  };
});
const showCursor = (px, py) => page.evaluate((x, y) => { const c = document.getElementById("__cur"); c.style.left = x + "px"; c.style.top = y + "px"; }, px, py);
const flash = () => page.evaluate(() => { const c = document.getElementById("__cur"), r = document.getElementById("__ring"); r.style.left = c.style.left; r.style.top = c.style.top; r.style.display = "block"; });
const unflash = () => page.evaluate(() => { document.getElementById("__ring").style.display = "none"; });
const clip = await page.evaluate(() => { const r = document.querySelector("main").getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(Math.min(r.height, (r.width * 9) / 16)) }; });
const BEATS = `${SCHOOL}/frames_muro_beats.json`;
const beats = existsSync(BEATS) ? JSON.parse(readFileSync(BEATS, "utf8")) : {};
let cur = null, k = 0;
const start = (name) => { cur = name; k = 0; rmSync(`${SCHOOL}/frames_mv_${name}`, { recursive: true, force: true }); mkdirSync(`${SCHOOL}/frames_mv_${name}`, { recursive: true }); beats[name] = 0; };
const frame = async () => { const path = `${SCHOOL}/frames_mv_${cur}/f${String(k).padStart(3, "0")}.png`; try { await page.screenshot({ path, clip, timeout: 60000 }); } catch { await wait(800); await page.screenshot({ path, clip, timeout: 60000 }); } k++; beats[cur] = k; };
const frames = async (n, ms = 120) => { for (let i = 0; i < n; i++) { await frame(); await wait(ms); } };
const worldPx = (x, z) => page.evaluate((x, z) => { const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + (px * r.width) / c.width, py: r.top + (py * r.height) / c.height }; }, x, z);
const moveTo = async (x, z, n = 6) => { const { px, py } = await worldPx(x, z); await page.mouse.move(px, py, { steps: n }); await showCursor(px, py); await wait(70); };
const glide = async (x, z, n = 4) => { for (let i = 0; i < n; i++) { await moveTo(x, z, 3); await frame(); } };
const clicMundo = async (x, z) => { const { px, py } = await worldPx(x, z); await page.mouse.move(px, py, { steps: 4 }); await showCursor(px, py); await flash(); await frame(); await page.mouse.click(px, py); await wait(250); await frame(); await unflash(); };
const clicSel = async (sel) => { const r = await page.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }); await showCursor(r.x, r.y); await flash(); await frame(); await page.$eval(sel, (e) => e.click()); await wait(250); await frame(); await unflash(); };
const cargar = async (f) => { await page.select("#model", "hgeo"); await wait(250); await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync(f, "utf8")); await page.$eval("#apply", (e) => e.click()); await waitIdle(); };
/** arrastra un slider del panel de N pasos, tomando un fotograma en cada uno */
const arrastrar = async (id, v0, v1, pasos = 6) => {
  for (let i = 0; i <= pasos; i++) {
    const v = v0 + ((v1 - v0) * i) / pasos;
    await page.$eval(`#${id}`, (e, val) => { e.value = String(val); e.dispatchEvent(new Event("input", { bubbles: true })); }, v);
    const r = await page.$eval(`#${id}`, (e) => { const b = e.getBoundingClientRect(), f = (e.value - e.min) / (e.max - e.min); return { x: b.left + b.width * f, y: b.top + b.height / 2 }; });
    await showCursor(r.x, r.y); await wait(90); await frame();
  }
  await page.$eval(`#${id}`, (e) => e.dispatchEvent(new Event("change", { bubbles: true }))); await waitIdle(); await frame();
};

// ════════ 1) CÓMO SE AÑADE UN CUERPO RÍGIDO: herramienta muro + dos clics ════════
await cargar("examples/talud_1_inclinacion.hgeo");
await page.evaluate(() => window.__modo(""));
start("rigido");
await frames(3, 200);
await clicSel('.tb[data-tool="muro"]');            // se elige la herramienta
await frames(2, 200);
await glide(12, -9, 3); await glide(12, -7.5, 3); await glide(12, -6.2, 4);   // el FANTASMA del muro sigue al cursor
await clicMundo(12, -9);                            // 1er clic: el pie de la cara vista, sobre el terreno
await frames(2, 200);
await glide(12, -7.5, 3); await glide(12, -6.4, 4);  // subiendo: H crece en vivo
await clicMundo(12, -6);                            // 2º clic: la coronación → H = 3 m
await waitIdle(); await frames(4, 260);
await clicSel('.tb[data-tool="ver"]'); await frames(2, 250);

// ════════ 2) LOS SLIDERS DEL MURO ════════
await page.evaluate(() => window.__modo("muro"));
start("murosl");
await frames(3, 220);
await page.evaluate(() => window.__modo("sliders"));
await arrastrar("gs_w0_H", 3, 5.5, 6);
await arrastrar("gs_w0_talon", 1.1, 2.4, 5);
await frames(2, 250);

// ════════ 3) LA VERIFICACIÓN (vuelco, deslizamiento, excentricidad, portante) ════════
await page.evaluate(() => window.__modo("muro"));
await page.$eval("#wRd", (e) => { e.value = "350"; e.dispatchEvent(new Event("change", { bubbles: true })); }); await wait(400);
start("verif");
await frames(5, 260);
await clicSel("#wPasivo"); await wait(400); await frames(3, 260);          // el empuje pasivo suma
await page.$eval("#wPasivo", (e) => { e.checked = false; e.dispatchEvent(new Event("change", { bubbles: true })); }); await wait(300);
await page.select("#wTeoria", "reposo"); await wait(450); await frames(3, 300);   // en reposo empuja más
await page.select("#wTeoria", "coulomb"); await wait(400); await frames(2, 250);

// ════════ 4) EL MISMO MURO EN SÓLIDOS H8 ════════
// se carga el ejemplo (muro BIEN dimensionado): el muro que dejaron los sliders tiene el fuste de un
// muro de 3 m con 5.5 m de alto y flexa 85 mm, y ese número sin explicar confunde en el vídeo.
await page.evaluate(() => window.__modo(""));
await cargar("examples/muro_cantilever.hgeo");
await page.evaluate(() => window.__modo("muro"));
await page.$eval("#wRd", (e) => { e.value = "350"; e.dispatchEvent(new Event("change", { bubbles: true })); }); await wait(400);
start("solido");
await frames(2, 250);
await clicSel("#wSolido");
await page.waitForFunction(() => /u_x|✖/.test(document.getElementById("wsolout").innerText), { timeout: 120000 });
await frames(6, 300);
console.log("sólidos:", (await page.$eval("#wsolout", (e) => e.innerText)).split("\n")[0]);

// ════════ 5) TALUD DE UNA INCLINACIÓN: el slider de β ════════
await page.evaluate(() => window.__modo(""));
await cargar("examples/talud_1_inclinacion.hgeo");
start("t1");
await frames(3, 250);
await page.evaluate(() => window.__modo("sliders"));
await arrastrar("gs_beta", 30, 52, 7);
await arrastrar("gs_H", 6, 8, 4);
await frames(2, 250);

// ════════ 6) TALUD DE DOS INCLINACIONES: una β por cada cara ════════
await page.evaluate(() => window.__modo(""));
await cargar("examples/talud_2_inclinaciones.hgeo");
start("t2");
await frames(3, 250);
await page.evaluate(() => window.__modo("sliders"));
const ids = await page.$$eval("#gsliders input", (l) => l.map((i) => i.id));
console.log("sliders del talud de 2 caras:", ids.join(" "));
if (ids.includes("gs_beta0")) await arrastrar("gs_beta0", 35.5, 55, 6);
if (ids.includes("gs_beta1")) await arrastrar("gs_beta1", 45, 62, 5);
await frames(3, 300);

console.log("beats:", JSON.stringify(beats));
console.log("errores JS:", errs);
writeFileSync(BEATS, JSON.stringify(beats, null, 1));
await browser.close(); process.exit(errs.length ? 1 : 0);
