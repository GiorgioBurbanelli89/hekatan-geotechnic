// TIPOS DE TALUD = VARIANTES DEL MISMO TALUD (2-nov-2026) con puppeteer (headless):
//   node tests/check_tipos_talud.mjs [url] [outdir]
// 1) el talud base (Demo04 .hgeo) da su FS de siempre  2) cada tipo del selector modifica EL MISMO talud: conserva H, x pie, x cresta,
// estratos y suelos (y el FS del base no cambia al volver)  3) sliders con vista previa en vivo (fantasma gris + variante)  4) arrastrar un
// vértice → variante «puntos» sin perder el base  5) tramos por texto  6) perfil desde DXF (solo el terreno)  7) .hgeo v1 sigue abriendo.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = (process.argv[2] || "http://127.0.0.1:4713/") + "?v=" + Date.now(), out = process.argv[3] || "tests/shots/tipos_talud"; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1998, height: 1139 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
const idle = async () => { await wait(500); await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 240000 }); await wait(300); };
const fem = () => page.evaluate(() => window.__fem());
const tal = () => page.evaluate(() => window.__talud());
const hgeo = () => page.$eval("#hgeo", (e) => e.value);
let bad = 0; const ok = (c, t) => { console.log((c ? "  ✓ " : "  ✗ ") + t); if (!c) bad++; };
const yEn = (P, x) => { if (x <= P[0][0]) return P[0][1]; for (let i = 0; i + 1 < P.length; i++) if (x <= P[i + 1][0]) { const dx = P[i + 1][0] - P[i][0]; return dx < 1e-12 ? P[i + 1][1] : P[i][1] + ((x - P[i][0]) / dx) * (P[i + 1][1] - P[i][1]); } return P[P.length - 1][1]; };
const sobre = (T, p) => Math.abs(yEn(T, p[0]) - p[1]) < 2e-3;
const toPx = (x, z) => page.evaluate((x, z) => { const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height }; }, x, z);
const slider = async (id, v, soltar = true) => { await page.$eval("#" + id, (e, v) => { e.value = String(v); e.dispatchEvent(new Event("input", { bubbles: true })); }, v); await wait(150); if (soltar) { await page.$eval("#" + id, (e) => e.dispatchEvent(new Event("change", { bubbles: true }))); await wait(900); await idle(); } };

await page.goto(url, { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 240000 });
await page.select("#model", "hgeo"); await wait(800); await idle();

console.log("1) talud base (Demo04 .hgeo, malla 2.3)");
const B = await tal(), fsB = (await fem()).map((r) => r?.fs);
const pie = [B.param.xpie, B.param.zpie], cresta = B.base.find((p) => Math.abs(p[1] - (B.param.zpie + B.param.H)) < 1e-9);
ok(Math.abs(fsB[0] - 1.7149) < 1e-4, `FS etapa 1 del base = ${fsB[0]?.toFixed(4)} (1.7149 de siempre)`);
ok(!B.variante && !B.ghost && JSON.stringify(B.terreno) === JSON.stringify(B.base), "sin variante: terreno = base, sin fantasma");
await page.screenshot({ path: `${out}/0_base.png` });

console.log("2) cada tipo = el MISMO talud modificado");
const opts = await page.$$eval("#tipoTalud option", (o) => o.map((x) => x.value));
ok(opts.join(",") === "clasico,angulo,berma,dos_pendientes,curvo,terraplen,cuneta,tramos,puntos", `selector: ${opts.join(", ")}`);
const norma = (t) => t.split("\n").map((l) => l.replace(/#.*$/, "").replace(/\s+/g, " ").trim()).filter((l) => /^(suelo|interfaz|margenes|malla)/.test(l)).join("\n");
const suelos0 = norma(await hgeo());
const CONSERVA = { angulo: { pie: true, cresta: false }, berma: { pie: true, cresta: true }, dos_pendientes: { pie: true, cresta: true }, curvo: { pie: true, cresta: true }, terraplen: { pie: true, cresta: true }, cuneta: { pie: true, cresta: true }, tramos: { pie: true, cresta: false }, puntos: { pie: true, cresta: false } };
const fsVar = {};
for (const id of opts.filter((o) => o !== "clasico")) {
  await page.select("#tipoTalud", id); await wait(400); await idle();
  const t = await tal(), txt = await hgeo();
  ok(JSON.stringify(t.param) === JSON.stringify(B.param), `${id}: H, β, x pie, corona del base intactos`);
  ok(JSON.stringify(t.interfaces) === JSON.stringify(B.interfaces), `${id}: estratos intactos`);
  ok(norma(txt) === suelos0, `${id}: suelos, estratos, márgenes y malla del .hgeo iguales`);
  ok(new RegExp(`^talud xpie=11 zpie=-9 H=6\\.5 beta=33\\.024 corona=8\\.5 zfin=-4 beta2=28\\.61 tipo=${id}`, "m").test(txt), `${id}: .hgeo = talud base + tipo=${id}`);
  if (CONSERVA[id].pie) ok(sobre(t.terreno, pie), `${id}: pie (${pie}) sobre el terreno`);
  if (CONSERVA[id].cresta && id !== "angulo") ok(sobre(t.terreno, cresta), `${id}: cresta (${cresta.map((v) => +v.toFixed(2))}) sobre el terreno`);
  ok(!!t.ghost && t.ghost.length === B.base.length, `${id}: fantasma del base dibujado`);
  const f = (await fem()).map((r) => r?.fs); fsVar[id] = f[0];
  const tabla = await page.$eval("#varFs", (e) => e.textContent);
  ok(/base 1\.7149/.test(tabla), `${id}: tabla FS «${tabla}»`);
  await page.screenshot({ path: `${out}/tipo_${id}.png` });
}
console.log("      FS etapa 1:", JSON.stringify(fsVar));
await page.select("#tipoTalud", "clasico"); await wait(400); await idle();
const B2 = await tal(), fsB2 = (await fem()).map((r) => r?.fs);
ok(JSON.stringify(B2.terreno) === JSON.stringify(B.base) && !B2.ghost, "volver a «Base»: terreno del base exacto");
ok(Math.abs(fsB2[0] - fsB[0]) < 1e-9, `volver a «Base»: FS ${fsB2[0]?.toFixed(4)} = ${fsB[0]?.toFixed(4)} (no cambia)`);

console.log("3) sliders con vista previa en vivo (fantasma gris + variante en color)");
await page.select("#tipoTalud", "berma"); await wait(400); await idle();
await slider("gs_b", 3.5, false); await page.screenshot({ path: `${out}/vivo_berma_b35.png` });
const tv = await tal(); ok(tv.variante.p.b === 3.5 && sobre(tv.terreno, pie) && sobre(tv.terreno, cresta), "berma b=3.5 en vivo: pie y cresta quietos");
await page.$eval("#gs_b", (e) => e.dispatchEvent(new Event("change", { bubbles: true }))); await wait(900); await idle();
ok(/tipo=berma nb=1 b=3\.5/.test(await hgeo()), "al soltar: .hgeo reescrito (b=3.5) y recalculado");
await slider("gs_nb", 2); const t2 = await tal();
ok(t2.variante.p.nb === 2 && Math.abs(t2.variante.p.hb1 - 6.5 / 3) < 0.02 && Math.abs(t2.variante.p.hb2 - 13 / 3) < 0.02, `nb=2: cotas repartidas H/3, 2H/3 (${t2.variante.p.hb1}, ${t2.variante.p.hb2})`);
await page.screenshot({ path: `${out}/berma_2.png` });
await page.select("#tipoTalud", "terraplen"); await wait(400); await idle();
await slider("gs_lado", 1); const tp = await tal(); ok(tp.terreno.some((p) => p[0] < pie[0] + 0.5 && p[1] > pie[1] + 1) && !tp.terreno.some((p) => Math.abs(p[0] - pie[0]) < 1e-6 && Math.abs(p[1] - pie[1]) < 1e-6), "terraplén lado=1: contrafuerte al pie");
await page.screenshot({ path: `${out}/terraplen_pie.png` });

console.log("4) arrastrar un vértice → variante «por puntos» (el base sigue)");
await page.select("#tipoTalud", "dos_pendientes"); await wait(400); await idle();
const td = await tal(), vq = td.terreno.find((p) => p[0] > pie[0] + 0.5 && p[0] < cresta[0] - 0.5);
await page.click('.tb[data-tool="mover"]'); await wait(200);
const a = await toPx(vq[0], vq[1]), b = await toPx(vq[0] + 2, vq[1] - 1);
await page.mouse.move(a.px, a.py); await page.mouse.down(); await page.mouse.move((a.px + b.px) / 2, (a.py + b.py) / 2, { steps: 4 }); await page.mouse.move(b.px, b.py, { steps: 4 }); await page.mouse.up(); await wait(800); await idle();
const tm = await tal();
ok(tm.variante?.id === "puntos" && JSON.stringify(tm.param) === JSON.stringify(B.param), `vértice (${vq.map((v) => +v.toFixed(2))}) arrastrado: variante puntos y base intacto`);
ok(tm.terreno.some((p) => Math.abs(p[0] - Math.round(vq[0] + 2)) < 0.6 && Math.abs(p[1] - Math.round(vq[1] - 1)) < 0.6), "el vértice quedó donde se soltó (rejilla 1 m)");
ok(/tipo=puntos pts=/.test(await hgeo()) && (await page.$eval("#tipoTalud", (e) => e.value)) === "puntos", "selector y .hgeo en «puntos»");
await page.click('.tb[data-tool="ver"]'); await wait(200);
await page.screenshot({ path: `${out}/puntos_arrastre.png` });
await page.$eval("#varPts", (e) => { e.value = "0,-9\n11,-9\n13,-8\n16,-7\n18,-4\n21,-2.5\n29.5,-2.5\n32.25,-4\n40,-4"; }); await page.click("#varPtsOk"); await wait(900); await idle();
const tpt = await tal(); ok(tpt.terreno.some((p) => p[0] === 18 && p[1] === -4), "tabla de puntos aplicada");

console.log("5) por tramos (ángulo / H:V + Δz)");
await page.select("#tipoTalud", "tramos"); await wait(400); await idle();
await page.$eval("#varTr", (e) => { e.value = "1.5h/3\n45/2"; }); await page.click("#varTrOk"); await wait(900); await idle();
const tt = await tal(); ok(sobre(tt.terreno, [pie[0] + 4.5, pie[1] + 3]) && sobre(tt.terreno, [pie[0] + 6.5, pie[1] + 5]) && sobre(tt.terreno, cresta), "tramos 1.5H:1V·3 m + 45°·2 m + cierre a la cresta");
ok(/tipo=tramos tr=1\.5h\/3;45\/2/.test(await hgeo()), ".hgeo con tr=1.5h/3;45/2");
await page.screenshot({ path: `${out}/tramos.png` });

console.log("6) perfil desde DXF (solo la capa del terreno; estratos y suelos quedan)");
const lw = (capa, v) => `0\nLWPOLYLINE\n8\n${capa}\n90\n${v.length}\n70\n0\n` + v.map((p) => `10\n${p[0]}\n20\n${p[1]}\n`).join("");
const dxf = `0\nSECTION\n2\nENTITIES\n` + lw("TERRENO", [[0, -9], [11, -9], [15, -7], [17, -6.5], [21, -2.5], [40, -2.5]]) + lw("OTRA_COSA", [[0, -30], [40, -30]]) + `0\nENDSEC\n0\nEOF\n`;
await page.evaluate((d) => window.__perfilDxf(d, "perfil.dxf"), dxf); await wait(800); await idle();
const tx = await tal();
ok(tx.variante?.id === "puntos" && /DXF/.test(tx.variante.origen ?? "") && sobre(tx.terreno, [15, -7]) && JSON.stringify(tx.interfaces) === JSON.stringify(B.interfaces) && JSON.stringify(tx.param) === JSON.stringify(B.param), "perfil DXF = variante puntos; estratos y base intactos");
await page.screenshot({ path: `${out}/perfil_dxf.png` });

console.log("7) .hgeo del formato v1 (1-nov) sigue abriendo");
await page.$eval("#hgeo", (e) => { e.value = "margenes xmin=0 xmax=45 fondo=-24\ntalud tipo=berma\nsuelo ARENA E=60000 nu=0.3 phi=28 c=12 gamma=18\nasignar ARENA en 3,-12\nmalla 1.6\netapa peso propio\n"; }); await page.click("#apply"); await idle();
ok(/malla:/.test(await page.$eval("#edmsg", (e) => e.innerText)), "v1 `talud tipo=berma` → terreno por puntos, malla y FS");
console.log("errores JS:", errs.length, errs.slice(0, 3)); console.log(bad ? `✗ ${bad} fallos` : "✓ todo bien");
await browser.close(); process.exit(bad ? 1 : 0);
