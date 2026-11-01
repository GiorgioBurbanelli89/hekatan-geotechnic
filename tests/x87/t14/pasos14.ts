// Tanda 14: pasos de carga de SRF 1 (como t13/pasos13.ts) con solver14.ts, volcando el PG vigilado en cada commit del paso K.
// npx tsx tests/x87/t14/pasos14.ts [K=3] [E=520] [Q=2] [KMAX=K] [PRE]  -> t14/pg_k{K}_e{E}_q{Q}.json ; con PRE vuelca σ, εp tras cada paso
import { readFileSync, writeFileSync } from "node:fs";
import { GeoFem, GeoModel } from "./solver14";
const model = JSON.parse(readFileSync(new URL("../../../examples/geofem_muro_manabi_malla.json", import.meta.url), "utf-8")) as GeoModel;
const K = Number(process.argv[2] ?? 3), E = Number(process.argv[3] ?? 520), Q = Number(process.argv[4] ?? 2), KMAX = Number(process.argv[5] ?? K), PRE = process.argv[6];
(model as any).srmContinua = Number(process.env.T14_MODO ?? 115);
const g: any = new GeoFem(model, (l: string) => { if (/RS=/.test(l)) console.log(l); });
g.porPaso = false;
const F: Float64Array = model.recomputeGravity ? g.Fg2 : Float64Array.from(model.Fg);
(globalThis as any).T14REG = new Int8Array(g.ne * 7).fill(-1);
if (process.env.T14_ALT) { const [a, b] = process.env.T14_ALT.split(":"); (globalThis as any).T14ALT = { kk: new Set(a.split(",").map((x) => { const [e, q] = x.split(".").map(Number); return e * 7 + q; })), mode: Number(b) }; }
g.resetState(); const ndof = g.ndof, Fk = new Float64Array(ndof), u = new Float64Array(ndof);
(globalThis as any).T14FILOG = [];
for (let k = 1; k <= KMAX; k++) {
  (globalThis as any).T14K = k; (globalThis as any).T14C = 0;
  (globalThis as any).T14 = k === K ? { e: E, q: Q, log: [] } : null;
  if (k === K && process.env.T14_KV) (globalThis as any).T14KV = { rs: k, v: new Float64Array(readFileSync(process.env.T14_KV).buffer.slice(0)) };
  for (let d = 0; d < ndof; d++) Fk[d] = F[d] * k / 10;
  const tr: { u: Float64Array }[] = [];
  const [c, du] = g.nrstep(1.0, Fk, k, k === K ? tr : undefined, true);
  if (k === K) tr.forEach((t, i) => writeFileSync(new URL(`./it_k${K}_${i + 1}.bin`, import.meta.url), Buffer.from(Float64Array.from(t.u).buffer)));
  if (k === K) writeFileSync(new URL(`./pg_k${K}_e${E}_q${Q}.json`, import.meta.url), JSON.stringify((globalThis as any).T14.log));
  const KV = (globalThis as any).T14KV; if (k === K && KV && KV.kv) { writeFileSync(new URL(`./kv_k${K}.bin`, import.meta.url), Buffer.from(KV.kv.buffer)); writeFileSync(new URL(`./R_k${K}.bin`, import.meta.url), Buffer.from(KV.R.buffer)); }
  writeFileSync(new URL(`./filog.json`, import.meta.url), JSON.stringify((globalThis as any).T14FILOG));
  if (!c) { console.log("paso", k, "NO converge"); break; }
  for (let d = 0; d < ndof; d++) u[d] += du[d];
  if (PRE) {
    const out = (n: string) => new URL(`./${PRE}_k${k}_${n}.bin`, import.meta.url);
    writeFileSync(out("reg"), Buffer.from((globalThis as any).T14REG.buffer));
    writeFileSync(out("sig"), Buffer.from(Float64Array.from(g.SIG).buffer)); writeFileSync(out("epl"), Buffer.from(Float64Array.from(g.EPL).buffer)); writeFileSync(out("u"), Buffer.from(Float64Array.from(u).buffer));
  }
}
