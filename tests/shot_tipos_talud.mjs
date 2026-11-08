// Tipos de talud (plantillas): abre ?tipo=<id> para cada tipo, espera Bishop, Fellenius y SRM (window.__tipo), captura PNG y consola.
//   node tests/shot_tipos_talud.mjs [url] [outdir] [tipos separados por coma]
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire((process.env.USERPROFILE ?? "") + "/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const base = process.argv[2] || "http://localhost:4700/";
const out = process.argv[3] || "tests/shots/tipos_talud";
const tipos = (process.argv[4] || "corte,terraplen,berma,estratos,muro,ladera").split(",");
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1100 });
const consola = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") consola.push(`[${m.type()}] ${m.text()}`); });
page.on("pageerror", (e) => consola.push(`[pageerror] ${e.message}`));
const res = {};
const listo = () => page.waitForFunction(() => { const t = window.__tipo; return t && t.bishop !== undefined && t.srm.length && t.srm.every((v) => v !== undefined); }, { timeout: 180000 });
for (const t of tipos) {
  await page.goto(base + "?tipo=" + t, { waitUntil: "networkidle0" });
  await listo(); await new Promise((r) => setTimeout(r, 600));
  res[t] = await page.evaluate(() => window.__tipo);
  await page.screenshot({ path: `${out}/${t}.png` });
  console.log(t, JSON.stringify(res[t]));
}
// interacción: en «berma», mover el ancho de berma con el slider y ver que se regenera y recalcula
if (tipos.includes("berma")) {
  await page.goto(base + "?tipo=berma", { waitUntil: "networkidle0" }); await listo();
  const antes = await page.evaluate(() => window.__tipo.bishop);
  await page.$eval("#tp_b", (e) => { e.value = "6"; e.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.waitForFunction((a) => window.__tipo.p.b === 6 && window.__tipo.bishop !== undefined && window.__tipo.bishop !== a && window.__tipo.srm.length, { timeout: 180000 }, antes);
  await new Promise((r) => setTimeout(r, 600));
  res.berma_b6 = await page.evaluate(() => window.__tipo);
  await page.select("#metodo", "bishop"); await new Promise((r) => setTimeout(r, 4000));
  res.berma_b6_lem = await page.evaluate(() => window.__lem()?.fs);
  await page.screenshot({ path: `${out}/berma_b6_bishop.png` });
  console.log("berma b=6", JSON.stringify(res.berma_b6), "círculo en la gráfica", res.berma_b6_lem);
}
// los modelos de antes siguen: Demo04 por defecto
await page.goto(base, { waitUntil: "networkidle0" });
await page.waitForFunction(() => (document.getElementById("log")?.textContent || "").split("TOTAL ").length - 1 >= 3, { timeout: 180000 }).catch(() => {});
res.demo04 = await page.evaluate(() => window.__fem());
console.log("demo04", JSON.stringify(res.demo04?.map((r) => r && r.fs)));
writeFileSync(`${out}/resultados.json`, JSON.stringify(res, null, 1));
writeFileSync(`${out}/consola.txt`, consola.join("\n"));
console.log("consola:", consola.join("\n") || "sin errores");
await browser.close();
