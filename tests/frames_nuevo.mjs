// Fotogramas para el vídeo "modelo desde cero": se ESCRIBEN las órdenes del .hgeo en el editor (letra grande)
// y a cada bloque se aplica y se ve la malla / el resultado. Ventana entera (editor + gráfica + tabla FS), 16:9.
//   node tests/frames_nuevo.mjs [url]   → hekatan-school/frames_nuevo_<beat>/f000.png… y hekatan-school/nuevo.hs
// Luego (GUIA_VIDEO.md): cd hekatan-school && python hsc.py nuevo.hs NUEVO.mp4 → marca_agua → recorte vertical
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = process.argv[2] || "http://localhost:4700/?tema=oscuro";
const SCHOOL = "C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-school";
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });   // el <main> se lleva al cuadro 16:9 del vídeo casi 1:1 → letra del editor legible a 720p
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const waitTotal = async () => page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.goto(url, { waitUntil: "networkidle0" }); await waitTotal();
await page.select("#model", "hgeo"); await wait(300); await waitTotal(); await wait(300);
// Presentación para ESTE vídeo: editor grande a la izquierda, solo la tabla de FS debajo; sin sliders ni vista.
await page.evaluate(() => {
  const css = document.createElement("style");
  css.textContent = `#log,footer{display:none!important} main{grid-template-columns:600px 1fr!important;padding:8px 14px!important;gap:10px!important}
    aside.panel>*:not(#editor):not(#fs):not(h2:first-child){display:none!important}
    textarea#hgeo{font-size:18px!important;line-height:1.3!important;height:445px!important;padding:8px!important}
    #edmsg{font-size:13px!important} .fs table{font-size:14px!important} #edmsg,#fs{margin-top:6px}`;
  document.head.appendChild(css); window.scrollTo(0, 0);
});
const clip = await page.evaluate(() => { const r = document.querySelector("main").getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(Math.min(r.height, r.width * 9 / 16)) }; });
console.log("clip:", clip);
const beats = {}; let cur = null, k = 0;
const start = (name) => { cur = name; k = 0; rmSync(`${SCHOOL}/frames_nuevo_${name}`, { recursive: true, force: true }); mkdirSync(`${SCHOOL}/frames_nuevo_${name}`, { recursive: true }); beats[name] = 0; };
const frame = async () => { await page.screenshot({ path: `${SCHOOL}/frames_nuevo_${cur}/f${String(k).padStart(3, "0")}.png`, clip }); k++; beats[cur] = k; };
const frames = async (n, ms = 120) => { for (let i = 0; i < n; i++) { await frame(); await wait(ms); } };
const setText = (v) => page.$eval("#hgeo", (e, v) => { e.value = v; e.scrollTop = e.scrollHeight; }, v);
let text = "";
// escribe una línea "a mano": trozos de 5 letras, un fotograma por trozo
const type = async (line) => { const base = text ? text + "\n" : ""; for (let i = 5; i < line.length + 5; i += 5) { await setText(base + line.slice(0, i)); await frame(); } text = base + line; await setText(text); await frame(); };
const apply = async () => { await page.click("#apply"); await wait(400); await waitTotal(); await wait(400); console.log(cur, "→", (await page.$eval("#edmsg", (e) => e.textContent)).trim().slice(0, 90)); };
const stage = async (i) => { await page.select("#stage", String(i)); await wait(500); };

// 0) hoja en blanco
await setText(""); await page.evaluate(() => { document.getElementById("edmsg").textContent = ""; });
start("blanco"); await frames(3, 200);
// 1) el rango y el terreno
start("terreno");
await type("# talud desde cero: 3 suelos, carga y ancla");
await type("margenes xmin=0 xmax=50 fondo=-22");
await type("# 1) margenes y terreno (la primera interfaz)");
await type("interfaz 0,-12 14,-12 20,-8 26,-8 32,-4 50,-4");
await type("suelo RELLENO  E=25000  nu=0.30 phi=28 c=8   gamma=18");
await apply(); await frames(5, 200);
// 2) las capas: dos interfaces más y sus suelos
start("capas");
await type("# 2) techos de la arcilla y de la roca");
await type("interfaz 0,-15 20,-14.5 50,-13");
await type("interfaz 0,-19 50,-18.5");
await type("suelo ARCILLA  E=8000   nu=0.35 phi=17 c=22  gamma=16.5");
await type("suelo ROCA_MET E=150000 nu=0.25 phi=38 c=120 gamma=22");
await apply(); await frames(4, 200);
// 3) qué suelo va en cada región
start("asignar");
await type("asignar RELLENO  en 25,-10");
await type("asignar ARCILLA  en 25,-16");
await type("asignar ROCA_MET en 25,-20");
await apply(); await frames(5, 200);
// 4) malla más fina
start("malla");
await type("malla 2.0");
await apply(); await frames(4, 200);
// 5) etapas
start("etapas");
await type("etapa peso propio");
await type("etapa +sobrecarga  q=30 en 36,-4 -> 46,-4");
await type("etapa +ancla       F=150 en 29,-6 ang=-20");
await apply(); await frames(3, 200);
start("resultado");
await stage(0); await frames(3, 250); await stage(1); await frames(4, 250); await stage(2); await frames(5, 250);
await page.select("#field", "dz"); await wait(400); await frames(4, 250);
await browser.close();
console.log(beats);
writeFileSync(`${SCHOOL}/frames_nuevo_beats.json`, JSON.stringify(beats));

const hs = `titulo  Hekatan Geotechnic
tema    oscuro

escena
  voz  Un talud desde cero en Hekatan Geotechnic{Jékatan Yeotécnic}. Sin ratón: solo texto. Cada línea es una orden, como en GEO5{Yeo cinco}.
  sub  Un modelo desde cero, con órdenes
  centro  struct3d frames_nuevo_blanco n ${beats.blanco} fps 2

escena
  voz  Primero, los márgenes del modelo. Luego el terreno: una interfaz con sus puntos, de borde a borde. Y un suelo, con módulo, fricción, cohesión y peso.
  voz  Aplicar: el mallador ya lo llena de elementos y calcula el factor de seguridad.
  sub  margenes · interfaz · suelo
  centro  struct3d frames_nuevo_terreno n ${beats.terreno} fps 9

escena
  voz  Cada interfaz nueva es el techo de un suelo más profundo: la arcilla blanda y la roca meteorizada, con sus propiedades.
  sub  Más interfaces, más suelos
  centro  struct3d frames_nuevo_capas n ${beats.capas} fps 10

escena
  voz  Asignar dice qué suelo va en cada región: basta un punto dentro, igual que en GEO5{Yeo cinco}. Ahora las tres capas tienen su color.
  sub  asignar SUELO en x,y
  centro  struct3d frames_nuevo_asignar n ${beats.asignar} fps 8

escena
  voz  Malla dos: elementos más pequeños. Se remalla y se recalcula solo.
  sub  malla h
  centro  struct3d frames_nuevo_malla n ${beats.malla} fps 6

escena
  voz  Y las etapas: peso propio, una sobrecarga entre dos puntos de la corona, y un ancla con su fuerza y su ángulo. Cada etapa suma a la anterior.
  sub  etapa · sobrecarga · ancla
  centro  struct3d frames_nuevo_etapas n ${beats.etapas} fps 9

escena
  voz  Tres factores de seguridad: uno ochenta y ocho, uno cincuenta, uno dieciocho. El ancla puntual sobre relleno blando plastifica la zona y baja el factor: eso es física, no un error.
  voz  Nos vemos en Hekatan Engineers{Jékatan Enyiníers}.
  sub  Tres etapas, tres factores de seguridad
  centro  struct3d frames_nuevo_resultado n ${beats.resultado} fps 3
`;
writeFileSync(`${SCHOOL}/nuevo.hs`, hs);
console.log("nuevo.hs escrito");
