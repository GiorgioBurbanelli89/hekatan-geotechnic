// Tanda 14: retorno MC del motor (solver.ts) con incremento CERO desde la σ invertida del el. 520 PG 5 al final del paso 2.
import { GeoFem } from "./solver14";
const E = 25000, nu = 0.28, lam = E * nu / ((1 + nu) * (1 - 2 * nu)), G = E / (2 * (1 + nu));
const De = new Float64Array([lam + 2 * G, lam, lam, 0, lam, lam + 2 * G, lam, 0, lam, lam, lam + 2 * G, 0, 0, 0, 0, G]);
const st = [1.8819441e-03, 5.2889106e-03, 2.0078393e-03, -5.585402e-04].map(Number);
const out = new Float64Array(4), inf = { t2: 0, ix: [0, 1, 2], reg: 0 };
const reg = (GeoFem as any).mcReturn(st, De, 30 * Math.PI / 180, 0, 0, out, inf);
console.log("reg", reg, "ix", inf.ix, "out", Array.from(out).map((x) => x.toExponential(6)).join(" "));
