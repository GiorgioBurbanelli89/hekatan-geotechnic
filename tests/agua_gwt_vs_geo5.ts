// El freático (GWT) de GEO5 contra su PROPIO InputFile: presión nodal `pore_pressure` de la fase 1 del talud (GWT 0,-10 12,-10 22,-6 40,-6), 744 nudos.
//   npx tsx tests/agua_gwt_vs_geo5.ts      (datos capturados el 16-oct-2026 del solver de GEO5 2024: tests/data/geo5_talud_gwt_fase1_InputFile.txt)
import { readFileSync } from "node:fs";
import { distGWT, GAMMA_W_GEO5 } from "../src/geofem/agua";
const t = readFileSync("tests/data/geo5_talud_gwt_fase1_InputFile.txt", "latin1");
const nodes = new Map<number, [number, number]>();
for (const m of t.matchAll(/^\s+(\d+) x=([-\dE.+]+) y=([-\dE.+]+)/gm)) nodes.set(+m[1], [+m[2], +m[3]]);
const gw = +/gamma_w=([-\dE.+]+)/.exec(t)![1], pp = new Map<number, number>();
for (const m of t.matchAll(/pore_pressure p=([-\dE.+]+) nodes=\[([\d,\- ]+)\]/g)) for (const tok of m[2].split(",")) { const [a, b] = tok.trim().split("-").map(Number); for (let n = a; n <= (b ?? a); n++) pp.set(n, +m[1]); }
const GWT: [number, number][] = [[0, -10], [12, -10], [22, -6], [40, -6]];
let mx = 0, fuera = 0, peor = "";
for (const [n, [x, y]] of nodes) { const d = Math.abs((pp.get(n) ?? 0) - GAMMA_W_GEO5 * distGWT(GWT, x, y)); if (d > mx) { mx = d; peor = `n${n} (${x.toFixed(3)}, ${y.toFixed(3)})`; } if (d > 1e-3) fuera++; }
console.log(`γw GEO5 = ${gw} (el código usa ${GAMMA_W_GEO5}) · nudos ${nodes.size} · con p ${pp.size} · fuera de 1e-3: ${fuera} · dif máx ${mx.toFixed(4)} kPa en ${peor}`);
if (gw !== GAMMA_W_GEO5 || fuera > 1) { console.log("FALLA"); process.exit(1); } else console.log("OK (el nudo que queda es el del quiebre saliente, ver agua.ts)");
