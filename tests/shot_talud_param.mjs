// Talud PARAMÉTRICO con bermas y estratos: carga examples/talud_bermas.hgeo, mira los sliders y mueve bermas y un estrato.
//   node tests/shot_talud_param.mjs [url] [outdir]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct-limpio/package.json");
const puppeteer = require("puppeteer");
const url = process.argv[2] || "http://localhost:4700/", out = process.argv[3] || "tests/shots/talud_param";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const consola = [];
page.on("console", (m) => consola.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consola.push(`[pageerror] ${e.message}`));
const waitTotal = async (ms = 120000) => page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: ms });
const fs = async () => (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | ");
const mover = async (id, v) => {
  await page.$eval("#log", (e) => { e.textContent = ""; });
  await page.$eval(id, (e, v) => { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }, v);
  await new Promise((r) => setTimeout(r, 600)); await waitTotal();
};
await page.goto(url, { waitUntil: "networkidle0" }); await waitTotal();
await page.select("#model", "hgeo"); await new Promise((r) => setTimeout(r, 300)); await waitTotal();
await page.$eval("#log", (e) => { e.textContent = ""; });
await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync("examples/talud_bermas.hgeo", "utf-8"));
await page.click("#apply"); await new Promise((r) => setTimeout(r, 300)); await waitTotal();
await new Promise((r) => setTimeout(r, 800));
const sliders = await page.$$eval("#gsliders .sl", (rs) => rs.map((r) => r.innerText.replace(/\s+/g, " ").trim()));
console.log("sliders:", sliders.join(" | "));
console.log("2 bermas · FS:", await fs()); await page.screenshot({ path: `${out}/01_bermas2.png` });
await mover("#gs_bermas", "0"); console.log("0 bermas · FS:", await fs()); await page.screenshot({ path: `${out}/02_bermas0.png` });
await mover("#gs_bermas", "2");
const lim = await page.$eval("#gs_estrato1", (e) => [e.min, e.max]); console.log("estrato 1: recorrido", lim);
await mover("#gs_estrato1", lim[1]); console.log(`estrato 1 subido ${lim[1]} m · FS:`, await fs()); await page.screenshot({ path: `${out}/03_estrato_arriba.png` });
writeFileSync(`${out}/consola.txt`, consola.join("\n"));
console.log("consola:", consola.filter((l) => /error/i.test(l)).join(" | ") || "sin errores");
await browser.close();
