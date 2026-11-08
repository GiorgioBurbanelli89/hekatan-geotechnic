// Cimentaciones: abre ?ejemplo=zapata_guerra, lee los resultados del panel (window.__zapata), cambia método y
// unidades, y captura PNG + consola.   node tests/shot_zapata.mjs [url] [outdir]
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire((process.env.USERPROFILE ?? "") + "/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const base = process.argv[2] || "http://localhost:4700/";
const out = process.argv[3] || "tests/shots/zapata";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1250 });
const consola = [];
page.on("console", (m) => consola.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consola.push(`[pageerror] ${e.message}`));
await page.goto(base + "?ejemplo=zapata_guerra", { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.__zapata, { timeout: 30000 });
const lee = () => page.evaluate(() => { const { r } = window.__zapata; return { V: r.V, sig: r.sigEf, Rd: r.Rd, qadm: r.qadm, FS: r.FS, smax: r.sigMax, smin: r.sigMin, s: r.asiento?.s, zInf: r.asiento?.zInf, w: r.winkler?.sMax, unid: r.unidades.p }; });
const res = { meyerhof_t: await lee() };
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: `${out}/01_guerra_meyerhof.png`, fullPage: true });
await page.select("#zapUni", "kN");
for (const [k, v] of [["gc", "23.56"], ["gr", "17.65"], ["gamma", "17.65"], ["gsat", "19.61"], ["N", "1186.6"], ["My", "166.71"], ["Ec", "30000"], ["Edef", "89.886"]])
  await page.$eval(`#zapCampos input[data-k=${k}]`, (e, v) => { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); }, v);
for (const m of ["meyerhof", "estandar", "vesic"]) { await page.select("#zapMetodo", m); res[m + "_kN"] = await lee(); }
await page.select("#zapMetodo", "meyerhof");
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: `${out}/02_guerra_kN_geo5.png`, fullPage: true });
writeFileSync(`${out}/resultados.json`, JSON.stringify(res, null, 1));
writeFileSync(`${out}/consola.txt`, consola.join("\n"));
console.log(JSON.stringify(res, null, 1)); console.log("consola:", consola.filter((c) => /error/i.test(c)).join("\n") || "sin errores");
await browser.close();
