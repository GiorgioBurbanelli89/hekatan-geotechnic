// El punto de asignación de una capa vuelve EXACTO cuando el slider de la capa baja y vuelve (antes derivaba 0.55 m).
//   node tests/check_layer_restore.mjs [url]
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = process.argv[2] || "http://localhost:4700/";
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 900 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const idle = async () => { await wait(400); await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 120000 }); await wait(200); };
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.select("#model", "hgeo"); await wait(300);
await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync("examples/talud_4suelos.hgeo", "utf8")); await page.click("#apply"); await idle();
const asig = () => page.$eval("#hgeo", (e) => e.value.split("\n").filter((l) => l.startsWith("asignar")).join(" | "));
const set = async (v) => { await page.$eval("#gs_dz1", (e, v) => { e.value = String(v); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }, v); await idle(); await wait(500); };
const z0 = parseFloat(await page.$eval("#gs_dz1", (e) => e.value)); const a0 = await asig();
console.log("inicio  techo", z0, "→", a0);
for (const dz of [-0.5, -1, -1.5, -2]) { await set(z0 + dz); console.log("  techo", z0 + dz, "→", await asig()); }
await set(z0); const a1 = await asig();
console.log("vuelta  techo", z0, "→", a1);
console.log(a0 === a1 ? "OK: los puntos vuelven exactos" : "FALLO: deriva");
await browser.close(); process.exit(a0 === a1 ? 0 : 1);
