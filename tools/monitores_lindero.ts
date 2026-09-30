// Monitores de punto del muro de lindero (los mismos 9 que en GeoFEM), al final de cada etapa, con el convenio de GEO5:
// d_x + hacia la IZQUIERDA, d_z + en ASIENTO; σ total (sin agua) + en compresión.
//   npx tsx tools/monitores_lindero.ts
import { readFileSync, writeFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFemWasm } from "../src/geofem/geofemWasm";

const f = "examples/muro_lindero_etapas_mc.hgeo";
const { model } = meshSlope(parseHgeo(readFileSync(f, "utf-8")), { topeMs: 120000, maxIter: 40000 });
const P: [number, number][] = [[10.4, 0], [10.0, -3.9], [13.25, -3.9], [5, -3.1], [20, -3.5], [20, 0], [18, 1.0], [24, 2.9], [20, -8]];
const { X, Y, ELE } = model;
// elemento que contiene el punto (el de hormigón, si cae en el borde, se descarta: GEO5 no da tensiones en el rígido) y coordenadas de área
const donde = P.map(([x, y]) => {
  let best: { e: number; L: number[] } | null = null;
  ELE.forEach((e, k) => {
    const [a, b, c] = e, d = (Y[b] - Y[c]) * (X[a] - X[c]) + (X[c] - X[b]) * (Y[a] - Y[c]);
    const l1 = ((Y[b] - Y[c]) * (x - X[c]) + (X[c] - X[b]) * (y - Y[c])) / d, l2 = ((Y[c] - Y[a]) * (x - X[c]) + (X[a] - X[c]) * (y - Y[c])) / d, l3 = 1 - l1 - l2;
    if (Math.min(l1, l2, l3) >= -1e-9 && (!best || model.EMAT[best.e] === 3)) best = { e: k, L: [l1, l2, l3] };
  });
  return best!;
});
const N = (L: number[]) => [L[0] * (2 * L[0] - 1), L[1] * (2 * L[1] - 1), L[2] * (2 * L[2] - 1), 4 * L[0] * L[1], 4 * L[1] * L[2], 4 * L[2] * L[0]];
const fem = await GeoFemWasm.create(model);
const filas: Record<string, unknown>[] = [];
fem.runStaged(model, (r) => {
  const per = Math.round(r.ngp / ELE.length);
  const v = donde.map(({ e, L }) => {
    const n = N(L); let ux = 0, uz = 0; ELE[e].forEach((nd, i) => { ux += n[i] * r.u[2 * nd]; uz += n[i] * r.u[2 * nd + 1]; });
    let sx = 0, sz = 0; for (let q = 0; q < per; q++) { sx += r.sig1![(e * per + q) * 4]; sz += r.sig1![(e * per + q) * 4 + 1]; }
    return { dz: -1000 * uz, dx: -1000 * ux, sz: -sz / per, sx: -sx / per };
  });
  filas.push({ etapa: r.name, v });
  console.log(r.name.padEnd(11), v.map((q) => `${q.dz.toFixed(1)}/${q.dx.toFixed(1)}`).join("  "));
});
const ult = (filas[filas.length - 1] as { v: { dz: number; dx: number; sz: number; sx: number }[] }).v;
console.log("\nfinal (dz / dx mm · σz / σx kPa, media del elemento):");
P.forEach((p, i) => console.log(`  ${i + 1} (${p[0]}, ${p[1]}): ${ult[i].dz.toFixed(1)} / ${ult[i].dx.toFixed(1)} · ${ult[i].sz.toFixed(2)} / ${ult[i].sx.toFixed(2)}`));
writeFileSync("examples/muro_lindero_monitores_geotechnic.json", JSON.stringify({ puntos: P, etapas: filas }, null, 1));
