// Herramientas de dibujo (paradigma GEO5, manejo AutoCAD): dibuja con CLICS reales sobre el lienzo.
// Frames en tests/gif_draw/frame_NN.png (GIF con tests/make_gif.py).
//   node tests/shot_draw.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = process.argv[2] || "http://localhost:4700/", out = "tests/gif_draw";
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const consola = [];
page.on("console", (m) => consola.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consola.push(`[pageerror] ${e.message}`));
let n = 0;
const shot = async (label) => { n++; await page.screenshot({ path: `${out}/frame_${String(n).padStart(2, "0")}.png` }); console.log(`frame ${n}: ${label}`); };
const waitTotal = async () => page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// clic en coordenadas del MUNDO (x, z) usando el mapeo del visor
const clickWorld = async (x, z, opts = {}) => {
  const { px, py } = await page.evaluate((x, z) => {
    const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect();
    return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height };
  }, x, z);
  await page.mouse.move(px, py); await wait(60); await page.mouse.click(px, py, opts); await wait(120);
};
const moveWorld = async (x, z) => {
  const { px, py } = await page.evaluate((x, z) => { const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height }; }, x, z);
  await page.mouse.move(px, py); await wait(80);
};
await page.goto(url, { waitUntil: "networkidle0" }); await waitTotal();
// modelo mínimo: márgenes + terreno + 1 suelo (se escribe en el editor y se aplica)
await page.select("#model", "hgeo"); await wait(300); await waitTotal();
const base = `# Dibujado con las herramientas
margenes xmin=0 xmax=40 fondo=-20
interfaz 0,-8 12,-8 22,-2 40,-2
suelo RELLENO E=30000 nu=0.3 phi=25 c=5 gamma=18
suelo ARCILLA E=15000 nu=0.35 phi=18 c=25 gamma=17
asignar RELLENO en 20,-5
malla 2
etapa peso propio
etapa +sobrecarga
`;
await page.$eval("#hgeo", (e, v) => { e.value = v; }, base); await page.click("#apply"); await wait(300); await waitTotal(); await wait(400);
await shot("terreno + 1 suelo (texto)");
// 1) herramienta interfaz: dibujar la 2ª interfaz con clics (snap 1 m)
await page.click('.tb[data-tool="interfaz"]'); await wait(200);
await moveWorld(0, -12); await shot("herramienta interfaz: cursor con snap y rejilla");
await clickWorld(0, -12); await clickWorld(14, -11); await moveWorld(24, -8); await shot("polilínea en curso (goma elástica)");
await clickWorld(24, -8); await clickWorld(40, -7);
await page.keyboard.press("Enter"); await wait(400); await waitTotal(); await wait(400);
await shot("Enter → interfaz 2 creada, remallado y FS");
// 2) asignar ARCILLA en la región de abajo
await page.click('.tb[data-tool="asignar"]'); await page.select("#dsoil", "ARCILLA"); await wait(150);
await clickWorld(20, -15); await wait(400); await waitTotal(); await wait(400);
await shot("asignar ARCILLA debajo (clic en la región)");
// 3) sobrecarga con dos clics sobre la corona, en la etapa 2
await page.click('.tb[data-tool="sobrecarga"]'); await page.select("#dstage", "1"); await page.$eval("#dq", (e) => { e.value = "40"; e.dispatchEvent(new Event("change")); }); await wait(150);
await clickWorld(26, -2); await clickWorld(34, -2); await wait(400); await waitTotal(); await wait(400);
await page.select("#stage", "1"); await wait(500);
await shot("sobrecarga 40 kPa con dos clics (etapa 2)");
// 4) mover un vértice del terreno
await page.click('.tb[data-tool="mover"]'); await wait(150);
const from = await page.evaluate(() => { const [px, py] = window.__geoMap.tf(12, -8); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height }; });
const to = await page.evaluate(() => { const [px, py] = window.__geoMap.tf(10, -8); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height }; });
await page.mouse.move(from.px, from.py); await page.mouse.down(); await wait(80); await page.mouse.move(to.px, to.py, { steps: 8 }); await wait(80); await page.mouse.up();
await wait(400); await waitTotal(); await wait(400);
await shot("mover: pie del talud arrastrado de x=12 a x=10");
// 5) deshacer
await page.click("#undo"); await wait(400); await waitTotal(); await wait(400);
await shot("Ctrl+Z / deshacer → vuelve a x=12");
await page.click('.tb[data-tool="ver"]'); await wait(200); await shot("ver: resultado final");
console.log("texto generado:\n" + (await page.$eval("#hgeo", (e) => e.value)));
console.log("FS:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
writeFileSync(`${out}/consola.txt`, consola.join("\n"));
console.log("consola:", consola.filter((l) => !l.includes("vite")).join(" | ") || "limpia");
await browser.close();
