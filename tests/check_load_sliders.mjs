// Sliders de CARGAS por etapa en un modelo .hgeo: q de la sobrecarga y F/ángulo del ancla reescriben el .hgeo y recalculan.
//   node tests/check_load_sliders.mjs [url]
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now();
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); const page = await browser.newPage(); await page.setViewport({ width: 1998, height: 1139 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const idle = async () => { await wait(500); await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 120000 }); await wait(300); };
const fs = async () => (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | ");
const set = async (id, v) => { await page.$eval("#" + id, (e, v) => { e.value = String(v); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }, v); await idle(); await wait(500); };
const etapas = () => page.$eval("#hgeo", (e) => e.value.split("\n").filter((l) => l.startsWith("etapa +")).join(" / "));
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.select("#model", "hgeo"); await wait(300); await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync("examples/talud_4suelos.hgeo", "utf8")); await page.click("#apply"); await idle();
console.log("sliders de carga:", await page.$$eval("#gsliders input[type=range]", (l) => l.map((e) => e.id.replace("gs_", "")).filter((k) => /^(q|F|ang)\d/.test(k)).join(" ")));
console.log("inicio:", await etapas(), "| FS:", await fs());
await page.select("#stage", "1"); await set("gs_q1_0", 80); console.log("q→80:", await etapas(), "| FS:", await fs());
await page.select("#stage", "2"); await set("gs_F2_0", 400); console.log("F→400:", await etapas(), "| FS:", await fs());
await set("gs_ang2_0", -30); console.log("ang→-30:", await etapas(), "| FS:", await fs());
console.log("errores JS:", errs); await browser.close(); process.exit(errs.length ? 1 : 0);
