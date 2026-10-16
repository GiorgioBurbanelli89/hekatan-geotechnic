// Isolíneas de presión paralelas al freático (u=0 sobre el GWT, u=γw·14 a 14 m bajo él) = hidrostática del GWT: p nodal debe coincidir
// (salvo bajo 14 m del GWT, que no hay en este modelo) y el FS igual.   npx tsx tests/agua_poros_vs_gwt.ts
import { readFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { presionNodal } from "../src/geofem/agua";
const P = meshSlope(parseHgeo(readFileSync("examples/talud_poros_paralelo_gwt.hgeo", "utf-8"))).model;
const G = meshSlope(parseHgeo(readFileSync("examples/talud_gwt.hgeo", "utf-8"))).model;
const p1 = presionNodal(P, P.agua!), p2 = presionNodal(G, G.agua!);
let d = 0, mx = 0; for (let i = 0; i < p1.length; i++) { d = Math.max(d, Math.abs(p1[i] - p2[i])); mx = Math.max(mx, p2[i]); }
console.log(`nudos ${p1.length}  u_max GWT ${mx.toFixed(3)}  dif máx poros vs GWT ${d.toExponential(2)} kPa`);
