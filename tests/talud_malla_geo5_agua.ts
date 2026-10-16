// Talud con agua SOBRE LA MALLA EXACTA DE GEO5 (744 nudos, 341 T6; del InputFile de su fase 1): FS seco / GWT / isolíneas contra GEO5 (1.98 / 1.76 / 1.74).
//   npx tsx tests/talud_malla_geo5_agua.ts [ts|wasm]
import { readFileSync } from "node:fs";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
import { GeoFem } from "../src/geofem/solver";
const motor = process.argv[2] || "wasm", base = JSON.parse(readFileSync("tests/data/geo5_talud_malla.json", "utf-8"));
const gsat = base.MAT.map(() => 20.5);   // γsat del ejemplo talud_gwt (γ = 18.5 → 20.5)
const GWT: [number, number][] = [[0, -10], [12, -10], [22, -6], [40, -6]];
const casos: [string, any, number][] = [
  ["seco", undefined, 1.98],
  ["GWT (perpendicular, γw=10)", { gwt: GWT, gammaSat: gsat }, 1.76],
  ["isolíneas paralelas (lineal en z)", { gwt: [], gammaSat: gsat, poros: [{ pts: GWT, u: 0 }, { pts: [[0, -24], [12, -24], [22, -20], [40, -20]], u: 137.34 }] }, 1.74],
];
console.log(`malla GEO5: ${base.X.length} nudos, ${base.ELE.length} T6, motor ${motor}`);
for (const [nombre, agua, geo5] of casos) {
  const m = { ...base, agua }; let fs = NaN; const log = (l: string) => { const k = /FS=([\d.]+)/.exec(l); if (k && l.includes(">>> FS")) fs = +k[1]; };
  const fem: any = motor === "ts" ? new GeoFem(m, log) : await GeoFemWasm.create(m, log);
  const r = fem.run(m); fs = r[r.length - 1].fs ?? fs;
  console.log(`${nombre.padEnd(36)} FS = ${fs.toFixed(4)}   GEO5 ${geo5.toFixed(2)}   dif ${(100 * (fs / geo5 - 1)).toFixed(2)} %`);
}
