// Misma malla de GEO5, presión nodal EXACTA de su InputFile (pore_pressure) en vez de nuestra regla del GWT: ¿cambia el FS?   npx tsx tests/talud_malla_geo5_pnodal.ts
import { readFileSync } from "node:fs";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
const base = JSON.parse(readFileSync("tests/data/geo5_talud_malla.json", "utf-8"));
const t = readFileSync("tests/data/geo5_talud_gwt_fase1_InputFile.txt", "latin1"), pn = new Float64Array(base.X.length);
const idx = new Map<number, number>(); let k0 = 0;   // los id de nudo del InputFile NO son contiguos (hasta 878 con 744 nudos): índice = orden de aparición
for (const m of t.matchAll(/^\s+(\d+) x=([-\dE.+]+) y=([-\dE.+]+)/gm)) { if (Math.abs(base.X[k0] - +m[2]) > 1e-9 || Math.abs(base.Y[k0] - +m[3]) > 1e-9) throw new Error("orden de nudos distinto en " + m[1]); idx.set(+m[1], k0++); }
for (const m of t.matchAll(/pore_pressure p=([-\dE.+]+) nodes=\[([\d,\- ]+)\]/g)) for (const tok of m[2].split(",")) { const [a, b] = tok.trim().split("-").map(Number); for (let n = a; n <= (b ?? a); n++) { const i = idx.get(n); if (i !== undefined) pn[i] = +m[1]; } }
const gsat = base.MAT.map(() => 20.5);
for (const [nombre, agua] of [["GWT regla propia", { gwt: [[0, -10], [12, -10], [22, -6], [40, -6]], gammaSat: gsat }], ["pNodal exacta de GEO5", { gwt: [], gammaSat: gsat, pNodal: Array.from(pn) }]] as const) {
  const m = { ...base, agua }; const fem = await GeoFemWasm.create(m); const r = fem.run(m);
  console.log(`${nombre.padEnd(24)} FS = ${r[r.length - 1].fs.toFixed(4)}`);
}
import { presionNodal } from "../src/geofem/agua";
const mm = { ...base, agua: { gwt: [[0, -10], [12, -10], [22, -6], [40, -6]], gammaSat: gsat } }, pr = presionNodal(mm as any, mm.agua as any);
let d = 0, k = -1, nz = 0; for (let i = 0; i < pn.length; i++) { if (Math.abs(pn[i] - pr[i]) > d) { d = Math.abs(pn[i] - pr[i]); k = i; } if (pn[i] > 0) nz++; }
console.log(`dif máx pNodal(GEO5) vs regla propia: ${d.toFixed(4)} kPa en nudo ${k + 1} (${base.X[k].toFixed(3)}, ${base.Y[k].toFixed(3)}); nudos con p>0: ${nz}`);
