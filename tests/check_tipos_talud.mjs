// Tipos de talud parametrizados + DXF (importar / exportar) con puppeteer (headless):
//   node tests/check_tipos_talud.mjs [url] [outdir]
// 1) un PNG por tipo de talud (malla generada + FS por SRM)  2) el selector cambia de tipo y redibuja  3) los sliders de cada tipo
// 4) DXF ida y vuelta con dos tipos (exporta → importa → exporta: misma geometría)  5) un DXF hecho a mano (capas ajenas) con el diálogo de roles.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://127.0.0.1:4713/") + "?v=" + Date.now(), out = process.argv[3] || "tests/shots/tipos_talud"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1998, height: 1139 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
const idle = async () => { await wait(500); await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 240000 }); await wait(300); };
const fs = async () => (await page.$eval("#fs", (e) => e.innerText)).replace(/\n/g, " | ");
const msg = () => page.$eval("#edmsg", (e) => e.innerText);
const aplicar = async (txt) => { await page.$eval("#hgeo", (e, v) => { e.value = v; }, txt); await page.click("#apply"); await idle(); };
const set = async (id, v) => { await page.$eval("#" + id, (e, v) => { e.value = String(v); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }, v); await wait(900); await idle(); };
const ids = () => page.$$eval("#gsliders input[type=range]", (l) => l.map((e) => e.id.replace("gs_", "")).join(" "));
const poli = (dxf, capa) => { const m = dxf.split(/\r?\n/); const o = []; for (let i = 0; i < m.length; i++) if (m[i] === "VERTEX") { let j = i + 1, ly = "", x = NaN, y = NaN; for (; m[j] !== "0" && j < m.length; j += 2) { if (m[j] === "8") ly = m[j + 1]; if (m[j] === "10") x = +m[j + 1]; if (m[j] === "20") y = +m[j + 1]; } if (ly === capa) o.push([x, y]); } return o; };
const igual = (a, b) => a.length === b.length && a.every((p, k) => Math.hypot(p[0] - b[k][0], p[1] - b[k][1]) < 2e-3);
let bad = 0; const ok = (c, t) => { console.log((c ? "  ✓ " : "  ✗ ") + t); if (!c) bad++; };
const plantilla = (tipo, extra = "") => `# Talud tipo ${tipo}\nmargenes xmin=0 xmax=45 fondo=-24\ntalud tipo=${tipo}${extra}\nsuelo ARENA E=60000 nu=0.3 phi=28 c=12 gamma=18\nasignar ARENA en 3,-12\nmalla 1.6\netapa peso propio\n`;

await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 240000 });
await page.select("#model", "hgeo"); await wait(800);

console.log("1) un PNG por tipo");
const TIPOS = ["simple", "berma", "dos_pendientes", "curvo", "terraplen", "cuneta"];
for (const t of TIPOS) {
  await aplicar(plantilla(t));
  const m = await msg(), f = await fs();
  ok(/malla:/.test(m) && !/✖/.test(m), `${t}: ${m.slice(0, 95)}`); console.log("      FS:", f.slice(0, 90));
  await page.screenshot({ path: `${out}/tipo_${t}.png` });
}

console.log("2) el selector cambia de tipo (solo cambia la forma del talud)");
await aplicar(plantilla("simple"));
const antes = await page.$eval("#hgeo", (e) => e.value);
const opts = await page.$$eval("#tipoTalud option", (o) => o.map((x) => x.value).join(","));
ok(opts === "clasico,simple,berma,dos_pendientes,curvo,terraplen,cuneta", `selector con ${opts}`);
await page.select("#tipoTalud", "curvo"); await idle();
const despues = await page.$eval("#hgeo", (e) => e.value);
ok(/talud tipo=curvo/.test(despues) && /suelo ARENA/.test(despues) && /asignar ARENA/.test(despues), "tipo=curvo escrito en el .hgeo y el resto del modelo (suelo, asignar) queda igual");
console.log("      ", despues.split("\n").find((l) => l.startsWith("talud")));
await page.screenshot({ path: `${out}/selector_curvo.png` });
await page.select("#tipoTalud", "clasico"); await idle(); ok(/talud xpie=/.test(await page.$eval("#hgeo", (e) => e.value)), "«Clásico GEO5» vuelve al talud de siempre (talud xpie= …)");

console.log("3) sliders propios de cada tipo");
await aplicar(plantilla("berma", " nb=2"));
const s2 = await ids(); await set("gs_nb", 3); const s3 = await ids();
ok(!s2.includes("b3") && s3.includes("b3") && s3.includes("h4"), `berma: con nb=2 → [${s2}] · con nb=3 aparecen b3 y h4 → [${s3}]`);
await set("gs_b1", 5); ok(/b1=5/.test(await page.$eval("#hgeo", (e) => e.value)), "mover b1 reescribe el .hgeo"); await page.screenshot({ path: `${out}/berma_3bermas.png` });
await aplicar(plantilla("curvo")); const f0 = await page.$eval("#gs_f", (e) => e.value); await set("gs_f", 2); ok(f0 !== "2", `curvo: flecha ${f0} → 2 (convexo)`); await page.screenshot({ path: `${out}/curvo_convexo.png` });

console.log("4) DXF ida y vuelta (exporta → importa → exporta)");
for (const t of ["berma", "curvo"]) {
  await aplicar(plantilla(t)); const d1 = await page.evaluate(() => window.__dxf());
  await page.evaluate((d) => window.__abrirDxf(d, "ida_vuelta_" + "x"), d1); await idle(); await wait(800);
  const txt = await page.$eval("#hgeo", (e) => e.value), d2 = await page.evaluate(() => window.__dxf());
  const T1 = poli(d1, "TERRENO"), T2 = poli(d2, "TERRENO"), M1 = poli(d1, "MARGENES"), M2 = poli(d2, "MARGENES");
  ok(T1.length > 3 && igual(T1, T2), `${t}: TERRENO igual (${T1.length} vértices)`); ok(igual(M1, M2), `${t}: MARGENES igual`);
  ok(/asignar ARENA/.test(txt), `${t}: puntos ASIGNAR_ARENA importados`);
  writeFileSync(`${out}/ida_vuelta_${t}.dxf`, d1); await page.screenshot({ path: `${out}/dxf_ida_vuelta_${t}.png` });
}

console.log("5) DXF hecho a mano, capas ajenas → diálogo de roles");
const L = (a, b) => `0\nLINE\n8\nTOPO\n10\n${a[0]}\n20\n${a[1]}\n30\n0\n11\n${b[0]}\n21\n${b[1]}\n31\n0\n`;
const pts = [[0, -8], [12, -8], [20, -3], [26, -3], [45, -3]];
const lw = (capa, v) => `0\nLWPOLYLINE\n8\n${capa}\n90\n${v.length}\n70\n0\n` + v.map((p) => `10\n${p[0]}\n20\n${p[1]}\n`).join("");
const arco = `0\nARC\n8\nESTRATO2\n10\n22\n20\n-30\n30\n0\n40\n24\n50\n60\n51\n120\n`;
const mano = `0\nSECTION\n2\nENTITIES\n` + pts.slice(0, -1).map((p, i) => L(p, pts[i + 1])).join("") + lw("ESTRATO1", [[0, -14], [20, -12], [45, -13]]) + arco + `0\nENDSEC\n0\nEOF\n`;
await page.evaluate((d) => window.__abrirDxf(d, "a_mano"), mano); await wait(600);
const filas = await page.$$eval("#dxfDlg tr", (r) => r.length - 1); ok(filas === 3, `diálogo con ${filas} capas (TOPO, ESTRATO1, ESTRATO2)`);
const roles = await page.$$eval("#dxfDlg .dxfRol", (s) => s.map((x) => x.value).join(",")); console.log("      roles propuestos:", roles);
await page.screenshot({ path: `${out}/dxf_a_mano_dialogo.png` });
const capas = await page.$$eval("#dxfDlg tr td:first-child", (c) => c.map((x) => x.textContent).join(",")); ok(roles.split(",")[capas.split(",").indexOf("TOPO")] === "terreno", `propuesta: TOPO = terreno, ESTRATO1/2 = interfaz (capas ${capas})`);
await page.click("#dxfOk"); await idle(); await wait(500);
const t5 = await page.$eval("#hgeo", (e) => e.value), m5 = await msg();
ok(/interfaz 0,-8 /.test(t5) && /interfaz 0,-14/.test(t5) && (t5.match(/^interfaz /gm) || []).length === 3 && !(await page.$("#dxfDlg")), "terreno (4 LINE encadenadas) + interfaz (LWPOLYLINE) + interfaz (ARC discretizado) importados"); ok(/malla:/.test(m5), "malla: " + m5.slice(0, 80));
await page.screenshot({ path: `${out}/dxf_a_mano_resultado.png` });
// arrastrar y soltar: se simula con un DataTransfer real
await page.evaluate((d) => { const dt = new DataTransfer(); dt.items.add(new File([d], "soltado.dxf", { type: "application/dxf" })); document.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); }, mano);
await wait(700); ok(!!(await page.$("#dxfDlg")), "arrastrar y soltar un .dxf abre el diálogo"); await page.click("#dxfNo");
console.log("errores JS:", errs.length, errs.slice(0, 3)); console.log(bad ? `✗ ${bad} fallos` : "✓ todo bien");
await browser.close(); process.exit(bad ? 1 : 0);
