// npx tsx tests/_malla_hgeo.ts archivo.hgeo [h]  → estadística de la malla
import { readFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
let txt = readFileSync(process.argv[2], "utf8");
if (process.argv[3]) txt = txt.replace(/malla [\d.]+/, `malla ${process.argv[3]}`);
const t0 = performance.now();
const { stats } = meshSlope(parseHgeo(txt));
console.log(stats.avisos.join(" | ")); console.log(`${stats.steiner} steiner, ${stats.elements} T6, ${stats.nodes} nudos, ángulo mín ${stats.minAngle.toFixed(1)}°, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
// los 6 peores triángulos
{
  const { model } = meshSlope(parseHgeo(txt));
  const { X, Y, ELE } = model;
  const ang = (a: number, b: number, c: number) => { const ux = X[b] - X[a], uy = Y[b] - Y[a], vx = X[c] - X[a], vy = Y[c] - Y[a]; return Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)) * 180 / Math.PI; };
  const r = ELE.map((e, i) => { const [a, b, c] = e; return [Math.min(ang(a, b, c), ang(b, c, a), ang(c, a, b)), i] as [number, number]; }).sort((p, q) => p[0] - q[0]);
  for (const [m, i] of r.slice(0, 6)) console.log(m.toFixed(2) + "°", ELE[i].slice(0, 3).map((n) => `(${X[n].toFixed(3)},${Y[n].toFixed(3)})`).join(" "));
}
