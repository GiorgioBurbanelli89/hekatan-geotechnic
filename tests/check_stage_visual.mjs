// Al colocar una sobrecarga/ancla, ¿la gráfica muestra ESA etapa con la carga dibujada?  node tests/check_stage_visual.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(), out = "tests/shots/stagevis"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 1000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const idle = async () => { await wait(400); try { await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 120000 }); } catch {} await wait(250); };
const clickW = async (x, z) => { const { px, py } = await page.evaluate((x, z) => { const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height }; }, x, z); await page.mouse.move(px, py); await wait(60); await page.mouse.click(px, py); await wait(150); };
const title = () => page.$eval("#plot", () => document.querySelector("#fs, #plot") && window.__lastRange ? `${window.__lastRange.stage}` : "?").catch(() => "?");
const stageSel = () => page.$eval("#stage", (e) => e.value);
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.select("#model", "hgeo"); await wait(300);
await page.$eval("#hgeo", (e, v) => { e.value = v; }, `margenes xmin=0 xmax=40 fondo=-20\ninterfaz 0,-6 12,-6 20,-1 40,-1\nsuelo LIMO E=20000 nu=0.3 phi=26 c=10 gamma=18\nmalla 2\netapa peso propio\n`); await page.click("#apply"); await idle();
console.log("etapas iniciales:", await page.$$eval("#stage option", (l) => l.map((o) => o.textContent).join(" | ")), "| visible:", await stageSel());
// añadir etapa con sobrecarga: barra q=40, herramienta sobrecarga, 2 clics
await page.$eval("#dq", (e) => { e.value = "40"; e.dispatchEvent(new Event("change", { bubbles: true })); });
await page.click('.tb[data-tool="sobrecarga"]'); await wait(200); await clickW(22, -1); await clickW(34, -1); await idle();
console.log("tras sobrecarga → etapas:", await page.$$eval("#stage option", (l) => l.map((o) => o.textContent).join(" | ")), "| visible:", await stageSel(), "| range.stage:", (await page.evaluate(() => window.__lastRange?.stage)));
await page.screenshot({ path: `${out}/01_sobrecarga.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });
// añadir etapa con ancla
await page.$eval("#dF", (e) => { e.value = "150"; e.dispatchEvent(new Event("change", { bubbles: true })); });
await page.click('.tb[data-tool="ancla"]'); await wait(200); await clickW(15, -3.5); await idle();
console.log("tras ancla → etapas:", await page.$$eval("#stage option", (l) => l.map((o) => o.textContent).join(" | ")), "| visible:", await stageSel(), "| range.stage:", (await page.evaluate(() => window.__lastRange?.stage)));
console.log("FS:", (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | "));
await page.screenshot({ path: `${out}/02_ancla.png`, clip: { x: 300, y: 60, width: 1300, height: 760 } });
console.log("errores JS:", errs); await browser.close(); process.exit(errs.length ? 1 : 0);
