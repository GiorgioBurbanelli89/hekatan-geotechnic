// PASOS (frames de GEO5): salen al pulsar Nuevo o al elegir una herramienta, siguen la herramienta activa, y cada paso
// tiene su formulario: márgenes, suelos (añadir sin comandos), asignar, malla, etapas. Todo por clics, sin la línea de órdenes.
//   node tests/check_pasos.mjs [url] [outdir]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(), out = process.argv[3] || "tests/shots/pasos"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1998, height: 1139 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const idle = async () => { await wait(400); try { await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 120000 }); } catch {} await wait(250); };
const paso = () => page.$eval("#pasos", (e) => e.hidden ? "OCULTO" : e.querySelector(".pl .cur")?.textContent.replace(/\s+/g, " ").trim());
const set = async (id, v) => page.$eval("#" + id, (e, v) => { e.value = String(v); e.dispatchEvent(new Event("change", { bubbles: true })); }, v);
const clickWorld = async (x, z) => { const { px, py } = await page.evaluate((x, z) => { const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height }; }, x, z); await page.mouse.move(px, py); await wait(60); await page.mouse.click(px, py); await wait(120); };
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
console.log("Demo04 (fixture):", await paso());
// 1) al elegir una herramienta (sin Nuevo) salen los pasos, en el de esa herramienta
await page.click('.tb[data-tool="interfaz"]'); await wait(400); console.log("herramienta interfaz →", await paso());
// 2) Nuevo → márgenes por formulario
await page.click("#fNuevo"); await wait(500); console.log("Nuevo →", await paso());
await set("pm_xmin", 0); await set("pm_xmax", 60); await set("pm_fondo", -26); await page.click("#pm_ok"); await idle(); console.log("márgenes aplicados →", await paso(), "|", await page.$eval("#hgeo", (e) => e.value.split("\n")[1]));
await shot("01_margenes");
// 3) terreno con clics (FASE 1): botón dibujar → 6 clics → Enter
await page.click('#pasos .pt[data-tool="interfaz"]'); await wait(300); console.log("dibujar →", await paso(), "| estado:", await page.$eval("#dstatus", (e) => e.textContent));
for (const [x, z] of [[0, -14], [16, -14], [24, -9], [32, -9], [40, -3], [60, -3]]) await clickWorld(x, z);
await page.mouse.move(600, 500); const st = await page.$eval("#dstatus", (e) => e.textContent); console.log("   lectura en vivo:", st.slice(0, 90));
await page.keyboard.press("Enter"); await idle(); console.log("terreno →", await paso(), "|", await page.$eval("#hgeo", (e) => e.value.split("\n").find((l) => l.startsWith("interfaz"))));
await shot("02_terreno");
// 4) suelo por FORMULARIO
await set("ps_name", "LIMO_ARENOSO"); await set("ps_E", 20000); await set("ps_nu", 0.3); await set("ps_phi", 26); await set("ps_c", 10); await set("ps_g", 17.5); await page.click("#ps_add"); await idle();
console.log("suelo añadido →", await paso(), "| FS:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
await shot("03_suelo");
// 5) una capa (otra interfaz) + segundo suelo + asignar con clic
await page.click('#pasos .pl li[data-p="terreno"]'); await page.click('#pasos .pt[data-tool="interfaz"]'); await wait(200);
for (const [x, z] of [[0, -17], [30, -16.5], [60, -15]]) await clickWorld(x, z);
await page.keyboard.press("Enter"); await idle(); console.log("capa →", await paso(), "| interfaces:", await page.$$eval("#pasos .pli li", (l) => l.length));
await page.click('#pasos .pl li[data-p="suelos"]'); await set("ps_name", "ARCILLA_BLANDA"); await set("ps_E", 6000); await set("ps_nu", 0.4); await set("ps_phi", 15); await set("ps_c", 18); await set("ps_g", 16); await page.click("#ps_add"); await idle();
console.log("2º suelo →", await paso(), "| suelos:", await page.$eval("#hgeo", (e) => e.value.split("\n").filter((l) => l.startsWith("suelo")).length));
await page.click('#pasos .pl li[data-p="asignar"]'); await page.select("#pa_soil", "ARCILLA_BLANDA"); await page.click('#pasos .pt[data-tool="asignar"]'); await wait(200); await clickWorld(30, -20); await idle();
console.log("asignar →", await paso(), "|", await page.$eval("#hgeo", (e) => e.value.split("\n").find((l) => l.startsWith("asignar"))));
await shot("04_asignar");
// 6) malla + etapa con sobrecarga por clics
await page.click('#pasos .pl li[data-p="malla"]'); await set("pml_h", 2); await page.click("#pml_ok"); await idle(); console.log("malla →", await paso(), "|", (await page.$eval("#edmsg", (e) => e.textContent)).slice(0, 40));
await page.click('#pasos .pl li[data-p="etapas"]'); await page.click("#pe_add"); await idle(); await set("pe_q", 40); await page.click('#pasos .pt[data-tool="sobrecarga"]'); await wait(200); await clickWorld(44, -3); await clickWorld(56, -3); await idle();
console.log("etapa+sobrecarga →", await paso(), "|", await page.$eval("#hgeo", (e) => e.value.split("\n").filter((l) => l.startsWith("etapa")).join(" / ")));
console.log("FS:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
await shot("05_etapas");
await page.click("#pasos .px"); console.log("cerrar →", await paso()); await page.click("#gAyuda"); console.log("? pasos →", await paso());
console.log("errores JS:", errs.length, errs.slice(0, 2));
await browser.close(); process.exit(errs.length ? 1 : 0);
