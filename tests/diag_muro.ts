// DIAGNÓSTICO de un modelo con muro: dónde plastifica, cuánto se mueve y si el hormigón está bien conectado.
// Sirve para separar «el talud falla de verdad» de «la malla o el muro están mal»:
//   npx tsx tests/diag_muro.ts examples/muro_cantilever.hgeo
// Imprime las iteraciones del peldaño SRF=1, |u|máx y su nudo, los 12 elementos más plastificados con su
// centro y su material, y la caja y el nº de nudos del hormigón.
import { readFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
const def = parseHgeo(readFileSync(process.argv[2], "utf-8"));
const { model } = meshSlope(def);
const fem = await GeoFemWasm.create(model, (l) => { if (l.includes("SRM rs00") || l.includes("RS=0 ")) console.log(l); });
const r = fem.run(model)[0];
const NG = 7, epl = r.epl1!, u = r.u1!;
let umax = 0, iu = 0;
for (let i = 0; i < model.X.length; i++) { const m = Math.hypot(u[2*i], u[2*i+1]); if (m > umax) { umax = m; iu = i; } }
console.log(`FS=${r.fs.toFixed(4)}  |u|max=${(umax*1000).toFixed(1)} mm en (${model.X[iu].toFixed(2)}, ${model.Y[iu].toFixed(2)})`);
const filas = model.ELE.map((e, i) => {
  let n = 0; for (let q = 0; q < NG; q++) { const k = (i*NG+q)*4; n = Math.max(n, Math.hypot(epl[k], epl[k+1], epl[k+2], epl[k+3])); }
  const gx = (model.X[e[0]]+model.X[e[1]]+model.X[e[2]])/3, gy = (model.Y[e[0]]+model.Y[e[1]]+model.Y[e[2]])/3;
  return { i, n, gx, gy, m: model.EMAT[i] };
}).sort((a,b) => b.n - a.n);
console.log("elementos más plastificados (|ε_pl|, centro, material):");
for (const f of filas.slice(0, 12)) console.log(`  ${f.n.toExponential(2)}  (${f.gx.toFixed(2)}, ${f.gy.toFixed(2)})  ${def.soils[f.m-1].name}`);
const nplast = filas.filter(f => f.n > 1e-9).length;
console.log(`elementos plastificados: ${nplast} de ${model.ELE.length}`);
// muro: ¿está conectado? nudos del hormigón
const iM = def.soils.findIndex(s => s.rigido) + 1;
const nod = new Set<number>(); model.ELE.forEach((e,i) => { if (model.EMAT[i] === iM) for (const k of e) nod.add(k); });
console.log(`muro: ${model.ELE.filter((_,i)=>model.EMAT[i]===iM).length} T6, ${nod.size} nudos; z de ${Math.min(...[...nod].map(k=>model.Y[k])).toFixed(2)} a ${Math.max(...[...nod].map(k=>model.Y[k])).toFixed(2)}, x de ${Math.min(...[...nod].map(k=>model.X[k])).toFixed(2)} a ${Math.max(...[...nod].map(k=>model.X[k])).toFixed(2)}`);
