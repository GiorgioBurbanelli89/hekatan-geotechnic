// MURO CANTILEVER (Rigid body de GEO5) dibujado con el ratón: dos clics (pie de la cara vista y coronación),
// el .hgeo recibe su orden `muro`, la malla mete el hormigón y el FS se recalcula. Luego un slider del muro.
//   node tests/check_muro.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(), out = "tests/shots/muro"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 1000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const idle = async () => { await wait(400); try { await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 180000 }); } catch {} await wait(300); };
const w2px = (x, z) => page.evaluate((x, z) => { const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height }; }, x, z);
const moveW = async (x, z) => { const { px, py } = await w2px(x, z); await page.mouse.move(px, py); await wait(120); };
const clickW = async (x, z) => { const { px, py } = await w2px(x, z); await page.mouse.move(px, py); await wait(80); await page.mouse.click(px, py); await wait(200); };
const pintado = () => page.evaluate(() => { const c = document.getElementById("draw"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++; return n; });
const hgeo = () => page.$eval("#hgeo", (e) => e.value);
const fs = async () => (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | ");

await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.select("#model", "hgeo"); await wait(300);
// talud limpio, sin muro: FS de referencia
await page.$eval("#hgeo", (e, v) => { e.value = v; }, `# muro dibujado con el ratón\nmargenes xmin=0 xmax=40 fondo=-20\ninterfaz 0,-9 12,-9 22,-3 40,-3\nsuelo RELLENO E=25000 nu=0.3 phi=32 c=20 gamma=19\nmalla 1.8\netapa peso propio\n`);
await page.click("#apply"); await idle();
console.log("SIN muro  →", await fs(), "|", await page.$eval("#edmsg", (e) => e.textContent));

// herramienta muro: FANTASMA bajo el cursor (antes del segundo clic ya se ve el bloque)
await page.click('.tb[data-tool="muro"]'); await wait(300);
await moveW(12, -9); const px0 = await pintado();
await clickW(12, -9);                       // 1er clic: pie de la cara vista (sobre el terreno)
await moveW(12, -4); const px1 = await pintado();
console.log(`fantasma del muro: ${px0} → ${px1} píxeles pintados en la capa de dibujo`);
await page.screenshot({ path: `${out}/10_fantasma.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });
await clickW(12, -4); await idle();          // 2º clic: coronación → H = 5 m
const t = await hgeo();
console.log("orden escrita:", (t.match(/^(muro|suelo HORMIGON).*$/gm) || ["(NINGUNA ✖)"]).join("  ·  "));
console.log("CON muro  →", await fs(), "|", await page.$eval("#edmsg", (e) => e.textContent));
console.log("materiales:", await page.$eval("#mats", (e) => e.textContent.replace(/\s+/g, " ").slice(0, 160)));
await page.screenshot({ path: `${out}/11_dibujado.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });

// sliders del muro: ¿están y mueven la geometría?
const slid = await page.$$eval("#gsliders input", (l) => l.map((i) => i.id));
console.log("sliders del muro:", slid.filter((i) => i.startsWith("gs_w0_")).join(" ") || "(NINGUNO ✖)");
const inp = await page.$("#gs_w0_H");
if (inp) {
  await page.$eval("#gs_w0_H", (e) => { e.value = "7"; e.dispatchEvent(new Event("input", { bubbles: true })); });
  await wait(500); await page.$eval("#gs_w0_H", (e) => e.dispatchEvent(new Event("change", { bubbles: true }))); await idle();
  console.log("H = 7 m →", (await hgeo()).match(/^muro.*$/m)?.[0], "|", await fs());
  await page.screenshot({ path: `${out}/12_slider_H7.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });
}
// borrar el muro: clic dentro con la herramienta borrar
await page.click('.tb[data-tool="borrar"]'); await wait(250); await clickW(12.2, -6); await idle();
console.log("tras borrar:", (await hgeo()).match(/^muro.*$/m)?.[0] ?? "(sin muro ✓)", "|", await fs());
await page.screenshot({ path: `${out}/13_borrado.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });
console.log("errores JS:", errs); await browser.close(); process.exit(errs.length ? 1 : 0);
