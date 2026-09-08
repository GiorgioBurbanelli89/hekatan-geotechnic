// Un modelo HECHO también se parametriza: (1) Demo04 (malla GEO5) → botón «parametrizar geometría» → sliders β, H, corona;
// (2) talud dibujado → sliders β y H por cara inclinada, además de los vértices. Mover β cambia la geometría y el FS.
//   node tests/check_param_geom.mjs [url] [outdir]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(), out = process.argv[3] || "tests/shots/param_geom"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1998, height: 1139 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const idle = async () => { await wait(500); await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 120000 }); await wait(300); };
const fs = async () => (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | ");
const ids = () => page.$$eval("#gsliders input[type=range]", (l) => l.map((e) => e.id.replace("gs_", "")).join(" "));
const set = async (id, v) => { await page.$eval("#" + id, (e, v) => { e.value = String(v); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }, v); await idle(); await wait(500); };
await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
console.log("Demo04 (malla GEO5): sliders geom =", (await ids()) || "ninguno", "· botón:", await page.$eval("#gParam", (e) => e.textContent));
await page.click("#gParam"); await idle(); await wait(1500); await idle();
console.log("→ .hgeo: sliders geom =", await ids()); console.log("   FS:", await fs());
const b0 = parseFloat(await page.$eval("#gs_beta", (e) => e.value)); await set("gs_beta", 45); console.log(`   β ${b0}→45: FS:`, await fs());
await page.screenshot({ path: `${out}/01_demo04_beta45.png` });
// talud dibujado (4 suelos): β y H por cara
await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync("examples/talud_4suelos.hgeo", "utf8")); await page.click("#apply"); await idle();
console.log("talud_4suelos: sliders geom =", await ids()); console.log("   FS:", await fs());
const l0 = await page.$eval("#hgeo", (e) => e.value.split("\n").find((l) => l.startsWith("interfaz")));
await set("gs_beta0", 45); console.log("   β₁→45:", await page.$eval("#hgeo", (e) => e.value.split("\n").find((l) => l.startsWith("interfaz"))), "| FS:", await fs());
await set("gs_H0", 8); console.log("   H₁→8:", await page.$eval("#hgeo", (e) => e.value.split("\n").find((l) => l.startsWith("interfaz"))), "| FS:", await fs());
await page.screenshot({ path: `${out}/02_dibujado_beta_H.png` });
console.log("   antes:", l0, "| errores JS:", errs.length);
await browser.close(); process.exit(errs.length ? 1 : 0);
