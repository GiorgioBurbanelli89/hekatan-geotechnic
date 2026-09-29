// Construcción por etapas: el motor TS y el WASM tienen que dar lo mismo (muro de Manabí, malla gruesa para ir rápido).
//   npx tsx tests/etapas_ts_wasm.ts
import { readFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFem } from "../src/geofem/solver";
import { GeoFemWasm } from "../src/geofem/geofemWasm";

const def = parseHgeo(readFileSync("examples/muro_manabi_etapas.hgeo", "utf-8"));
def.h = 1.0;
const { model, stats } = meshSlope(def, { topeMs: 120000, maxIter: 40000 });
console.log(`malla ${stats.nodes} nudos, ${stats.elements} T6, ${model.stages.length} etapas`);
const ts = new GeoFem(model).run(model);
const wa = (await GeoFemWasm.create(model)).run(model);
let ok = true;
ts.forEach((r, i) => {
  const w = wa[i]; let du = 0, ds = 0, de = 0, umax = 0, smax = 0;
  for (let d = 0; d < r.u.length; d++) { du = Math.max(du, Math.abs(r.u[d] - w.u[d])); umax = Math.max(umax, Math.abs(w.u[d])); }
  for (let k = 0; k < r.sig1!.length; k++) { ds = Math.max(ds, Math.abs(r.sig1![k] - w.sig1![k])); smax = Math.max(smax, Math.abs(w.sig1![k])); de = Math.max(de, Math.abs(r.eps1![k] - w.eps1![k])); }
  const bien = du <= 1e-9 * Math.max(umax, 1e-3) + 1e-12 && ds <= 1e-7 * smax;
  ok &&= bien;
  console.log(`${r.name.padEnd(12)} |u| máx ${(umax * 1e3).toFixed(3)} mm  dif u ${du.toExponential(1)} m · dif σ ${ds.toExponential(1)} kPa · dif ε ${de.toExponential(1)}  ${bien ? "OK" : "DISTINTO"}`);
});
console.log(ok ? "ETAPAS: TS = WASM" : "ETAPAS: TS ≠ WASM"); if (!ok) process.exit(1);
