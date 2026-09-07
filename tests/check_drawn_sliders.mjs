// Prueba: un talud DIBUJADO tiene sliders y moverlos remalla y recalcula (FS cambia). node tests/check_drawn_sliders.mjs
import { createRequire } from "node:module"; import { readFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); const page = await browser.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const waitTotal = () => page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 180000 });
await page.goto("http://localhost:4700/", { waitUntil: "networkidle0" }); await waitTotal();
await page.select("#model", "hgeo"); await wait(300); await waitTotal();
await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync("examples/talud_nuevo.hgeo", "utf-8")); await page.click("#apply"); await wait(400); await waitTotal(); await wait(300);
const fs0 = await page.$eval("#fs", (e) => e.innerText); const ids = await page.$$eval("#gsliders input", (l) => l.map((i) => i.id));
console.log("sliders:", ids.join(" "));
await page.$eval("#gs_z2", (e) => { e.value = "-5"; e.dispatchEvent(new Event("input", { bubbles: true })); }); await wait(500); await waitTotal(); await wait(400);
const fs1 = await page.$eval("#fs", (e) => e.innerText); const txt = await page.$eval("#hgeo", (e) => e.value.match(/^interfaz.*$/m)[0]);
console.log("antes:", fs0.split("\n")[1], "| después (P3 z=-5):", fs1.split("\n")[1]); console.log("texto reescrito:", txt);
await browser.close();
