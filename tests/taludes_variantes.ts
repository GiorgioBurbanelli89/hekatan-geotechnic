// TALUD BASE + VARIANTES (2-nov-2026): cada tipo modifica EL MISMO talud (Demo04 de GEO5), no dibuja otro.
//   npx tsx tests/taludes_variantes.ts [--sin-fs]
// Comprueba (a) cada variante conserva param (H, x pie, x cresta), márgenes, estratos (interfaces 2…) y, donde el tipo lo dice, el
// pie y la cresta sobre el terreno; (b) el talud base da el FS de siempre (1.7149 / 1.4810 / 1.6935, WASM, malla 2.3);
// (c) fuera de su ZONA cada variante deja el terreno EXACTO del base; (d) ida y vuelta .hgeo. Escribe tests/out/variantes.json
// (terrenos + FS) para los dibujos de docs/TALUDES_PARAMETRIZADOS.md (tools/dibujar_variantes.py).
import { writeFileSync, mkdirSync } from "node:fs";
import { parseHgeo, serializeHgeo, DEMO04_HGEO, remapearAlTerreno, type Pt, type SlopeDef } from "../src/model/dsl";
import { VARIANTES, baseGeom, yEn, terrainFromParam } from "../src/model/taludes";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFemWasm } from "../src/geofem/geofemWasm";

const conFs = !process.argv.includes("--sin-fs");
const FS_BASE = [1.7149, 1.4810, 1.6935];   // medido ANTES del cambio (registros/2026-11-02_geotechnic_taludes_misma_base.md)
let bad = 0; const ok = (c: boolean, t: string) => { if (!c) { bad++; console.log("  ✗ " + t); } else if (process.argv.includes("-v")) console.log("  ✓ " + t); };
const LINEA = DEMO04_HGEO.split("\n").find((l) => l.startsWith("talud "))!.replace(/#.*$/, "").trim();
const conTipo = (suf: string) => DEMO04_HGEO.replace(LINEA, LINEA + suf);

const CASOS: { nombre: string; suf: string; pie: boolean; cresta: boolean }[] = [
  { nombre: "base (clásico)", suf: "", pie: true, cresta: true },
  { nombre: "ángulo β′=40°", suf: " tipo=angulo betav=40", pie: true, cresta: false },
  { nombre: "berma b=2 a 3.25 m", suf: " tipo=berma nb=1 b=2 hb1=3.25", pie: true, cresta: true },
  { nombre: "2 bermas b=1.5", suf: " tipo=berma nb=2 b=1.5 hb1=2.17 hb2=4.33", pie: true, cresta: true },
  { nombre: "dos pendientes 45°/3.25 m", suf: " tipo=dos_pendientes hq=3.25 beta1=45", pie: true, cresta: true },
  { nombre: "cóncavo f=−1", suf: " tipo=curvo f=-1", pie: true, cresta: true },
  { nombre: "convexo f=+1", suf: " tipo=curvo f=1", pie: true, cresta: true },
  { nombre: "terraplén en corona 2 m", suf: " tipo=terraplen lado=0 Ht=2 bt=3 bf=30 dc=1", pie: true, cresta: true },
  { nombre: "contrafuerte al pie 2 m", suf: " tipo=terraplen lado=1 Ht=2 bt=2 bf=30", pie: false, cresta: true },
  { nombre: "cuneta d=1", suf: " tipo=cuneta d=1 fondo=1.5 bz=35 sep=0", pie: true, cresta: true },
  { nombre: "tramos 45°/3.25 + 25°/3.25", suf: " tipo=tramos tr=45/3.25;25/3.25", pie: true, cresta: false },
  { nombre: "tramos 1.5H:1V + 1H:1V", suf: " tipo=tramos tr=1.5h/3;1h/3.5", pie: true, cresta: false },
  { nombre: "puntos (cara quebrada)", suf: " tipo=puntos pts=0,-9;11,-9;14,-7.5;17,-6.5;21,-2.5;29.5,-2.5;32.25,-4;40,-4", pie: true, cresta: false },
];

const base = parseHgeo(DEMO04_HGEO), m = base.margins!, bg = baseGeom(base.param!, m.xmin, m.xmax);
const enT = (T: Pt[], p: Pt) => Math.abs(yEn(T, p[0]) - p[1]) < 1e-6;
ok(JSON.stringify(base.interfaces[0]) === JSON.stringify(terrainFromParam(base.param!, m.xmin, m.xmax)) && !base.variante, "base: terreno = terrainFromParam (el de siempre)");
console.log(`talud base: H=${bg.H} pie=(${bg.pie}) cresta=(${bg.cresta.map((v) => +v.toFixed(3))}) L=${bg.L.toFixed(3)}`);

type Fila = { nombre: string; suf: string; terreno: Pt[]; zona: [number, number]; fs: number[]; avisos: string[] };
const filas: Fila[] = [];
for (const c of CASOS) {
  const d = parseHgeo(conTipo(c.suf)), T = d.interfaces[0];
  const t = VARIANTES[d.variante?.id ?? "clasico"], zona = d.variante ? t.zona(bg, d.variante) : ([bg.pie[0], bg.pie[0]] as [number, number]);
  // (a) lo que se conserva
  ok(JSON.stringify(d.param) === JSON.stringify(base.param), `${c.nombre}: param del base (H, β, x pie, corona…) igual`);
  ok(JSON.stringify(d.margins) === JSON.stringify(base.margins), `${c.nombre}: márgenes iguales`);
  ok(JSON.stringify(d.interfaces.slice(1)) === JSON.stringify(base.interfaces.slice(1)), `${c.nombre}: estratos (interfaces 2…) iguales`);
  if (c.pie) ok(enT(T, bg.pie), `${c.nombre}: el pie (${bg.pie}) sigue sobre el terreno`);
  if (c.cresta) ok(enT(T, bg.cresta), `${c.nombre}: la cresta (${bg.cresta}) sigue sobre el terreno`);
  const zc = Math.max(...T.filter((p) => p[0] >= Math.min(zona[0], bg.pie[0]) - 1e-9 && p[0] <= Math.max(zona[1], bg.cresta[0]) + 1e-9).map((p) => p[1]));
  if (c.suf.includes("lado=0")) ok(Math.abs(zc - (bg.cresta[1] + 2)) < 1e-6, `${c.nombre}: corona del relleno a cresta+2`); else ok(Math.abs(zc - bg.cresta[1]) < 1e-6, `${c.nombre}: la cara llega a la misma cota de cresta (H = ${bg.H})`);
  for (let k = 1; k < T.length; k++) ok(T[k][0] >= T[k - 1][0] - 1e-9, `${c.nombre}: terreno y(x) (x creciente en ${k})`);
  // (c) fuera de la zona: terreno del base EXACTO
  const xs = [...new Set([...bg.terr.map((p) => p[0]), ...T.map((p) => p[0])])].concat(Array.from({ length: 81 }, (_, i) => m.xmin + (i * (m.xmax - m.xmin)) / 80));
  const fuera = xs.filter((x) => x < zona[0] - 1e-6 || x > zona[1] + 1e-6), dmax = Math.max(0, ...fuera.map((x) => Math.abs(yEn(T, x) - yEn(bg.terr, x))));
  ok(dmax < 1e-9, `${c.nombre}: fuera de la zona [${zona.map((v) => v.toFixed(2))}] el terreno = base (dif. máx ${dmax.toExponential(1)})`);
  if (d.variante) { const dent = Math.max(...xs.filter((x) => x >= zona[0] && x <= zona[1]).map((x) => Math.abs(yEn(T, x) - yEn(bg.terr, x)))); ok(dent > 1e-3, `${c.nombre}: DENTRO de la zona sí cambia (${dent.toFixed(3)} m)`); }
  // (d) ida y vuelta
  const d2 = parseHgeo(serializeHgeo(d));
  ok(Math.max(...T.map((p) => Math.abs(yEn(d2.interfaces[0], p[0]) - p[1]))) < 2e-3 && (d2.variante?.id ?? "") === (d.variante?.id ?? ""), `${c.nombre}: .hgeo ida y vuelta`);
  // como en la interfaz: los puntos de asignar, las sobrecargas y el ancla siguen al terreno nuevo
  const avisos = remapearAlTerreno(d, bg.terr);
  filas.push({ nombre: c.nombre, suf: c.suf, terreno: T, zona, fs: [], avisos });
  if (conFs) {
    const { model } = meshSlope(d);
    const fem = await GeoFemWasm.create(model, () => {});
    filas[filas.length - 1].fs = fem.run(model).map((r) => (r.steps.length ? r.fs : 0));   // 0 = falla ya con los parámetros reales (FS < 1)
  }
  const f = filas[filas.length - 1];
  console.log(`${c.nombre.padEnd(28)} FS ${f.fs.map((v) => (v ? v.toFixed(4) : "<1 ✖")).join(" / ") || "—"}${avisos.length ? "   · " + avisos.join(" · ") : ""}`);
}
if (conFs) {
  const fb = filas[0].fs;
  ok(fb.every((v, i) => Math.abs(v - FS_BASE[i]) < 1e-4), `(b) FS del talud base = ${FS_BASE.join(" / ")} (sale ${fb.map((v) => v.toFixed(4)).join(" / ")})`);
}
// el formato v1 (1-nov) sigue abriendo: talud distinto convertido a puntos
const v1 = parseHgeo("margenes xmin=0 xmax=45 fondo=-24\ntalud tipo=berma\nsuelo A E=60000 nu=0.3 phi=28 c=12 gamma=18\n");
ok(!v1.param && v1.interfaces[0].length > 5, "formato v1 `talud tipo=berma` (sin corona=) se abre como terreno por puntos");
// el muro de Manabí y los ejemplos con `talud …` clásico no cambian: sin `tipo=` el terreno es el de terrainFromParam
mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
writeFileSync(new URL("./out/variantes.json", import.meta.url), JSON.stringify({ base: bg.terr, pie: bg.pie, cresta: bg.cresta, margenes: m, interfaces: base.interfaces.slice(1), filas }, null, 1));
console.log(bad ? `✗ ${bad} fallos` : "✓ todo bien (variantes del mismo talud)");
process.exit(bad ? 1 : 0);
