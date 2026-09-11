// PANEL DEL MURO en la app: la verificación (vuelco, deslizamiento, excentricidad, portante) sale del
// propio modelo, reacciona a los controles, y el botón de SÓLIDOS H8 resuelve el mismo muro en 3D.
//   node tests/check_muro_panel.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(), out = "tests/shots/muropanel"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 1200 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const idle = async () => { await wait(400); try { await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 180000 }); } catch {} await wait(300); };
const texto = (id) => page.$eval(id, (e) => e.innerText.replace(/\s+/g, " ").trim());

await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
console.log("sin muro → panel oculto:", await page.$eval("#murowrap", (e) => e.hidden));

await page.select("#model", "hgeo"); await wait(300);
await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync("examples/muro_cantilever.hgeo", "utf-8"));
await page.click("#apply"); await idle();
console.log("con muro → panel visible:", !(await page.$eval("#murowrap", (e) => e.hidden)));
console.log("\nVERIFICACIÓN (Coulomb, δ auto, sin R_d):\n ", await texto("#wout"));
// el panel del muro está al final del aside (que tiene su propio scroll): se captura EL ELEMENTO,
// que puppeteer lleva solo a la vista, en vez de recortar el viewport por coordenadas
const disparo = async (fn) => {
  await page.$eval("#murowrap", (e) => { e.querySelectorAll("details").forEach((d) => (d.open = true)); }); await wait(200);
  const h = await page.$("#murowrap"); await h.screenshot({ path: `${out}/${fn}` });
};
await disparo("01_verificacion.png");

// R_d del terreno → aparece la capacidad portante
await page.$eval("#wRd", (e) => { e.value = "400"; e.dispatchEvent(new Event("change", { bubbles: true })); }); await wait(400);
const conRd = await texto("#wout");
console.log("\ncon R_d = 400 kPa:", /capacidad portante/.test(conRd) ? "✓ aparece la verificación de capacidad portante" : "✖ NO aparece");
// empuje en reposo (Jáky): Ka sube y el vuelco baja
const ka1 = (await texto("#wout")).match(/Ka = ([\d.]+)/)?.[1];
await page.select("#wTeoria", "reposo"); await wait(400);
const ka2 = (await texto("#wout")).match(/Ka = ([\d.]+)/)?.[1];
console.log(`teoría Coulomb → reposo (Jáky): Ka ${ka1} → ${ka2} ${Number(ka2) > Number(ka1) ? "✓ (en reposo empuja más)" : "✖"}`);
await page.select("#wTeoria", "coulomb"); await wait(300);
// empuje pasivo delante
await page.$eval("#wPasivo", (e) => { e.checked = true; e.dispatchEvent(new Event("change", { bubbles: true })); }); await wait(400);
console.log("con empuje pasivo:", /Kp/.test(await texto("#wout")) ? "✓ aparece Kp y suma al deslizamiento" : "✖ no aparece Kp");
await page.$eval("#wPasivo", (e) => { e.checked = false; e.dispatchEvent(new Event("change", { bubbles: true })); }); await wait(300);

// SÓLIDOS H8
await page.click("#wSolido");
await page.waitForFunction(() => /u_x|✖/.test(document.getElementById("wsolout").innerText), { timeout: 120000 });
console.log("\nSÓLIDOS H8:\n ", await texto("#wsolout"));
await disparo("02_solido_h8.png");
console.log("\nerrores JS:", errs); await browser.close(); process.exit(errs.length ? 1 : 0);
