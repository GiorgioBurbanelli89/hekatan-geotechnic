// Fotogramas del LIENZO (solo la gráfica, a pantalla completa) para el kit de Hekatan School:
// carpetas hekatan-school/frames_geo_<beat>/f000.png… y el guion hekatan-school/geotechnic.hs con los `n`.
// Luego:  cd hekatan-school && python hsc.py geotechnic.hs GEOTECHNIC.mp4
//   node tests/frames_school.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = process.argv[2] || "http://localhost:4700/";
const SCHOOL = "C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-school";
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const waitTotal = async () => page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.goto(url, { waitUntil: "networkidle0" }); await waitTotal();
await page.evaluate(() => { const css = document.createElement("style"); css.textContent = "#log,footer{display:none!important}"; document.head.appendChild(css); window.scrollTo(0, 0); });
const clip = await page.evaluate(() => { const r = document.querySelector(".stack").getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }; });
console.log("clip:", clip);
const beats = {}; let cur = null, k = 0;
const start = (name) => { cur = name; k = 0; rmSync(`${SCHOOL}/frames_geo_${name}`, { recursive: true, force: true }); mkdirSync(`${SCHOOL}/frames_geo_${name}`, { recursive: true }); beats[name] = 0; };
const frame = async () => { await page.screenshot({ path: `${SCHOOL}/frames_geo_${cur}/f${String(k).padStart(3, "0")}.png`, clip }); k++; beats[cur] = k; };
const frames = async (n, ms = 120) => { for (let i = 0; i < n; i++) { await frame(); await wait(ms); } };
const setSlider = async (id, v) => { await page.$eval("#" + id, (e, v) => { e.value = String(v); e.dispatchEvent(new Event("input", { bubbles: true })); }, v); await wait(400); await waitTotal(); await wait(150); };
const worldPx = (x, z) => page.evaluate((x, z) => { const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height }; }, x, z);
const moveTo = async (x, z, n = 6) => { const { px, py } = await worldPx(x, z); await page.mouse.move(px, py, { steps: n }); await wait(80); };
const glide = async (x, z, n = 5) => { for (let i = 1; i <= n; i++) { await moveTo(x, z, 3); await frame(); } };   // cursor deslizándose con fotogramas
const click = async () => { await page.mouse.down(); await page.mouse.up(); await wait(150); await frame(); };

// 1) la referencia: Demo04 con la malla exacta de GEO5, 3 etapas
start("intro"); await frames(4, 200);
for (const s of ["1", "2"]) { await page.select("#stage", s); await wait(400); await frames(3, 200); }
// 2) editor paramétrico
await page.select("#model", "hgeo"); await wait(300); await waitTotal(); await wait(300);
start("param"); await frames(3, 150);
for (const v of [7, 7.5, 8, 8.5, 9, 9.5]) { await setSlider("gs_H", v); await frame(); }
start("beta"); for (const v of [36, 40, 44, 48, 44, 40, 38, 36]) { await setSlider("gs_beta", v); await frame(); }   // con H=9.5 y β<36 la corona+bajada se salen del margen (40 m)
start("corona"); for (const v of [8, 7.5, 7]) { await setSlider("gs_corona", v); await frame(); }
// 3) dibujo con snaps
await page.click('.tb[data-tool="interfaz"]'); await wait(200);
start("dibujo");
await moveTo(6, -18, 2); await frames(2, 60);
await glide(0, -15, 6); await click();
await glide(16, -14, 8); await click();
await glide(30, -12, 8); await click();
await glide(40, -11.5, 6); await click();
await page.keyboard.press("Enter"); await wait(300); await waitTotal(); await wait(200); await frames(4, 200);
start("asignar"); await page.click('.tb[data-tool="asignar"]'); await page.select("#dsoil", "SOIL_2"); await wait(150);
await glide(20, -18, 8); await click(); await wait(200); await waitTotal(); await wait(200); await frames(4, 200);
start("sobrecarga"); await page.click('.tb[data-tool="sobrecarga"]'); await page.select("#dstage", "1"); await wait(150);
const yc = await page.evaluate(() => { const t = document.getElementById("hgeo").value.match(/talud[^\n]*/)?.[0] || ""; return parseFloat(/zpie=(-?[\d.]+)/.exec(t)?.[1] || "-9") + parseFloat(/H=([\d.]+)/.exec(t)?.[1] || "6.5"); });
await glide(25, yc, 6); await click(); await glide(30, yc, 6); await click();   // sobre la corona (24.1 → 31.1 con β=36, corona 7)
await page.select("#stage", "1"); await wait(300); await waitTotal(); await wait(200); await frames(5, 200);
// 4) sliders de suelo y campos
await page.click('.tb[data-tool="ver"]'); await wait(200);
start("phi"); for (const v of [21, 19, 17, 15]) { await setSlider("sl_phi0", v); await frame(); }
start("dz"); await page.select("#field", "dz"); await wait(300); await frames(3, 200); await page.select("#field", "d"); await wait(300); await frames(3, 200);
await browser.close();
console.log(beats);
// ---- guion .hs (voz ≤ 224 palabras; cada escena reparte su locución entre los fotogramas) ----
const n = (b) => beats[b];
const hs = `titulo  Hekatan Geotechnic
tema    oscuro

escena
  voz  Hekatan Geotechnic: elementos finitos geotécnicos corriendo en el navegador.
  voz  Este es el talud de referencia de GEO5, con sus tres etapas, y el resultado coincide a doce cifras.
  sub  La referencia: GEO5, tres etapas
  centro  struct3d frames_geo_intro n ${n("intro")} fps 2

escena
  voz  El talud se define como en GEO5: márgenes, interfaces y un suelo por región.
  voz  Con un slider cambias la altura, y el factor de seguridad se recalcula solo.
  sub  Altura del talud con un slider
  centro  struct3d frames_geo_param n ${n("param")} fps 3

escena
  voz  Ahora el ángulo. Más empinado, menos seguro. Cada movimiento remalla y resuelve.
  sub  Ángulo del talud
  centro  struct3d frames_geo_beta n ${n("beta")} fps 3

escena
  voz  El ancho de la corona, igual.
  sub  Ancho de corona
  centro  struct3d frames_geo_corona n ${n("corona")} fps 2

escena
  voz  Y también se dibuja con el ratón, con snaps como AutoCAD: extremo, punto medio e intersección.
  voz  Enter cierra la polilínea de borde a borde y el modelo se remalla solo.
  sub  Dibujar una interfaz
  centro  struct3d frames_geo_dibujo n ${n("dibujo")} fps 6

escena
  voz  Un clic dentro de la región asigna el suelo. Dibujo y texto son lo mismo.
  sub  Asignar el suelo
  centro  struct3d frames_geo_asignar n ${n("asignar")} fps 6

escena
  voz  Dos clics sobre la corona ponen la sobrecarga de la etapa dos, y la etapa se recalcula al momento.
  sub  Sobrecarga en la etapa dos
  centro  struct3d frames_geo_sobrecarga n ${n("sobrecarga")} fps 6

escena
  voz  Los parámetros del suelo también van con sliders: baja la fricción y cae el factor de seguridad.
  sub  Fricción del suelo
  centro  struct3d frames_geo_phi n ${n("phi")} fps 2

escena
  voz  Los asientos y la resultante, con la escala y la paleta de GEO5.
  voz  Nos vemos en Hekatan Engineers.
  sub  Asientos y resultante
  centro  struct3d frames_geo_dz n ${n("dz")} fps 2
`;
writeFileSync(`${SCHOOL}/geotechnic.hs`, hs, "utf-8");
const words = hs.split("\n").filter((l) => l.trim().startsWith("voz ")).reduce((a, l) => a + l.trim().split(/\s+/).length - 1, 0);
console.log(`geotechnic.hs escrito: ${words} palabras → ${(words / 2.54).toFixed(0)} s de voz`);
