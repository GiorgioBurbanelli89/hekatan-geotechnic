// Suelo (1-based, orden de `suelo` en el .hgeo) en cada punto, con la asignación de regiones de GEOTECHNIC (malla propia,
// triángulo que contiene el punto). Sirve para dar a la malla estructurada del InputFile de GEO5 la MISMA asignación.
//   npx tsx tests/validacion/material_en_puntos.ts X.hgeo puntos.json  ->  stdout: [k1, k2, ...]   (puntos.json = [[x,z],...])
import { readFileSync } from "node:fs";
import { parseHgeo } from "../../src/model/dsl";
import { meshSlope } from "../../src/mesh/mesher";
const { model } = meshSlope(parseHgeo(readFileSync(process.argv[2], "utf-8")), { topeMs: 300000, maxIter: 60000 });
const m = model as unknown as { X: number[]; Y: number[]; ELE: number[][]; EMAT: number[] };
const P: [number, number][] = JSON.parse(readFileSync(process.argv[3], "utf-8"));
const bar = (e: number[], x: number, y: number) => {
  const [a, b, c] = e, d = (m.Y[b] - m.Y[c]) * (m.X[a] - m.X[c]) + (m.X[c] - m.X[b]) * (m.Y[a] - m.Y[c]);
  const l1 = ((m.Y[b] - m.Y[c]) * (x - m.X[c]) + (m.X[c] - m.X[b]) * (y - m.Y[c])) / d;
  const l2 = ((m.Y[c] - m.Y[a]) * (x - m.X[c]) + (m.X[a] - m.X[c]) * (y - m.Y[c])) / d;
  return Math.min(l1, l2, 1 - l1 - l2);                      // >= 0 dentro
};
const out = P.map(([x, y]) => {
  let best = -1, bv = -Infinity;
  m.ELE.forEach((e, k) => { const v = bar(e, x, y); if (v > bv) { bv = v; best = k; } });   // el más «dentro» (tolera bordes)
  return m.EMAT[best];
});
console.log(JSON.stringify(out));
