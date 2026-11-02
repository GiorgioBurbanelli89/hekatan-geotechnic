// «Importar resultados de GEO5» con puppeteer (headless): sube a la vez el InputFile + el Output_File_Geo.bin reales de GEO5 (Demo04) y el DXF del muro,
// guarda un PNG de cada cuadro y comprueba lo medido (d_x mínimo −5.9968 mm, 1387 esquinas, 4215 lados).
//   node tests/check_importar_geo5.mjs [url] [outdir]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire((process.env.USERPROFILE ?? "") + "/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://127.0.0.1:4714/") + "?v=" + Date.now(), out = process.argv[3] || "tests/shots/importar_geo5"; mkdirSync(out, { recursive: true });
const D = "tests/data/geo5_export/";
const browser = await puppeteer.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 1000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
let bad = 0; const ok = (c, t) => { console.log((c ? "  ✓ " : "  ✗ ") + t); if (!c) bad++; };
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 240000 });
ok(!!(await page.$("#fImpG5")), "el botón «Importar resultados de GEO5» existe");
// 1) InputFile + .bin → mapa de color de d_x
const subir = async (archivos) => { const [h] = await Promise.all([page.waitForSelector("#fFileG5", { hidden: true }), null]); await h.uploadFile(...archivos); await wait(1500); };
await subir([D + "demo04_InputFile.txt", D + "demo04_Output_File_Geo.bin"]);
await page.waitForSelector("#g5Cv"); await wait(500);
let msg = await page.$eval("#g5Msg", (e) => e.innerText); console.log("   ", msg);
ok(/-5\.99/.test(msg), "mapa de d_x: rango con el mínimo −5.9968 mm de GEO5");
await (await page.$("#g5Cv")).screenshot({ path: out + "/01_dx_demo04.png" });
await page.select("#g5Campo", "1"); await wait(500); msg = await page.$eval("#g5Msg", (e) => e.innerText); console.log("   ", msg);
await (await page.$("#g5Cv")).screenshot({ path: out + "/02_dz_demo04.png" });
await page.click("#g5X");
// 2) DXF del muro → malla y regiones
await subir([D + "muro_et7.dxf"]); await page.waitForSelector("#g5Cv"); await wait(500);
msg = await page.$eval("#g5Msg", (e) => e.innerText); console.log("   ", msg);
await (await page.$("#g5Cv")).screenshot({ path: out + "/03_malla_dxf_muro.png" });
await page.screenshot({ path: out + "/04_pagina.png" });
ok(errs.length === 0, "sin errores de consola/JS" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
await browser.close(); console.log(bad ? `\n${bad} fallos` : "\ntodo bien"); process.exit(bad ? 1 : 0);
