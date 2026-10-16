// Columna lejos del muro (x>26) de la construcción por etapas con GWT: σ'z efectiva por elemento vs la solución analítica 1D
// (γ sobre el freático, γsat−γw bajo él; el suelo de abajo con sus pesos).  npx tsx tests/etapas_agua_columna.ts <hgeo> [wasm|ts]
import { readFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
import { GeoFem } from "../src/geofem/solver";
const [f, motor = "wasm"] = process.argv.slice(2);
const { model } = meshSlope(parseHgeo(readFileSync(f, "utf-8")), { topeMs: 120000, maxIter: 40000 });
const fem: any = motor === "ts" ? new GeoFem(model, () => {}) : await GeoFemWasm.create(model);
const rs = fem.runStaged(model), r = rs[rs.length - 1], ne = model.ELE.length, per = Math.round(r.ngp / ne);
const a = model.agua, gw = a?.gammaW ?? 9.81;
// perfil analítico en x>26: capas por y (según los suelos asignados en el ejemplo: 0..-3 ARENA_SP, -3..-12 ARENA_SPSM), GWT en yw
const yw = a ? a.gwt[0][1] : -1e9, capa = (y: number) => y > -3 ? 0 : 1;
const g = [18.5, 17.5], gs = [20, 19];
const analit = (y: number) => { let s = 0, n = 400; const dz = (0 - y) / n; for (let i = 0; i < n; i++) { const z = -(i + 0.5) * dz, w = z < yw ? gs[capa(z)] - gw : g[capa(z)]; s += w * dz; } return -s; };
const filas: [number, number][] = [];
for (let e = 0; e < ne; e++) {
  const nd = model.ELE[e]; let cx = 0, cy = 0; for (const i of nd) { cx += model.X[i]; cy += model.Y[i]; } cx /= nd.length; cy /= nd.length;
  if (cx < 26) continue; let s = 0; for (let q = 0; q < per; q++) s += r.sig1[(e * per + q) * 4 + 1]; filas.push([cy, s / per]);
}
filas.sort((p, q) => q[0] - p[0]);
let mx = 0; const paso = Math.max(1, Math.floor(filas.length / 8));
for (let i = 0; i < filas.length; i += paso) { const [y, s] = filas[i], an = analit(y); mx = Math.max(mx, Math.abs(s - an)); console.log(`y=${y.toFixed(2).padStart(7)}  σ'z MEF=${s.toFixed(2).padStart(8)}  analítico=${an.toFixed(2).padStart(8)}  dif=${(s - an).toFixed(2)}`); }
console.log(`agua: ${a ? "sí" : "no"}  elementos x>26: ${filas.length}  difmáx(muestra)=${mx.toFixed(2)} kPa`);
