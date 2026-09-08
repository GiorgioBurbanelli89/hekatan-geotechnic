// Campos de tensión (SRF=1) en Node, motor TS y WASM: rango de σz,eff en nudos (promedio de los GP de cada elemento).
import { readFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFem } from "../src/geofem/solver";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
const def = parseHgeo(readFileSync(process.argv[2], "utf8"), {}); const { model } = meshSlope(def); const NG = 7;
for (const eng of ["ts", "wasm"] as const) {
  const fem = eng === "ts" ? new GeoFem(model) : await GeoFemWasm.create(model);
  fem.setLog(() => {});
  const r = fem.run(model, [0])[0];
  const nn = model.X.length, sum = new Float64Array(nn), cnt = new Float64Array(nn);
  for (let e = 0; e < model.ELE.length; e++) { let s = 0; for (let q = 0; q < NG; q++) s += r.sig1![(e * NG + q) * 4 + 1]; s /= NG; for (const n of model.ELE[e]) { sum[n] += s; cnt[n]++; } }
  let mn = Infinity, mx = -Infinity, epl = 0; for (let i = 0; i < nn; i++) { const v = -sum[i] / cnt[i]; mn = Math.min(mn, v); mx = Math.max(mx, v); }
  for (let k = 0; k < r.epl1!.length; k++) epl = Math.max(epl, Math.abs(r.epl1![k]));
  console.log(`${eng}: FS=${r.fs.toFixed(4)} σz,eff nodal ${mn.toFixed(2)} … ${mx.toFixed(2)} kPa (GEO5: -0.64 … 322.39) · |ε_pl|max=${epl.toExponential(2)} · ngp=${r.ngp}`);
}
