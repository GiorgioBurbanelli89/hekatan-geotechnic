// Plantilla «Talud con excavación al pie y muro en voladizo (con dentellón)» en el navegador (puppeteer):
//   node tests/check_excavacion_muro.mjs [url] [outdir]
// elegir el tipo → etapas talud natural / muro / excavación / FS final; mapas d_x, d_z, |d|, E_d,pl con hover; un slider Tweakpane
// recalcula; casilla «con muro» apagada → la misma excavación sin muro. Capturas en outdir (mirar los PNG).
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire((process.env.USERPROFILE ?? "") + "/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://127.0.0.1:4719/") + "?v=" + Date.now(), out = process.argv[3] || "tests/shots/excavacion_muro"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 1000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
let bad = 0; const ok = (c, t) => { console.log((c ? "  ✓ " : "  ✗ ") + t); if (!c) bad++; };
const idle = async () => { await wait(800); await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando") && (window.__tipo?.srm?.length ?? 0) > 0 && document.getElementById("tipoSrm") && !document.getElementById("tipoSrm").textContent.includes("calculando"), { timeout: 300000 }); await wait(500); };
const toPx = (x, z) => page.evaluate((x, z) => { const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height }; }, x, z);
const verEtapa = async (i) => { await page.$eval("#stage", (e, i) => { e.value = String(i); e.dispatchEvent(new Event("change")); }, i); await wait(400); };
const campo = async (k) => { await page.$eval("#field", (e, k) => { e.value = k; e.dispatchEvent(new Event("change")); }, k); await wait(400); };

await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 240000 });
const t0 = Date.now();
await page.select("#tipoTaludSel", "excavacion_muro"); await idle();
const seg = (Date.now() - t0) / 1000;
const tabs = await page.$$eval("#etabs button", (b) => b.map((x) => x.textContent));
console.log("   pestañas:", tabs.join(" | "), `· ${seg.toFixed(1)} s en el navegador`);
ok(tabs.length === 4 && /talud natural/.test(tabs[0]) && /muro/.test(tabs[1]) && /excavacion/.test(tabs[2]) && /FS/.test(tabs[3]), "4 etapas: talud natural, muro, excavación, FS final");
const fsTxt = await page.$eval("#tipoSrm", (e) => e.textContent);
ok(/^1\.\d{3}$/.test(fsTxt.trim()), `FS final en la tabla del tipo: ${fsTxt}`);
ok(/FS 1\.\d\d/.test(tabs[3]), `pestaña del FS: ${tabs[3]}`);
const nPane = await page.$$eval("#tipoPane .tp-fldv", (f) => f.length);
ok(nPane >= 6, `panel Tweakpane con ${nPane} carpetas`);
for (const [i, k, nm] of [[2, "dx", "excav_dx"], [2, "dz", "excav_dz"], [2, "d", "excav_d"], [2, "Edpl", "excav_Edpl"], [1, "dx", "muro_dx"], [3, "dx", "fs_dx"], [3, "Edpl", "fs_Edpl"]]) {
  await verEtapa(i); await campo(k);
  const p = await toPx(9.0, -1.0); await page.mouse.move(p.px, p.py); await wait(250);
  const hv = await page.$eval("#hover", (e) => e.textContent);
  if (nm === "excav_dx") ok(/x = (8\.9|9\.\d)\d* m\s+z = -\d\.\d+ m\s+d_x = -?\d/.test(hv), `hover detrás del muro (9, −1): «${hv}»`);
  await page.screenshot({ path: `${out}/${nm}.png` });
}
const titulo = await page.evaluate(() => window.__lastRange);
console.log("   último rango:", JSON.stringify(titulo));
// slider Tweakpane (profundidad de excavación) → recalcula
const fs0 = fsTxt;
await page.evaluate(() => { const r = document.querySelector('#tipoPane [data-k="dexc"] input'); r.value = "2.4"; r.dispatchEvent(new Event("change", { bubbles: true })); });
await wait(600); await idle();
const txt = await page.$eval("#hgeo", (e) => e.value);
ok(/dexc=2\.4/.test(txt) && /linea 0,-2\.4 7\.8,-2\.4/.test(txt), "profundidad de excavación 2.4 m escrita en el .hgeo");
console.log("   FS con excavación 2.4 m:", await page.$eval("#tipoSrm", (e) => e.textContent), "(antes", fs0 + ")");
await verEtapa(2); await campo("dx"); await page.screenshot({ path: `${out}/excav24_dx.png` });
// sin muro
await page.evaluate(() => { const c = document.querySelector('#tipoPane [data-k="muro"] input'); c.click(); });
await wait(600); await idle();
const tabs2 = await page.$$eval("#etabs button", (b) => b.map((x) => x.textContent));
ok(tabs2.length === 3 && !tabs2.some((t) => /\d\. muro/.test(t)), `sin muro: ${tabs2.join(" | ")}`);
await verEtapa(1); await campo("dx"); await page.screenshot({ path: `${out}/sin_muro_dx.png` });
ok(errs.length === 0, `sin errores de consola${errs.length ? ": " + errs.slice(0, 3).join(" · ") : ""}`);
await browser.close();
console.log(bad ? `\n✗ ${bad} fallaron` : "\n✓ todo bien");
process.exit(bad ? 1 : 0);
