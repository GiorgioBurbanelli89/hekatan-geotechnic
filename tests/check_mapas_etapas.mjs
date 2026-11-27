// Todas las etapas × todos los campos de la plantilla excavación + muro: ninguno en blanco sin explicación, hover en todos,
// y el estado geostático de la etapa 1 contra γ·z a mano (σ_z = −γ·prof., σ_x ≈ K0·σ_z, K0 = ν/(1−ν) lejos del talud).
//   node tests/check_mapas_etapas.mjs [url] [outdir]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire((process.env.USERPROFILE ?? "") + "/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const base = process.argv[2] || "http://localhost:4719/", out = process.argv[3] || "tests/shots/mapas"; mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--no-sandbox"], protocolTimeout: 600000 });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1000 });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0; const ok = (c, t) => { if (!c) console.log("  ✗ " + t); if (!c) bad++; return c; };
await p.goto(base + "?tipo=excavacion_muro&v=" + Date.now(), { waitUntil: "networkidle0" });
await p.waitForFunction(() => document.getElementById("tipoSrm") && /^1\.\d{3}$/.test(document.getElementById("tipoSrm").textContent.trim()), { timeout: 300000 }); await wait(800);
const px = (x, z) => p.evaluate((x, z) => { const [a, c] = window.__geoMap.tf(x, z); const cv = document.getElementById("draw"); const r = cv.getBoundingClientRect(); return [r.left + a * r.width / cv.width, r.top + c * r.height / cv.height]; }, x, z);
const hover = async (x, z) => { const [a, c] = await px(x, z); await p.mouse.move(a, c); await wait(120); const t = await p.$eval("#hover", (e) => e.textContent); const m = t.match(/=\s*(-?[\d.]+)\s*\S*$/); return m ? +m[1] : NaN; };
const set = async (si, f) => { await p.$eval("#stage", (e, si) => { e.value = String(si); e.dispatchEvent(new Event("change")); }, si); await p.$eval("#field", (e, f) => { e.value = f; e.dispatchEvent(new Event("change")); }, f); await wait(250); };
const CAMPOS = ["dx", "dz", "d", "sx", "sz", "sxt", "szt", "txz", "J", "u", "Ed", "Edpl"];
const filas = [];
for (let si = 0; si < 4; si++) for (const f of CAMPOS) {
  await set(si, f);
  const r = await p.evaluate(() => window.__lastRange), h = await hover(30, 4);
  const plano = !(r.vmax - r.vmin > 1e-9);
  ok(!plano || !!r.planoNota, `etapa ${si + 1} ${f}: campo plano SIN explicación`);
  ok(Number.isFinite(h), `etapa ${si + 1} ${f}: hover sin valor`);
  const tab = await p.$eval("#rtabs button.on", (e) => e.dataset.p), G = { dx: "desp", dz: "desp", d: "desp", Ed: "plas", Edpl: "plas" };
  ok(tab === (G[f] ?? "esf"), `etapa ${si + 1} ${f}: pestaña activa ${tab}`);
  filas.push(`${si + 1} ${f.padEnd(5)} ${plano ? "uniforme " + (r.planoNota ?? "").slice(0, 60) : `${r.vmin.toFixed(3)} … ${r.vmax.toFixed(3)} ${r.unit}`} · hover(30,4) ${h}`);
  if (["dx", "sz", "sx", "Edpl"].includes(f)) await p.screenshot({ path: `${out}/e${si + 1}_${f}.png` });
}
console.log(filas.join("\n"));
console.log("\nEtapa 1: geostático contra γ·z a mano (lejos del talud, corona z = 8, γ = 19, ν = 0.3 → K0 = 0.4286)");
for (const [x, z] of [[33, 6], [33, 2], [33, -2]]) {
  await set(0, "sz"); const sz = await hover(x, z); await set(0, "sx"); const sx = await hover(x, z); await set(0, "Edpl"); const ep = await hover(x, z);
  const prof = 8 - z, a = 19 * prof, K0 = 0.3 / 0.7;   // el visor muestra la COMPRESIÓN positiva (como GEO5)
  console.log(`   (${x}, ${z}) prof ${prof} m: σz ${sz} kPa (γ·z ${a.toFixed(1)}, dif ${(100 * (sz / a - 1)).toFixed(1)} %) · σx ${sx} (K0·σz ${(K0 * a).toFixed(1)}, dif ${(100 * (sx / (K0 * a) - 1)).toFixed(1)} %) · E_d,pl ${ep} %`);
  ok(Math.abs(sz / a - 1) < 0.05, `σz en (${x},${z}) a < 5 % de γ·z`); if (prof >= 6) ok(Math.abs(sx / (K0 * a) - 1) < 0.10, `σx en (${x},${z}) a < 10 % de K0·γ·z`);
}
{ await set(0, "dx"); const r = await p.evaluate(() => window.__lastRange); ok(r.vmax - r.vmin > 1e-6, `gravedad: etapa 1 d_x con mapa (peso propio ${r.vmin.toFixed(2)} … ${r.vmax.toFixed(2)} mm)`); console.log(`   gravedad, etapa 1 d_x: ${r.vmin.toFixed(2)} … ${r.vmax.toFixed(2)} mm`); await p.screenshot({ path: `${out}/e1_dx_gravedad.png` }); }
console.log("\nEstado inicial K0 (selector «Estado inicial»)");
await p.$eval("#inicial", (e) => { e.value = "k0"; e.dispatchEvent(new Event("change")); }); await wait(800);
await p.waitForFunction(() => document.getElementById("tipoSrm") && /^1\.\d{3}$/.test(document.getElementById("tipoSrm").textContent.trim()), { timeout: 300000 }); await wait(800);
for (const f of ["dx", "sx", "sz"]) { await set(0, f); const r = await p.evaluate(() => window.__lastRange), t = await p.evaluate(() => document.getElementById("hgeo").value.includes("inicial k0")); const h = await hover(33, 2); console.log(`   K0 etapa 1 ${f}: ${r.vmin.toFixed(2)} … ${r.vmax.toFixed(2)} ${r.unit}${r.planoNota ? " · " + r.planoNota.slice(0, 50) : ""} · hover(33,2) ${h}`); ok(t, "el .hgeo lleva «inicial k0»"); ok(Number.isFinite(h), `K0 ${f}: hover`); await p.screenshot({ path: `${out}/k0_e1_${f}.png` }); }
ok(/K0/.test(await p.$eval("#dstatus", (e) => e.textContent)), "aviso de K0 con superficie inclinada visible");
ok(errs.length === 0, "errores de página: " + errs.join(" · "));
await b.close(); console.log(bad ? `\n✗ ${bad} fallaron` : "\n✓ 48 combinaciones con mapa o explicación, hover en todas"); process.exit(bad ? 1 : 0);
