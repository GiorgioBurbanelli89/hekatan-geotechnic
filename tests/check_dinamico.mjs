// Panel DINÁMICO: carga el muro de Manabí del desplegable, usa el pulso incorporado, calcula en el Worker y comprueba
// frecuencias, curvas y empuje (números finitos), sin errores de JavaScript; compara las frecuencias con las de
// `npx tsx tools/dinamico/frecuencias_hgeo.ts` (sin navegador, mismo .hgeo) y guarda capturas en tests/shots/dinamico/.
//   node tests/check_dinamico.mjs [url] [largo]     largo = pulso de 22 s (2201 pasos) para medir el tiempo
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const AQUI = dirname(fileURLToPath(import.meta.url)), RAIZ = join(AQUI, ".."), SH = join(AQUI, "shots", "dinamico");
mkdirSync(SH, { recursive: true });
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now();
const largo = process.argv.includes("largo");
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"], protocolTimeout: 40 * 60000 });   // waitForFunction es UNA llamada: con malla 0.5 pasa de los 180 s por defecto
const page = await browser.newPage(); await page.setViewport({ width: 1500, height: 1100 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message + " @ " + String(e.stack || "").split("\n").slice(1, 3).join(" | ")));
let fallos = 0; const ok = (c, t) => { console.log(`${c ? "✓" : "✖"} ${t}`); if (!c) fallos++; };
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
const t0 = Date.now();
await page.select("#model", "manabi");
await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL ") && /Manabi/.test(document.getElementById("hgeo").value), { timeout: 300000 });
const malla = (process.argv.find((a) => a.startsWith("malla=")) || "").slice(6);   // malla=0.5: el modelo validado contra Abaqus (6900 nudos)
if (malla) {
  await page.$eval("#hgeo", (e, h) => { e.value = e.value.replace(/malla [\d.]+/, `malla ${h}`); }, malla);
  await page.$eval("#log", (e) => { e.textContent = ""; });
  await page.click("#apply");
  await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 600000 });
}
console.log(`muro de Manabí mallado y calculado (estático) en ${((Date.now() - t0) / 1000).toFixed(1)} s: ${await page.$eval("#edmsg", (e) => e.textContent)}`);
const vs = await page.$$eval("#dVs input", (xs) => xs.map((x) => x.value));
ok(vs[0] === "195" && vs[1] === "286" && vs[2] === "", `Vs de la tabla = los del .hgeo (${vs.join(", ")})`);
ok(/LINEAL/.test(await page.$eval("#dinLineal", (e) => e.textContent)), "aviso de dinámico lineal");
if (largo) { await page.$eval("#dTot", (e) => { e.value = "22"; e.dispatchEvent(new Event("change")); }); }
ok(/pico\s+0\.300 g/.test(await page.$eval("#dAccInfo", (e) => e.textContent)), "pulso de ejemplo: pico 0.300 g");
const t1 = Date.now();
await page.click("#dRun");
await page.waitForFunction(() => /✓ listo|✖/.test(document.getElementById("dMsg").textContent), { timeout: 20 * 60000 });
const seg = (Date.now() - t1) / 1000, msg = await page.$eval("#dMsg", (e) => e.textContent);
console.log(`dinámico en el navegador: ${seg.toFixed(1)} s · ${msg}`);
ok(/✓ listo/.test(msg), "el dinámico termina");
const d = await page.evaluate(() => window.__dyn);
const fin = (v) => typeof v === "number" && Number.isFinite(v);
ok(d && d.f.length >= 3 && d.f.slice(0, 3).every((f) => fin(f) && f > 0), `frecuencias ${d?.f.slice(0, 3).map((f) => f.toFixed(4)).join(" / ")} Hz`);
ok(d && d.watch.length >= 2 && d.watch.every((w) => fin(w.uxMaxMm) && fin(w.aMaxG) && w.uxMaxMm > 0), `nudos vigilados: ${d?.watch.map((w) => `${w.nombre} ${w.uxMaxMm.toFixed(3)} mm, ${w.aMaxG.toFixed(3)} g`).join(" · ")}`);
ok(d && d.empuje && fin(d.empuje.peso) && fin(d.empuje.max) && d.empuje.peso > 0, `empuje: antes ${d?.empuje?.peso.toFixed(3)} kN/m, máx ${d?.empuje?.max.toFixed(3)} kN/m en t = ${d?.empuje?.t.toFixed(2)} s`);
const vis = await page.$eval("#dinres", (e) => !e.hidden);
ok(vis, "resultados visibles bajo la gráfica");
// frecuencias sin navegador, mismo .hgeo
const hg = await page.$eval("#hgeo", (e) => e.value); const fh = join(RAIZ, "tests", "out", "check_dinamico.hgeo");
mkdirSync(dirname(fh), { recursive: true }); writeFileSync(fh, hg);
const ref = JSON.parse(execFileSync(process.execPath, [join(RAIZ, "node_modules", "tsx", "dist", "cli.mjs"), join(RAIZ, "tools", "dinamico", "frecuencias_hgeo.ts"), fh], { cwd: RAIZ, encoding: "utf-8", windowsHide: true }).trim().split("\n").pop());
const df = Math.max(...[0, 1, 2].map((k) => Math.abs(ref.f[k] - d.f[k])));
ok(ref.nudos === d.nudos && df < 5e-5, `frecuencias sin navegador ${ref.f.map((f) => f.toFixed(4)).join(" / ")} Hz (${ref.nudos} nudos) · máx dif ${df.toExponential(1)}`);
// capturas
await page.$eval("#dinwrap", (e) => e.scrollIntoView());
await (await page.$("#dinwrap")).screenshot({ path: join(SH, "panel.png") });
await (await page.$("section.panel")).screenshot({ path: join(SH, "resultados_t_max.png") });
await page.$eval("#dT", (e) => { e.value = String(Math.round(Number(e.max) * 0.1)); e.dispatchEvent(new Event("input")); });
await wait(300); await (await page.$(".stack")).screenshot({ path: join(SH, "deformada_t.png") });
// ¿dibujó el color? un píxel dentro del terreno (x 20, z −6) tiene que ser opaco y no blanco (un lienzo vacío no da error)
const pix = await page.evaluate(() => { const c = document.getElementById("plot"), g = c.getContext("2d"); const m = window.__geoMap; const [px, py] = m ? m.tf(20, -6) : [c.width / 2, c.height / 2]; return Array.from(g.getImageData(Math.round(px), Math.round(py), 1, 1).data); });
ok(pix[3] === 255 && !(pix[0] > 245 && pix[1] > 245 && pix[2] > 245), `color del campo dibujado en (20, −6): rgba ${pix.join(",")}`);
await page.select("#dVista", "env"); await wait(300); await (await page.$(".stack")).screenshot({ path: join(SH, "envolvente.png") });
await (await page.$("#dinres")).screenshot({ path: join(SH, "historias.png") });
await page.select("#dVista", "no"); await wait(300);
await (await page.$(".stack")).screenshot({ path: join(SH, "vuelta_estatico.png") });
writeFileSync(join(SH, "resumen.json"), JSON.stringify({ segundos_navegador: seg, largo, dyn: d, ref }, null, 1));
console.log("errores JS:", errs); ok(errs.length === 0, "sin errores de JavaScript");
await browser.close(); process.exit(fallos ? 1 : 0);
