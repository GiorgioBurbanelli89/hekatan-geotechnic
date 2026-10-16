// ¿Está el FS del GWT en el borde de un peldaño de la escalera de reducción? FS al escalar la presión de poros ±: si salta un peldaño con 1-2 %, la diferencia con GEO5 (1.76 vs 1.7369) es ruido de convergencia.
//   npx tsx tests/talud_malla_geo5_sens.ts
import { readFileSync } from "node:fs";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
import { presionNodal } from "../src/geofem/agua";
const base = JSON.parse(readFileSync("tests/data/geo5_talud_malla.json", "utf-8")), gsat = base.MAT.map(() => 20.5);
const a0 = { gwt: [[0, -10], [12, -10], [22, -6], [40, -6]] as [number, number][], gammaSat: gsat }, p0 = presionNodal({ ...base, agua: a0 } as any, a0);
for (const f of [0.90, 0.95, 0.98, 1.00, 1.02, 1.05, 1.10]) {
  const agua = { gwt: [] as [number, number][], gammaSat: gsat, pNodal: Array.from(p0, (v) => v * f) }, m = { ...base, agua };
  const r = (await GeoFemWasm.create(m)).run(m); console.log(`p x ${f.toFixed(2)}  FS = ${r[r.length - 1].fs.toFixed(4)}`);
}
