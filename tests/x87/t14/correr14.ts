// Tanda 14 (copia solver14.ts, T14_R0): muro de Manabí (malla EXACTA de GeoFEM) con el MOTOR REAL (geofem.cpp → WASM, o solver.ts) en el modo GEO5 del muro.
// Sin semilla de GEO5: el estado de SRF 1 lo hace el propio motor (peso propio en pasos de 0.1, como la fase de GEO5 160224→160302).
// Escribe log14_<motor>_<bits>.txt (formato de cmp_log.py) y el estado de SRF 1: s14_<motor>_{sig,epl,eps,u}.bin (f64, PG en orden del motor).
//   npx tsx tests/x87/t13/correr13.ts [wasm|ts] [bits=115]
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { GeoFem, GeoModel } from "./solver14";
import { GeoFemWasm } from "../../../src/geofem/geofemWasm";
const engine = (process.argv[2] || "wasm") as "ts" | "wasm";
const bits = Number(process.argv[3] ?? 115);
const model = JSON.parse(readFileSync(new URL("../../../examples/geofem_muro_manabi_malla.json", import.meta.url), "utf-8")) as GeoModel;
(model as any).srmContinua = bits;
const lines: string[] = [];
const fem = engine === "wasm" ? await GeoFemWasm.create(model, (l: string) => lines.push(l)) : new GeoFem(model, (l: string) => lines.push(l));
const t0 = performance.now();
const r = fem.run(model, [0])[0];
const sec = (performance.now() - t0) / 1000;
console.log(`${engine} bits ${bits}: FS = ${r.fs.toFixed(6)}  (${sec.toFixed(1)} s)`);
const out = (n: string) => new URL(`./${n}`, import.meta.url);
writeFileSync(out(`log14_${engine}_${bits}.txt`), lines.join("\n") + "\n", "utf-8");
for (const [k, v] of [["sig", r.sig1], ["epl", r.epl1], ["eps", r.eps1], ["u", r.u1]] as const) if (v) writeFileSync(out(`s14_${engine}_${bits}_${k}.bin`), Buffer.from((v as Float64Array).buffer));
