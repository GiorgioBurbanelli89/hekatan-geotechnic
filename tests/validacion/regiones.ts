// Diagnóstico: cuántos T6 tiene cada suelo tras mallar un .hgeo (y su centroide medio).  npx tsx tests/validacion/regiones.ts X.hgeo
import { readFileSync } from "node:fs";
import { parseHgeo } from "../../src/model/dsl";
import { meshSlope } from "../../src/mesh/mesher";
const { model } = meshSlope(parseHgeo(readFileSync(process.argv[2], "utf-8")), { topeMs: 300000, maxIter: 60000 });
const m = model as unknown as { X: number[]; Y: number[]; ELE: number[][]; EMAT: number[]; MATNAMES?: string[]; MAT: number[][] };
const acc: Record<number, { n: number; x: number; y: number; ymin: number; ymax: number }> = {};
m.ELE.forEach((e, k) => { const cx = (m.X[e[0]] + m.X[e[1]] + m.X[e[2]]) / 3, cy = (m.Y[e[0]] + m.Y[e[1]] + m.Y[e[2]]) / 3;
  const a = (acc[m.EMAT[k]] ??= { n: 0, x: 0, y: 0, ymin: 1e9, ymax: -1e9 }); a.n++; a.x += cx; a.y += cy; a.ymin = Math.min(a.ymin, cy); a.ymax = Math.max(a.ymax, cy); });
for (const [k, a] of Object.entries(acc)) console.log(`mat ${k} ${m.MATNAMES?.[+k - 1] ?? m.MATNAMES?.[+k] ?? ""} MAT=${JSON.stringify(m.MAT[+k - 1] ?? m.MAT[+k])} n=${a.n} centro=(${(a.x / a.n).toFixed(1)},${(a.y / a.n).toFixed(1)}) y∈[${a.ymin.toFixed(1)},${a.ymax.toFixed(1)}]`);
