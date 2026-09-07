// Vídeo "dibujar desde cero como AutoCAD": todo pasa por la LÍNEA DE ÓRDENES (prompt + eco) y el lienzo.
// Terreno con el ratón (snaps), capas con coordenadas escritas, suelos/malla/etapas como órdenes del .hgeo.
//   node tests/frames_dibujo.mjs [url]  → hekatan-school/frames_dib_<beat>/f000.png… + hekatan-school/dibujo.hs
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = process.argv[2] || "http://localhost:4700/?tema=oscuro";
const SCHOOL = "C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-school";
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
    aside.panel>*:not(#editor):not(#fs):not(h2:first-child){display:none!important}
    textarea#hgeo{font-size:13.5px!important;line-height:1.3!important;height:330px!important}
    #edmsg{font-size:12px!important} .fs table{font-size:13px!important}
    #cmd{font-size:17px!important} #cmdhist{min-height:5.4em!important;max-height:5.4em!important} #cmdin{font-size:17px!important}
    #dstatus{font-size:13px!important}`;
  document.head.appendChild(css); window.scrollTo(0, 0);
});
const clip = await page.evaluate(() => { const r = document.querySelector("main").getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(Math.min(r.height, r.width * 9 / 16)) }; });
console.log("clip:", clip);
const beats = {}; let cur = null, k = 0;
const start = (name) => { cur = name; k = 0; rmSync(`${SCHOOL}/frames_dib_${name}`, { recursive: true, force: true }); mkdirSync(`${SCHOOL}/frames_dib_${name}`, { recursive: true }); beats[name] = 0; };
const frame = async () => {   // la captura puede expirar mientras la página malla/calcula: un reintento
  const path = `${SCHOOL}/frames_dib_${cur}/f${String(k).padStart(3, "0")}.png`;
  try { await page.screenshot({ path, clip, timeout: 60000 }); } catch (e) { console.warn("captura reintentada:", String(e).slice(0, 80)); await wait(800); await page.screenshot({ path, clip, timeout: 60000 }); }
  k++; beats[cur] = k;
};
const frames = async (n, ms = 120) => { for (let i = 0; i < n; i++) { await frame(); await wait(ms); } };
// escribir en la línea de órdenes "a mano" y pulsar Enter
const cmd = async (text, { chunk = 4, settle = true } = {}) => {
  await page.focus("#cmdin");
  for (let i = chunk; i < text.length + chunk; i += chunk) { await page.$eval("#cmdin", (e, v) => { e.value = v; }, text.slice(0, i)); await frame(); }
  await page.keyboard.press("Enter"); if (settle) await waitIdle(); await frame();
};
const enter = async () => { await page.focus("#cmdin"); await page.keyboard.press("Enter"); await waitIdle(); await frames(2, 150); };
const worldPx = (x, z) => page.evaluate((x, z) => { const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height }; }, x, z);
const moveTo = async (x, z, n = 6) => { const { px, py } = await worldPx(x, z); await page.mouse.move(px, py, { steps: n }); await wait(80); };
const glide = async (x, z, n = 4) => { for (let i = 1; i <= n; i++) { await moveTo(x, z, 3); await frame(); } };
const click = async () => { await page.mouse.down(); await page.mouse.up(); await wait(150); await frame(); };
const hist = async () => console.log("   ", (await page.$eval("#cmdhist", (e) => e.innerText)).replace(/\n/g, " | "));

// 1) hoja nueva y márgenes (órdenes escritas)
start("nuevo");
await frames(2, 200);
await cmd("nuevo"); await frames(2, 200);
await cmd("margenes xmin=0 xmax=50 fondo=-22"); await frames(3, 200); await hist();
// 2) el terreno con el RATÓN: herramienta interfaz + clics con snap (rejilla y margen)
start("terreno");
await cmd("interfaz", { settle: false }); await frames(2, 150);
await moveTo(4, -6, 2); await frames(2, 80);
for (const [x, z] of [[0, -12], [14, -12], [20, -8], [26, -8], [32, -4], [50, -4]]) { await glide(x, z, 4); await click(); }
await enter(); await hist();
// 3) el primer suelo: una orden del .hgeo → se malla y se calcula
start("suelo");
await cmd("suelo RELLENO E=25000 nu=0.30 phi=28 c=8 gamma=18"); await frames(4, 250); await hist();
// 4) las capas con COORDENADAS ESCRITAS (x,y y Enter, como AutoCAD)
start("capas");
await cmd("interfaz", { settle: false }); await cmd("0,-15", { settle: false }); await cmd("20,-14.5", { settle: false }); await cmd("50,-13", { settle: false }); await enter();
await cmd("interfaz", { settle: false }); await cmd("0,-19", { settle: false }); await cmd("@50,0.5", { settle: false }); await enter();
await cmd("suelo ARCILLA E=8000 nu=0.35 phi=17 c=22 gamma=16.5");
await cmd("suelo ROCA_MET E=150000 nu=0.25 phi=38 c=120 gamma=22"); await frames(3, 250); await hist();
// 5) asignar suelos a las regiones (herramienta + suelo activo + punto escrito)
start("asignar");
await cmd("asignar", { settle: false }); await cmd("suelo arcilla", { settle: false }); await cmd("25,-16");
await cmd("suelo roca_met", { settle: false }); await cmd("25,-20"); await frames(3, 250); await hist();
// 6) malla más fina
start("malla");
await cmd("malla 2.0"); await frames(3, 250);
// 7) etapas con cargas: sobrecarga con dos puntos escritos, ancla con un clic del ratón
start("etapas");
await cmd("etapa +sobrecarga"); await cmd("etapa 2", { settle: false }); await cmd("q=30", { settle: false });
await cmd("sobrecarga", { settle: false }); await cmd("36,-4", { settle: false }); await cmd("46,-4"); await frames(2, 250);
await cmd("etapa +ancla"); await cmd("etapa 3", { settle: false }); await cmd("F=150", { settle: false }); await cmd("ang=-20", { settle: false });
await cmd("ancla", { settle: false }); await glide(29, -6, 5); await click(); await waitIdle(); await frames(3, 250); await hist();
// 8) resultado: las tres etapas
start("resultado");
await cmd("ver", { settle: false });
for (const s of ["0", "1", "2"]) { await page.select("#stage", s); await wait(500); await frames(4, 250); }
console.log((await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
console.log("--- .hgeo escrito por el dibujo ---\n" + (await page.$eval("#hgeo", (e) => e.value)));
await browser.close();
console.log(beats);
writeFileSync(`${SCHOOL}/frames_dib_beats.json`, JSON.stringify(beats));

const hs = `titulo  Hekatan Geotechnic
tema    oscuro

escena
  voz  Dibujar un talud desde cero en Hekatan Geotechnic{Jékatan Yeotécnic}, como en AutoCAD{Ótocad}: abajo está la línea de órdenes, y cada orden queda escrita.
  voz  Nuevo. Márgenes: de cero a cincuenta, fondo a menos veintidós.
  sub  La línea de órdenes
  centro  struct3d frames_dib_nuevo n ${beats.nuevo} fps 6

escena
  voz  Orden interfaz, y el terreno se dibuja con el ratón: rejilla, imán a los márgenes, y Enter{énter} cierra la polilínea.
  sub  interfaz: el terreno con el ratón
  centro  struct3d frames_dib_terreno n ${beats.terreno} fps 7

escena
  voz  Un suelo con sus propiedades, y ya hay malla y factor de seguridad.
  sub  suelo NOMBRE E nu phi c gamma
  centro  struct3d frames_dib_suelo n ${beats.suelo} fps 6

escena
  voz  Las capas se escriben por coordenadas: equis coma zeta y Enter{énter}, o relativas con arroba, igual que en AutoCAD{Ótocad}. Luego sus dos suelos.
  sub  Coordenadas escritas: x,y · @dx,dy
  centro  struct3d frames_dib_capas n ${beats.capas} fps 9

escena
  voz  Asignar: suelo activo y un punto dentro de cada región. Las capas toman su color.
  sub  asignar · suelo · punto
  centro  struct3d frames_dib_asignar n ${beats.asignar} fps 8

escena
  voz  Malla dos: más fina, se recalcula solo.
  sub  malla 2.0
  centro  struct3d frames_dib_malla n ${beats.malla} fps 5

escena
  voz  Las etapas: la sobrecarga con dos puntos escritos sobre la corona, y el ancla con un clic en su cabeza, con fuerza y ángulo.
  sub  etapa · sobrecarga · ancla
  centro  struct3d frames_dib_etapas n ${beats.etapas} fps 9

escena
  voz  Tres etapas, tres factores de seguridad, y el modelo entero quedó escrito en el editor. Nos vemos en Hekatan Engineers{Jékatan Enyiníers}.
  sub  Todo lo dibujado queda escrito
  centro  struct3d frames_dib_resultado n ${beats.resultado} fps 3
`;
writeFileSync(`${SCHOOL}/dibujo.hs`, hs);
console.log("dibujo.hs escrito");
