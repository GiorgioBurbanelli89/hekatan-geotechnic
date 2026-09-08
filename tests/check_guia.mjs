// La GUÍA sale al pulsar «Nuevo», dice qué hacer en cada paso, avanza sola y se puede cerrar/reabrir.
//   node tests/check_guia.mjs [url] [outdir]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(), out = process.argv[3] || "tests/shots/guia"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1998, height: 1139 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
const paso = () => page.$eval("#guia", (e) => e.hidden ? "OCULTA" : e.querySelector(".gn").textContent + " · " + e.querySelector(".gl .cur")?.textContent);
const cmd = async (t) => { await page.focus("#cmdin"); await page.$eval("#cmdin", (e, v) => { e.value = v; }, t); await page.keyboard.press("Enter"); await wait(400); try { await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 120000 }); } catch {} };
console.log("antes de Nuevo:", await paso());
await page.click("#fNuevo"); await wait(500); console.log("Nuevo →", await paso()); await page.screenshot({ path: `${out}/01_nuevo.png` });
// «usar» deja el ejemplo en la línea de órdenes
await page.click("#guia .gu"); const v = await page.$eval("#cmdin", (e) => e.value); console.log("usar →", v); await page.keyboard.press("Enter"); await wait(400); console.log("márgenes →", await paso());
await page.screenshot({ path: `${out}/02_margenes.png` });
await cmd("interfaz 0,-14 16,-14 24,-9 32,-9 40,-3 60,-3"); console.log("terreno →", await paso()); await page.screenshot({ path: `${out}/03_terreno.png` });
await cmd("suelo LIMO_ARENOSO E=20000 nu=0.30 phi=26 c=10 gamma=17.5"); console.log("suelo →", await paso()); await page.screenshot({ path: `${out}/04_suelo.png` });
await page.click("#guia .gs"); console.log("saltar capas →", await paso());
await cmd("malla 2"); console.log("malla →", await paso());
await cmd("etapa +sobrecarga q=40 en 44,-3 -> 56,-3"); console.log("etapa →", await paso()); await page.screenshot({ path: `${out}/05_etapas.png` });
await page.click("#guia .gx"); console.log("cerrar →", await paso());
await page.click("#gAyuda"); console.log("? guía →", await paso());
console.log("FS:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "), "| errores JS:", errs.length);
await browser.close(); process.exit(errs.length ? 1 : 0);
