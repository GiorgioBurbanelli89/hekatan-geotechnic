// El ejemplo del muro desde el DESPLEGABLE (un clic) y luego los sólidos: ¿cuelga el hilo principal?
//   node tests/check_muro_selector.mjs [url]
import { createRequire } from "node:module";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now();
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 1000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });

const t0 = Date.now();
await page.select("#model", "muro");
// ¿responde el hilo principal mientras calcula? se pregunta cada segundo
for (let i = 0; i < 40; i++) {
  await wait(1000);
  let r;
  try { r = await page.evaluate(() => ({ fs: document.getElementById("fs").innerText.replace(/\s+/g, " ").trim().slice(0, 90), muro: !document.getElementById("murowrap").hidden }), { timeout: 4000 }); }
  catch (e) { console.log(`  t=${i + 1}s  el hilo principal NO responde: ${e.message.slice(0, 60)}`); continue; }
  console.log(`  t=${i + 1}s  panel=${r.muro}  ${r.fs}`);
  if (r.muro && /1\.9|1\.7/.test(r.fs)) break;
}
console.log(`modelo cargado en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const t1 = Date.now();
await page.click("#wSolido");
await page.waitForFunction(() => /u_x|✖/.test(document.getElementById("wsolout").innerText), { timeout: 60000 });
console.log(`sólidos H8 en ${((Date.now() - t1) / 1000).toFixed(1)} s:`, (await page.$eval("#wsolout", (e) => e.innerText)).split("\n")[0]);
console.log("errores JS:", errs); await browser.close(); process.exit(errs.length ? 1 : 0);
