// Hover de la zapata: mueve el mouse a puntos de la planta (σ), del perfil (Δσz, m·σor) y del corte, y captura
// cada lienzo.   node tests/shot_zapata_hover.mjs [url] [outdir]
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire((process.env.USERPROFILE ?? "") + "/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const base = process.argv[2] || "http://localhost:4700/";
const out = process.argv[3] || "tests/shots/zapata_hover";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"], executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1250 });
const consola = [];
page.on("console", (m) => consola.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consola.push(`[pageerror] ${e.message}`));
await page.goto(base + "?ejemplo=zapata_guerra", { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.__zapata, { timeout: 30000 });
const info = await page.evaluate(() => { const { datos: d, r } = window.__zapata; return { B: d.B, L: d.L, Df: d.Df, a: r.mapa.a, b: r.mapa.b, c: r.mapa.c, smax: r.sigMax, smin: r.sigMin, zInf: r.asiento.zInf, per: r.asiento.perfil }; });
// lienzo (coords internas) → página
const aPagina = (id, px, py) => page.evaluate((id, px, py) => { const cv = document.getElementById(id), R = cv.getBoundingClientRect(); cv.scrollIntoView({ block: "center" }); const R2 = cv.getBoundingClientRect(); return { x: R2.left + px * R2.width / cv.width, y: R2.top + py * R2.height / cv.height }; }, id, px, py);
const captura = async (id, nombre) => { const el = await page.$("#" + id); await el.screenshot({ path: `${out}/${nombre}.png` }); };
const res = { esperado: {}, puntos: [] };
// planta: misma geometría que dibujarPlanta
const W = 620, H = 560, m = 70, sc = Math.min((W - 2 * m - 70) / info.B, (H - 2 * m) / info.L), x0 = (W - 70) / 2 - info.B * sc / 2, y0 = H / 2 - info.L * sc / 2;
const Pp = (x, y) => [x0 + (x + info.B / 2) * sc, y0 + (info.L / 2 - y) * sc];
const sig = (x, y) => Math.max(0, info.a + info.b * x + info.c * y);
let n = 0;
for (const [x, y] of [[info.B / 2 - 0.001, info.L / 2 - 0.001], [-info.B / 2 + 0.001, -info.L / 2 + 0.001], [0.5, 0.8]]) {
  const [px, py] = Pp(x, y), p = await aPagina("zapPlanta", px, py); await page.mouse.move(p.x, p.y); await new Promise((r) => setTimeout(r, 120));
  await captura("zapPlanta", `planta_${++n}`); res.puntos.push({ planta: [x, y], sigma: sig(x, y) });
}
res.esperado = { smax: info.smax, smin: info.smin };
// corte: misma geometría que dibujarCorte
const prof = info.Df + info.zInf + 0.5, sc2 = Math.min((H - 50) / prof, (W * 0.45) / (info.B + 1)), xc = W * 0.27, yg = 30;
for (const z of [0.5, 1.5, info.zInf + 0.15]) {
  const p = await aPagina("zapCorte", W * 0.75, yg + (info.Df + z) * sc2); await page.mouse.move(p.x, p.y); await new Promise((r) => setTimeout(r, 120));
  await captura("zapCorte", `perfil_z${z.toFixed(2)}`); res.puntos.push({ perfil_z: z });
}
for (const [x, z, t] of [[0.8, info.Df - 0.2, "zapata"], [0, 0.4, "columna"], [-1.9, 3.0, "suelo"]]) {
  const p = await aPagina("zapCorte", xc + x * sc2, yg + z * sc2); await page.mouse.move(p.x, p.y); await new Promise((r) => setTimeout(r, 120));
  await captura("zapCorte", `corte_${t}`);
}
const per = info.per; res.perfil_muestra = per.filter((q) => [0.5, 1.5].some((z) => Math.abs(q.z - z) < 0.03));
writeFileSync(`${out}/resultados.json`, JSON.stringify(res, null, 1));
writeFileSync(`${out}/consola.txt`, consola.join("\n"));
console.log(JSON.stringify(res, null, 1)); console.log("consola:", consola.filter((c) => /error/i.test(c)).join("\n") || "sin errores");
await browser.close();
