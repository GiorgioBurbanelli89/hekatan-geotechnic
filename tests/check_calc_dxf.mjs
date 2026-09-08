// Indicador «calculando… N ms» + export DXF GEO5.  node tests/check_calc_dxf.mjs [url]
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(); mkdirSync("tests/shots/calc", { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); const page = await browser.newPage(); await page.setViewport({ width: 1998, height: 1139 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto(url, { waitUntil: "networkidle0" });
const seen = []; for (let i = 0; i < 60; i++) { const t = await page.$eval("#calc", (e) => e.hidden ? "" : e.textContent); if (t && (!seen.length || seen[seen.length - 1] !== t)) { seen.push(t); if (t.startsWith("⏳") && seen.length === 2) await page.screenshot({ path: "tests/shots/calc/01_calculando.png" }); } if (t.startsWith("✓")) break; await wait(100); }
console.log("indicador:", seen.slice(0, 2).join(" → "), "…", seen.slice(-1)[0]);
await page.select("#model", "hgeo"); await wait(300); await page.click("#apply"); await wait(500);
await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 120000 }); await wait(300);
const dxf = await page.evaluate(() => window.__dxf()); writeFileSync("tests/shots/calc/demo04_geo5.dxf", dxf);
console.log("DXF:", dxf.length, "bytes ·", (dxf.match(/^POLYLINE$/gm) || []).length, "polilíneas ·", (dxf.match(/^POINT$/gm) || []).length, "puntos · capas:", [...new Set(dxf.split("\n").filter((l, i, a) => a[i - 1] === "8"))].join(","));
console.log("errores JS:", errs); await browser.close(); process.exit(errs.length ? 1 : 0);
