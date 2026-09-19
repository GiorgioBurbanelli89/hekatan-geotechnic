// La TERCERA ventana del muro (una sola área 2D, deformación plana) en la app: se resuelve, dibuja la
// malla deformada y la presión de contacto, y reacciona a sus controles (corona, dentellón, ks).
//   node tests/check_muro2d_panel.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4710/") + "?v=" + Date.now(), out = "tests/shots/muro2d"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 1200 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const idle = async () => { await wait(400); try { await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 180000 }); } catch {} await wait(300); };
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.select("#model", "hgeo"); await wait(300);
await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync("examples/muro_cantilever.hgeo", "utf-8"));
await page.click("#apply"); await idle();
await page.click("#w2Run"); await wait(800);
const texto = () => page.$eval("#w2out", (e) => e.innerText.replace(/\s+/g, " ").trim());
console.log("2D:", await texto());
const h = await page.$("#murowrap"); await h.screenshot({ path: `${out}/01_muro2d.png` });
// sin dentellón y corona = fuste: el resultado tiene que cambiar solo
await page.$eval("#w2Bd", (e) => { e.value = "0"; e.dispatchEvent(new Event("change")); }); await wait(600);
console.log("sin dentellón:", await texto());
await (await page.$("#murowrap")).screenshot({ path: `${out}/02_sin_dentellon.png` });
console.log("pageerrors:", errs.length, errs.slice(0, 3));
await browser.close();
