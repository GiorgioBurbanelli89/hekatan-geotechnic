// El muro de Manabí CONSTRUIDO POR ETAPAS en Hekatan Geotechnic (motor WASM, sin navegador), para compararlo con GeoFEM y Abaqus.
//   npx tsx tools/etapas_muro_manabi.ts [examples/muro_manabi_etapas.hgeo]
// Saca, al final de cada etapa: desplazamiento de la coronación del muro (10.40, 0) y de la punta de la puntera, y la
// tensión vertical efectiva en el suelo justo bajo la zapata (z = −3.05), de la puntera al talón.
import { readFileSync, writeFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
import { stressField, nodalField, type FieldKind } from "../src/viewer/geo5scale";

const f = process.argv[2] ?? "examples/muro_manabi_etapas.hgeo";
const def = parseHgeo(readFileSync(f, "utf-8"));
const { model, stats } = meshSlope(def, { topeMs: 120000, maxIter: 40000 });
console.log(`malla: ${stats.nodes} nudos, ${stats.elements} T6, ángulo mínimo ${stats.minAngle.toFixed(1)}°`, stats.avisos);
const nudo = (x: number, y: number) => { let b = 0, d = 1e9; model.X.forEach((xx, i) => { const q = Math.hypot(xx - x, model.Y[i] - y); if (q < d) { d = q; b = i; } }); return b; };
const cor = nudo(10.40, 0), pie = nudo(10.42, -2.6), punta = nudo(9.28, -3);
// tensión vertical efectiva en el suelo bajo la zapata: media de los puntos de Gauss de los elementos cuyo centro cae en la franja
const XS = [9.3, 9.8, 10.3, 10.8, 11.3, 11.8, 12.3];
const fem = await GeoFemWasm.create(model, (l) => { if (l.includes("ETAPA")) console.log("  " + l.trim()); });
const salida: Record<string, unknown>[] = [];
let ultimo: import("../src/geofem/solver").StageResult | undefined;
fem.runStaged(model, (r, si) => {
  const sz = XS.map((x) => {
    let s = 0, n = 0;
    model.ELE.forEach((e, k) => {
      const gx = (model.X[e[0]] + model.X[e[1]] + model.X[e[2]]) / 3, gy = (model.Y[e[0]] + model.Y[e[1]] + model.Y[e[2]]) / 3;
      if (Math.abs(gx - x) < 0.3 && gy < -3.0 && gy > -3.35 && model.EMAT[k] !== 3) for (let q = 0; q < r.ngp / model.ELE.length; q++) { s += r.sig1![(k * 7 + q) * 4 + 1]; n++; }
    });
    return n ? -s / n : NaN;
  });
  const fila = { etapa: r.name, u_cor_x_mm: 1000 * r.u[2 * cor], u_cor_z_mm: 1000 * r.u[2 * cor + 1], u_pie_x_mm: 1000 * r.u[2 * pie], u_punta_z_mm: 1000 * r.u[2 * punta + 1], sz_bajo_zapata_kPa: sz };
  salida.push(fila); ultimo = r;
  { const per0 = Math.round(r.ngp / model.ELE.length); const Ed = stressField("Ed", model.ELE, model.X.length, r.ngp, r.sig1!, r.eps1!, r.epl1!); let mx = 0, im = 0; Ed.forEach((v, i) => { if (v > mx) { mx = v; im = i; } }); void per0; console.log(`    E_d máx ${mx.toFixed(3)} % en (${model.X[im].toFixed(2)}, ${model.Y[im].toFixed(2)})`); }
  console.log(`${String(si + 1).padStart(2)} ${r.name.padEnd(12)} coronación x ${fila.u_cor_x_mm.toFixed(2)} z ${fila.u_cor_z_mm.toFixed(2)} mm · pie x ${fila.u_pie_x_mm.toFixed(2)} · σz bajo zapata [${sz.map((v) => v.toFixed(1)).join(" ")}] kPa`);
});
// ---- las 12 variables de GeoFEM en la ÚLTIMA etapa: mínimo y máximo (convenio de GEO5; tensiones solo en el SUELO,
//      porque en GEO5 el muro es un cuerpo rígido y no entra en el mapa)
const ult = ultimo!;
const suelo = model.ELE.map((_, e) => model.EMAT[e] !== 3);
const Esuelo = model.ELE.filter((_, e) => suelo[e]);
const per = Math.round(ult.ngp / model.ELE.length);
const sub = (a: Float64Array) => { const b = new Float64Array(Esuelo.length * per * 4); let k = 0; model.ELE.forEach((_, e) => { if (suelo[e]) { b.set(a.subarray(e * per * 4, (e + 1) * per * 4), k); k += per * 4; } }); return b; };
const sS = sub(ult.sig1!), eS = sub(ult.eps1!), pS = sub(ult.epl1!);
const tocados = new Uint8Array(model.X.length); for (const e of Esuelo) for (const n of e) tocados[n] = 1;
const rangos: Record<string, [number, number]> = {};
for (const k of ["dx", "dz", "d", "sx", "sz", "sxt", "szt", "txz", "J", "u", "Ed", "Edpl"] as FieldKind[]) {
  const v = ["dx", "dz", "d"].includes(k) ? nodalField(ult.u, new Float64Array(ult.u.length), model.X.length, k) : stressField(k, Esuelo, model.X.length, Esuelo.length * per, sS, eS, pS);
  let mn = Infinity, mx = -Infinity; v.forEach((x, i) => { if (!["dx", "dz", "d"].includes(k) && !tocados[i]) return; mn = Math.min(mn, x); mx = Math.max(mx, x); });
  rangos[k] = [mn, mx]; console.log(`  ${k.padEnd(5)} ${mn.toFixed(2)} .. ${mx.toFixed(2)}`);
}
writeFileSync(f.replace(".hgeo", "_rangos.json"), JSON.stringify(rangos, null, 1));
writeFileSync(f.replace(".hgeo", "_resultados.json"), JSON.stringify({ nudos: stats.nodes, etapas: salida }, null, 1));
