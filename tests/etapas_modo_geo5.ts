// Modo GEO5 (bit 32) en construccion por etapas: TS = WASM, sobre el muro de Manabi con agua (3 primeras fases).
//   npx tsx tests/etapas_modo_geo5.ts <modelo.json con srmContinua 32>
import { readFileSync } from "node:fs";
import { GeoFem, GeoModel } from "../src/geofem/solver";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
const m = JSON.parse(readFileSync(process.argv[2], "utf-8")) as GeoModel;
m.stages = m.stages.slice(0, Number(process.env.ETAPAS ?? 3));
const ts = new GeoFem(m).run(m), wa = (await GeoFemWasm.create(m)).run(m);
let ok = true;
ts.forEach((r, i) => { let ds = 0, smax = 0; for (let k = 0; k < r.sig1!.length; k++) { ds = Math.max(ds, Math.abs(r.sig1![k] - wa[i].sig1![k])); smax = Math.max(smax, Math.abs(wa[i].sig1![k])); }
  const b = ds <= 1e-7 * smax; ok &&= b; console.log(`${r.name}: dif sigma ${ds.toExponential(1)} kPa ${b ? "OK" : "DISTINTO"}`); });
console.log(ok ? "MODO GEO5: TS = WASM" : "MODO GEO5: TS != WASM"); if (!ok) process.exit(1);
