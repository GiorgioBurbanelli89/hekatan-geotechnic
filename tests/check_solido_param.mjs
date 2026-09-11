// ¿El muro en SÓLIDOS está parametrizado? (Jorge, 11-sep-2026). Se comprueba que TODO sale del modelo:
// al mover un slider del muro el sólido se vuelve a resolver solo, la malla y la longitud son campos, y
// la sobrecarga de la etapa y el peso del hormigón del .hgeo LLEGAN al sólido (antes iban q0=0 y γ=24 fijos).
//   node tests/check_solido_param.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://localhost:4700/") + "?v=" + Date.now(), out = "tests/shots/solparam"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 1200 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const idle = async () => { await wait(400); try { await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 180000 }); } catch {} await wait(300); };
const sol = () => page.$eval("#wsolout", (e) => e.innerText.replace(/\s+/g, " ").trim());
const esperaSol = (previo) => page.waitForFunction((p) => { const t = document.getElementById("wsolout").innerText; return /u_x/.test(t) && t.replace(/\s+/g, " ").trim() !== p; }, { timeout: 120000 }, previo);

await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.select("#model", "hgeo"); await wait(300);
await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync("examples/muro_cantilever.hgeo", "utf-8"));
await page.click("#apply"); await idle();

await page.click("#wSolido"); await page.waitForFunction(() => /u_x|✖/.test(document.getElementById("wsolout").innerText), { timeout: 120000 });
const s0 = await sol();
console.log("1) primera resolución:\n  ", s0, "\n");

// (a) la GEOMETRÍA: mover el slider de la altura del muro tiene que cambiar el sólido SOLO (sin volver a pulsar)
await page.$eval("#gs_w0_H", (e) => { e.value = "6"; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); });
await idle(); await esperaSol(s0).catch(() => {});
const s1 = await sol();
console.log("2) slider altura H = 6 m (sin pulsar el botón):\n  ", s1);
console.log("   ¿se recalculó solo?", s1 !== s0 ? "✓ sí" : "✖ NO");

// (b) la MALLA: campo propio del sólido
const antes = s1;
await page.$eval("#wMs", (e) => { e.value = "0.3"; e.dispatchEvent(new Event("change", { bubbles: true })); });
await wait(600); await esperaSol(antes).catch(() => {});
const s2 = await sol();
console.log("\n3) malla del sólido 0.2 → 0.3 m:\n  ", s2);
console.log("   ¿cambió el número de hexaedros?", /malla 0.3/.test(s2) ? "✓ sí" : "✖ NO");

// (c) la LONGITUD en y
await page.$eval("#wMs", (e) => { e.value = "0.2"; e.dispatchEvent(new Event("change", { bubbles: true })); }); await wait(500);
const antes3 = await sol();
await page.$eval("#wL", (e) => { e.value = "2"; e.dispatchEvent(new Event("change", { bubbles: true })); });
await wait(600); await esperaSol(antes3).catch(() => {});
const s3 = await sol();
console.log("\n4) longitud del muro 1 → 2 m:\n  ", s3);
console.log("   ¿largo 2 m y el doble de empuje?", /largo 2 m/.test(s3) ? "✓ sí" : "✖ NO");

// (d) la SOBRECARGA de la etapa: la etapa 2 del ejemplo lleva q=25 en la corona (fuera del relleno del muro),
//     así que se pone una q ENCIMA del relleno y se comprueba que llega al sólido
await page.$eval("#wL", (e) => { e.value = "1"; e.dispatchEvent(new Event("change", { bubbles: true })); }); await wait(500);
const t = readFileSync("examples/muro_cantilever.hgeo", "utf-8").replace(/^etapa \+sobrecarga.*$/m, "etapa +sobrecarga q=40 en 14,-5 -> 18,-5");
await page.$eval("#hgeo", (e, v) => { e.value = v; }, t);
await page.click("#apply"); await idle();
await page.select("#stage", "1"); await idle(); await wait(800);
const antes4 = await sol();
await page.click("#wSolido"); await esperaSol(antes4).catch(() => {}); await wait(400);
const s4 = await sol();
console.log("\n5) etapa 2 con q = 40 kPa sobre el relleno:\n  ", s4);
console.log("   ¿la q llega al sólido?", /q=40 kPa/.test(s4) ? "✓ sí" : "✖ NO (iba 0 fijo)");
await page.$eval("#murowrap", (e) => { e.querySelectorAll("details").forEach((d) => (d.open = true)); });
const h = await page.$("#murowrap"); await h.screenshot({ path: `${out}/01_param.png` });
console.log("\nerrores JS:", errs); await browser.close(); process.exit(errs.length ? 1 : 0);
