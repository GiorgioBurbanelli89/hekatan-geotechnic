// Tanda 13: los 10 pasos de carga (0.1) del estado de SRF 1 con solver.ts en modo 115 (= WASM), volcando σ, εp y u tras CADA paso
// (p13_k{1..10}_{sig,epl,u}.bin) para compararlos con los Restart_Step de GEO5 160230 … 160302 (cmp_pasos.py).
// Misma lógica que nrstepPasos (sin porPaso en modo GEO5 del muro).   npx tsx tests/x87/t13/pasos13.ts
import { readFileSync, writeFileSync } from "node:fs";
import { GeoFem, GeoModel } from "../../../src/geofem/solver";
const model = JSON.parse(readFileSync(new URL("../../../examples/geofem_muro_manabi_malla.json", import.meta.url), "utf-8")) as GeoModel;
(model as any).srmContinua = Number(process.argv[2] ?? 115); const KMAX = Number(process.argv[3] ?? 10), PRE = process.argv[4] ?? "p13";
const g: any = new GeoFem(model, (l: string) => { if (/RS=|tensiones/.test(l)) console.log(l); });
g.porPaso = false;
const F: Float64Array = model.recomputeGravity ? g.Fg2 : Float64Array.from(model.Fg);
g.resetState(); const ndof = g.ndof, u = new Float64Array(ndof), Fk = new Float64Array(ndof);
for (let k = 1; k <= KMAX; k++) {
  for (let d = 0; d < ndof; d++) Fk[d] = F[d] * k / 10;
  const [c, du] = g.nrstep(1.0, Fk, k, undefined, true);
  if (!c) { console.log("paso", k, "NO converge"); break; }
  for (let d = 0; d < ndof; d++) u[d] += du[d];
  const out = (n: string) => new URL(`./${PRE}_k${k}_${n}.bin`, import.meta.url);
  writeFileSync(out("sig"), Buffer.from(Float64Array.from(g.SIG).buffer)); writeFileSync(out("epl"), Buffer.from(Float64Array.from(g.EPL).buffer)); writeFileSync(out("u"), Buffer.from(Float64Array.from(u).buffer));
}
