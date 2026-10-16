// «Pore pressure» por isolíneas de GEO5 = interpolación LINEAL EN z (vertical) entre isolíneas: dos isolíneas paralelas al freático
// (u=0 sobre el GWT, u=137.34 a 14 m bajo él) dan u = 137.34/14 · profundidad vertical. (El GWT de GEO5, en cambio, mide la distancia
// PERPENDICULAR y usa γw=10: ver tests/agua_gwt_vs_geo5.ts.)   npx tsx tests/agua_poros_vs_gwt.ts
import { readFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { presionNodal, yGWT } from "../src/geofem/agua";
const P = meshSlope(parseHgeo(readFileSync("examples/talud_poros_paralelo_gwt.hgeo", "utf-8"))).model;
const p = presionNodal(P, P.agua!), gwt: [number, number][] = [[0, -10], [12, -10], [22, -6], [40, -6]];
let d = 0; for (let i = 0; i < p.length; i++) { const h = Math.min(14, yGWT(gwt, P.X[i]) - P.Y[i]); d = Math.max(d, Math.abs(p[i] - (h > 0 ? 137.34 / 14 * h : 0))); }
console.log(`nudos ${p.length}  dif máx isolíneas vs lineal en z ${d.toExponential(2)} kPa`, d < 1e-9 ? "OK" : "FALLA");
