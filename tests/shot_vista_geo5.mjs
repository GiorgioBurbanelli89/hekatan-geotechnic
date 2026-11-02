// Comprueba los selectores de la barra de resultados calcados de GEO5 (Superficie · Malla · Deformada):
//   node tests/shot_vista_geo5.mjs [url] [outdir]
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire((process.env.USERPROFILE ?? "") + "/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = process.argv[2] || "http://localhost:4700/", out = process.argv[3] || "tests/shots/vista_geo5";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1500, height: 1000 });
const consola = [];
page.on("console", (m) => consola.push(`[${m.type()}] ${m.text()}`)); page.on("pageerror", (e) => consola.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.select("#stage", "1"); await page.select("#field", "dz");
const esp = (ms) => new Promise((r) => setTimeout(r, ms));
const foto = async (n) => { await esp(500); const el = await page.$("#plot"); await el.screenshot({ path: `${out}/${n}.png` }); };
await foto("1_isosuperficie_malla");
await page.select("#meshmode", "none"); await foto("2_isosuperficie_sinmalla");
await page.select("#surf", "line"); await foto("3_isolinea");
await page.select("#surf", "none"); await foto("4_sinsuperficie");
await page.select("#surf", "iso"); await page.select("#defmode", "mag"); await foto("5_deformada_magnitud");
await page.select("#defmode", "none"); await foto("6_sin_deformar");
writeFileSync(`${out}/consola.txt`, consola.join("\n"));
console.log("consola:", consola.filter((c) => /error/i.test(c)).length, "errores");
await browser.close();
