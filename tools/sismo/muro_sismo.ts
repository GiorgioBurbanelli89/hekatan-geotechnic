// Sismo SEUDOESTÁTICO del muro de Manabí en Hekatan Geotechnic (orden `sismo kh= kv=` del .hgeo).
//   npx tsx tools/sismo/muro_sismo.ts generar   → malla + carga (tests/datos/muro_sismo_malla.json) + .inp de Abaqus (capa 1)
//   npx tsx tools/sismo/muro_sismo.ts fs [h]    → factor de seguridad con peso + sismo (capa 2, no lineal, WASM)
// Capa 1 (lineal): SOLO la carga sísmica (kh·γ) sobre el modelo elástico, apoyos de GEO5 (base fija, lados u = 0).
// Árbitro: Abaqus/Standard *STATIC con *DLOAD BX = kh·γ por material en la MISMA región → u nudo a nudo (tests/sismo_muro.ts).
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHgeo } from "../../src/model/dsl";
import { meshSlope } from "../../src/mesh/mesher";
import { GeoFemWasm } from "../../src/geofem/geofemWasm";

const AQUI = dirname(fileURLToPath(import.meta.url));
const REPO = join(AQUI, "..", "..");
const DATOS = join(REPO, "tests", "datos");
const ABQ = join(REPO, "..", "hekatan-school", "VIDEOS", "serie_muro_manabi", "08_abaqus", "muro_sismo");
export const KH = -0.336, KV = 0;   // kh < 0: hacia −x, del relleno hacia la cara vista (el sentido desfavorable)

/** El muro que cumple (0.70 m delante), geometría calcada de GeoFEM; suelos del estudio (catálogo de GEO5). */
export function hgeo(h: number, conSismo = true): string {
  const zf = -2.3, xc = 10 + 0.15 * (-2.4 - zf) / 2.4;
  return [
    "margenes xmin=0 xmax=30 fondo=-12",
    `interfaz 0,${zf} ${xc.toFixed(5)},${zf} 10.15,0 30,0`,
    "interfaz 0,-3 30,-3",
    "suelo ARENA_SP    E=25000 nu=0.28 phi=30 c=0 gamma=18.5",
    "suelo ARENA_SPSM  E=15500 nu=0.30 phi=29.97 c=0 gamma=17.5",
    "suelo HORMIGON    E=21166510 nu=0.2 phi=0 c=0 gamma=23 rigido=1",
    "asignar HORMIGON en 10.25,-1.2", "asignar ARENA_SP en 20,-1.5", `asignar ARENA_SP en 5,${zf - 0.3}`, "asignar ARENA_SPSM en 15,-8",
    `linea 9.28,-3 9.30,-2.6 9.98,-2.6 ${xc.toFixed(5)},${zf}`,
    "linea 10.40,0 10.42,-2.6 12.30,-2.6 12.32,-3",
    `malla ${h}`, "etapa peso propio", ...(conSismo ? [`sismo kh=${KH} kv=${KV}`] : []),
  ].join("\n");
}

function generar() {
  const h = 0.8, def = parseHgeo(hgeo(h));
  const { model, stats } = meshSlope(def, { topeMs: 300000, maxIter: 40000 });
  const L = model.loads!.L2;   // la carga sísmica sola (etapa «+sismo»)
  let sx = 0, sy = 0; for (let i = 0; i < L.length; i += 2) { sx += L[i]; sy += L[i + 1]; }
  // región: elementos con carga (los de lado medio con fuerza)
  const borde = h, xs = model.X, ys = model.Y;
  const reg = model.ELE.map((el) => { const gx = (xs[el[0]] + xs[el[1]] + xs[el[2]]) / 3, gy = (ys[el[0]] + ys[el[1]] + ys[el[2]]) / 3; return gx >= borde && 30 - gx >= borde && gy + 12 >= borde; });
  console.log(`malla h=${h}: ${stats.nodes} nudos, ${stats.elements} T6 · región sísmica ${reg.filter(Boolean).length} T6 (borde ${borde} m) · ΣFx = ${sx.toFixed(4)} kN, ΣFy = ${sy.toFixed(4)} kN`);
  mkdirSync(DATOS, { recursive: true });
  writeFileSync(join(DATOS, "muro_sismo_malla.json"), JSON.stringify({ X: xs, Y: ys, ELE: model.ELE, EMAT: model.EMAT, FIXED: model.FIXED, MAT: model.MAT, MATNAMES: model.MATNAMES, RIGID: model.RIGID, Fsis: L, REGION: reg, kh: KH, kv: KV, borde }));
  // .inp de Abaqus
  mkdirSync(ABQ, { recursive: true });
  const I = ["*HEADING", "Muro de Manabi: carga sismica seudoestatica sola, lineal, CPE6, misma malla que Geotechnic (kN, m)", "*PREPRINT, ECHO=NO, MODEL=NO, HISTORY=NO, CONTACT=NO", "*NODE"];
  xs.forEach((x, i) => I.push(`${i + 1}, ${x.toPrecision(15)}, ${ys[i].toPrecision(15)}`));
  const nom = ["SP", "SPSM", "HORMIGON"];
  for (let k = 0; k < 3; k++) { I.push(`*ELEMENT, TYPE=CPE6, ELSET=E_${nom[k]}`); model.ELE.forEach((e, i) => { if (model.EMAT[i] === k + 1) I.push(`${i + 1}, ${e.map((n) => n + 1).join(", ")}`); }); }
  for (let k = 0; k < 3; k++) {
    const M = model.MAT[k], ids = model.ELE.map((_, i) => i).filter((i) => model.EMAT[i] === k + 1 && reg[i]);
    I.push(`*ELSET, ELSET=R_${nom[k]}`); for (let j = 0; j < ids.length; j += 16) I.push(ids.slice(j, j + 16).map((i) => i + 1).join(", "));
    I.push(`*SOLID SECTION, ELSET=E_${nom[k]}, MATERIAL=${nom[k]}`, "1.0,", `*MATERIAL, NAME=${nom[k]}`, "*ELASTIC", `${M[0]}, ${M[1]}`);
  }
  const base: number[] = [], lados: number[] = [];
  for (let i = 0; i < xs.length; i++) { const fx = model.FIXED.includes(2 * i), fy = model.FIXED.includes(2 * i + 1); if (fx && fy) base.push(i); else if (fx) lados.push(i); }
  for (const [nm, ns] of [["BASE", base], ["LADOS", lados]] as [string, number[]][]) { I.push(`*NSET, NSET=${nm}`); for (let j = 0; j < ns.length; j += 16) I.push(ns.slice(j, j + 16).map((n) => n + 1).join(", ")); }
  I.push("*BOUNDARY", "BASE, 1, 2", "LADOS, 1, 1", "*STEP, NAME=SISMO", "*STATIC", "*DLOAD");
  for (let k = 0; k < 3; k++) I.push(`R_${nom[k]}, BX, ${(KH * model.MAT[k][4]).toPrecision(15)}`);
  if (KV) for (let k = 0; k < 3; k++) I.push(`R_${nom[k]}, BY, ${(-KV * model.MAT[k][4]).toPrecision(15)}`);
  I.push("*OUTPUT, FIELD", "*NODE OUTPUT", "U, RF", "*END STEP");
  writeFileSync(join(ABQ, "muro_sismo.inp"), I.join("\r\n") + "\r\n");
  console.log(`.inp → ${join(ABQ, "muro_sismo.inp")}`);
}

async function fs(h: number) {
  const out: string[] = [];
  for (const conSismo of [false, true]) {
    const def = parseHgeo(hgeo(h, conSismo));
    const { model, stats } = meshSlope(def, { topeMs: 300000, maxIter: 40000 });
    const t0 = performance.now(), pel: string[] = [];
    const fem = await GeoFemWasm.create(model, (l) => { if (l.includes("SRM rs")) pel.push(l.trim()); });
    const r = fem.run(model);
    const last = r[r.length - 1];
    const rs00 = pel.filter((l) => l.includes("rs00")), srf1 = rs00[rs00.length - 1]?.includes("CONVERGE") ? "converge" : "NO converge";
    const lin = `h=${h} ${conSismo ? `peso + sismo kh=${KH}` : "peso propio"}: ${stats.nodes} nudos, ${stats.elements} T6 · FS = ${last.fs.toFixed(4)} · SRF=1 ${srf1} · ${((performance.now() - t0) / 1000).toFixed(1)} s`;
    console.log(lin);
    out.push(lin, ...pel.map((l) => "    " + l));
  }
  writeFileSync(join(AQUI, `muro_sismo_fs_h${h}.txt`), out.join("\n") + "\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const que = process.argv[2] ?? "generar";
  if (que === "generar") generar(); else await fs(+(process.argv[3] ?? 0.8));
}
