// Agua (GWT): columna con lados sin desplazamiento horizontal y base fija. Con el nivel freático sobre una arista de elementos
// la tensión EFECTIVA vertical es exacta: σ'y(y) = −[γ·(H−yw) + (γsat−γw)·(yw−y)] bajo el GWT y −γ·(H−y) sobre él.
//   npx tsx tests/agua_columna.ts
import { GeoFem, GeoModel } from "../src/geofem/solver";
import { cargaAgua } from "../src/geofem/agua";
const W = 2, H = 4, nx = 2, ny = 4, yw = 2, gam = 18, gsat = 20, gw = 9.81;
const X: number[] = [], Y: number[] = [], id = (i: number, j: number) => j * (2 * nx + 1) + i;
for (let j = 0; j <= 2 * ny; j++) for (let i = 0; i <= 2 * nx; i++) { X.push(i * W / (2 * nx)); Y.push(j * H / (2 * ny)); }
const ELE: number[][] = [];
for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
  const a = id(2 * i, 2 * j), b = id(2 * i + 2, 2 * j), c = id(2 * i + 2, 2 * j + 2), d = id(2 * i, 2 * j + 2);
  ELE.push([a, b, c, id(2 * i + 1, 2 * j), id(2 * i + 2, 2 * j + 1), id(2 * i + 1, 2 * j + 1)]);   // CCW: a,b,c
  ELE.push([a, c, d, id(2 * i + 1, 2 * j + 1), id(2 * i + 1, 2 * j + 2), id(2 * i, 2 * j + 1)]);   // CCW: a,c,d
}
const nn = X.length, FIXED: number[] = [];
for (let n = 0; n < nn; n++) { if (X[n] === 0 || X[n] === W) FIXED.push(2 * n); if (Y[n] === 0) { FIXED.push(2 * n + 1); if (X[n] !== 0 && X[n] !== W) FIXED.push(2 * n); } }
const z = () => new Array(2 * nn).fill(0);
const m: GeoModel = { X, Y, ELE, EMAT: ELE.map(() => 1), FIXED, Fg: z(), Fs: z(), Fa: z(), MAT: [[30000, 0.3, 30, 5, -gam, 0]], stages: [{ name: "s", loads: ["Fg"] }] };
const ag = { gwt: [[0, yw], [W, yw]] as [number, number][], gammaSat: [gsat], gammaW: gw };
const { Fg, Fp } = cargaAgua(m, ag);
m.Fg = Array.from(Fg);
const fem = new GeoFem(m, () => {});
const F = new Float64Array(2 * nn); for (let d = 0; d < F.length; d++) F[d] = Fg[d] + Fp[d];
const u = fem.elasticSolve(F), sg = fem.elasticStress(u);
// punto de Gauss → y global, comparar σ'y con la fórmula
const GP = [[1 / 3, 1 / 3]]; void GP;
let dmax = 0, n = 0;
for (let e = 0; e < ELE.length; e++) for (let q = 0; q < 7; q++) {
  const k = e * 7 + q, sy = sg[k * 4 + 1];
  // y del punto de Gauss con las funciones de forma: se toma de dJw/B no disponibles → se recalcula
  const nd = ELE[e]; const ys = nd.map((i) => Y[i]);
  const gp = [[1 / 3, 1 / 3], [0.101286507323456, 0.101286507323456], [0.797426985353087, 0.101286507323456], [0.101286507323456, 0.797426985353087], [0.470142064105115, 0.470142064105115], [0.059715871789770, 0.470142064105115], [0.470142064105115, 0.059715871789770]][q];
  const L1 = gp[0], L2 = gp[1], L3 = 1 - L1 - L2;
  const N = [L1 * (2 * L1 - 1), L2 * (2 * L2 - 1), L3 * (2 * L3 - 1), 4 * L1 * L2, 4 * L2 * L3, 4 * L3 * L1];
  const yg = N.reduce((s, v, i) => s + v * ys[i], 0);
  const ex = yg >= yw ? -gam * (H - yg) : -(gam * (H - yw) + (gsat - gw) * (yw - yg));
  dmax = Math.max(dmax, Math.abs(sy - ex)); n++;
}
console.log(`σ'y efectiva: ${n} puntos de Gauss, dif. máx con la solución exacta = ${dmax.toExponential(2)} kPa (base exacta ${(-(gam * 2 + (gsat - gw) * 2)).toFixed(3)})`);
process.exit(dmax < 1e-6 ? 0 : 1);
