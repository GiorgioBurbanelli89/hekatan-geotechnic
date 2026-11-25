// Curva carga-asiento de un .hgeo con etapas de carga crecientes: asiento del nudo de la superficie más cercano
// a (x, y) en cada etapa y la «carga alcanzada» (GEO5: Attained loading). Escribe además el resultado en JSON.
//   npx tsx tests/curva_carga_asiento.ts examples/serquen_arcilla_cu5.hgeo 10 0 [salida.json]
import { readFileSync, writeFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
import { GeoFem } from "../src/geofem/solver";

const [file, xs, ys, out] = process.argv.slice(2);
const x0 = Number(xs ?? 10), y0 = Number(ys ?? 0);
const def = parseHgeo(readFileSync(file, "utf-8"));
const { model, stats } = meshSlope(def);
const X: ArrayLike<number> = (model as any).X, Y: ArrayLike<number> = (model as any).Y;
const nn = X.length;
let best = 0, dmin = Infinity;
for (let n = 0; n < nn; n++) { const d = Math.hypot(X[n] - x0, Y[n] - y0); if (d < dmin) { dmin = d; best = n; } }
console.log(`${file}: ${stats.elements} T6, ${stats.nodes} nudos; nudo de control ${best + 1} en (${X[best].toFixed(3)}, ${Y[best].toFixed(3)})`);
const fem: any = process.env.MOTOR === "ts" ? new GeoFem(model, () => {}) : await GeoFemWasm.create(model, () => {});
const res = fem.run(model);
const filas: any[] = [];
let q = 0;
for (const r of res) {
  const qEt = (def.stages.find((s) => s.name === r.name)?.surcharges ?? []).reduce((a, s) => a + s.q, 0);
  q += qEt * (r.alcanzada ?? 1);
  const uy = r.u ? 1000 * r.u[2 * best + 1] : NaN;
  filas.push({ etapa: r.name, q_kPa: q, q_tonf_m2: q / 9.80665, uy_mm: uy, alcanzada: r.alcanzada ?? 1 });
  console.log(`${r.name.padEnd(10)} q = ${(q / 9.80665).toFixed(2).padStart(6)} tonf/m²   uy = ${uy.toFixed(3).padStart(9)} mm   alcanzada ${(100 * (r.alcanzada ?? 1)).toFixed(1)} %`);
  if ((r.alcanzada ?? 1) < 0.999) { console.log("  → el suelo FALLA: Newton ya no encuentra equilibrio con más carga"); break; }
}
if (out) writeFileSync(out, JSON.stringify({ file, nudo: best + 1, filas }, null, 1));

