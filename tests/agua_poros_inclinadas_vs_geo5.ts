// «Pore pressure» de GEO5 con 3 isolíneas INCLINADAS no paralelas (u = 0 / 50 / 100 kPa) contra su propio InputFile (`pore_pressure` nodal, fase 1):
// confirma interpolación lineal en z por columna vertical, u = 0 sobre la isolínea más alta y u de la más baja bajo ella.   npx tsx tests/agua_poros_inclinadas_vs_geo5.ts
import { readFileSync } from "node:fs";
import { uPoros } from "../src/geofem/agua";
const t = readFileSync("tests/data/geo5_talud_poros_inclinadas_InputFile.txt", "latin1");
const nodes = new Map<number, [number, number]>();
for (const m of t.matchAll(/^\s+(\d+) x=([-\dE.+]+) y=([-\dE.+]+)/gm)) nodes.set(+m[1], [+m[2], +m[3]]);
const pp = new Map<number, number>();
for (const m of t.matchAll(/pore_pressure p=([-\dE.+]+) nodes=\[([\d,\- ]+)\]/g)) for (const tok of m[2].split(",")) { const [a, b] = tok.trim().split("-").map(Number); for (let n = a; n <= (b ?? a); n++) pp.set(n, +m[1]); }
const iso = [{ pts: [[0, -10], [40, -6]] as [number, number][], u: 0 }, { pts: [[0, -15], [40, -9]] as [number, number][], u: 50 }, { pts: [[0, -20], [40, -12]] as [number, number][], u: 100 }];
let mx = 0, suma = 0, peor = "";
for (const [n, [x, y]] of nodes) { const d = Math.abs((pp.get(n) ?? 0) - Math.max(0, uPoros(iso, x, y))); suma += d; if (d > mx) { mx = d; peor = `n${n} (${x.toFixed(3)}, ${y.toFixed(3)})`; } }
console.log(`nudos ${nodes.size} · con p ${pp.size} · dif máx ${mx.toFixed(4)} kPa en ${peor} · media ${(suma / nodes.size).toFixed(4)} kPa (rango 0-100)`);
if (mx > 0.1) { console.log("FALLA"); process.exit(1); } else console.log("OK (queda ≤0.07 kPa: GEO5 interpola sobre la malla, no exactamente en vertical)");
