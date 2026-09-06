// Graba paso a paso cómo se genera un talud en el editor .hgeo: contorno → malla → 2º suelo → sobrecarga →
// ancla → resultado → slider. Deja frames PNG en tests/gif/frame_NN.png (el GIF se arma con tests/make_gif.py).
//   node tests/gif_hgeo.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = process.argv[2] || "http://localhost:4700/", out = "tests/gif";
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
let n = 0;
const shot = async (label) => { n++; await page.screenshot({ path: `${out}/frame_${String(n).padStart(2, "0")}.png` }); console.log(`frame ${n}: ${label}`); };
const waitTotal = async () => page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
const apply = async (text, label) => {
  await page.$eval("#hgeo", (e, v) => { e.value = v; }, text);
  await page.click("#apply"); await new Promise((r) => setTimeout(r, 300)); await waitTotal(); await new Promise((r) => setTimeout(r, 500));
  await shot(label);
};
await page.goto(url, { waitUntil: "networkidle0" }); await waitTotal();
await page.select("#model", "hgeo"); await new Promise((r) => setTimeout(r, 300)); await waitTotal();
const P1 = `# 1) el contorno del talud y UN suelo
contorno 0,-21.5 40,-21.5 40,-4 32.25,-4 29.5,-2.5 21,-2.5 11,-9 0,-9
suelo SOIL_1 E=130347 nu=0.3 phi=22.7 c=9 gamma=18
malla 4
etapa peso propio
`;
await apply(P1, "contorno + 1 suelo, malla gruesa (4 m)");
await apply(P1.replace("malla 4", "malla 2.3"), "malla 2.3 m");
const P2 = `# 2) segundo suelo: una CAPA debajo de una polilínea
contorno 0,-21.5 40,-21.5 40,-4 32.25,-4 29.5,-2.5 21,-2.5 11,-9 0,-9
suelo SOIL_1 E=130347 nu=0.3 phi=22.7 c=9   gamma=18
suelo SOIL_2 E=130347 nu=0.2 phi=38   c=120 gamma=20
capa  SOIL_2 bajo 0,-11.5 14,-11 21,-9.25 40,-9
malla 2.3
etapa peso propio
`;
await apply(P2, "2º suelo con interfaz (capa bajo …)");
const P3 = P2 + `etapa +sobrecarga  q=35 en 22,-2.5 -> 29,-2.5
`;
await apply(P3, "etapa 2: sobrecarga 35 kPa");
await page.select("#stage", "1"); await new Promise((r) => setTimeout(r, 500)); await shot("vista etapa 2 (d_x)");
const P4 = P3 + `etapa +ancla       F=72 en 16,-5.75 ang=-17
`;
await apply(P4, "etapa 3: ancla 72 kN");
await page.select("#stage", "2"); await new Promise((r) => setTimeout(r, 500)); await shot("vista etapa 3 (d_x)");
await page.select("#field", "dz"); await new Promise((r) => setTimeout(r, 500)); await shot("etapa 3, asiento d_z");
await page.select("#field", "dx");
await page.$eval("#sl_phi0", (e) => { e.value = "18"; e.dispatchEvent(new Event("input", { bubbles: true })); });
await new Promise((r) => setTimeout(r, 500)); await waitTotal(); await new Promise((r) => setTimeout(r, 500)); await shot("slider φ₁ = 18° → recalcula solo");
await page.$eval("#sl_c0", (e) => { e.value = "20"; e.dispatchEvent(new Event("input", { bubbles: true })); });
await new Promise((r) => setTimeout(r, 500)); await waitTotal(); await new Promise((r) => setTimeout(r, 500)); await shot("slider c₁ = 20 kPa");
await browser.close();
