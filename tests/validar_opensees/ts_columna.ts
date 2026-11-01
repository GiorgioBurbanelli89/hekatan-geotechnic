// Caso 1 · columna elástica por gravedad (deformación plana, lados sin desplazamiento horizontal, base fija) con T6 de Hekatan Geotechnic.
// Exacto (edométrico): σy = −γ(H−y), σx = ν/(1−ν)·σy, u_y(cima) = −γH²/(2M),  M = E(1−ν)/((1+ν)(1−2ν)).
//   npx tsx tests/validar_opensees/ts_columna.ts tests/validar_opensees/ts_columna.json
import { writeFileSync } from "node:fs";
import { GeoFem, GeoModel, GP, t6 } from "../../src/geofem/solver";
const W = 2, H = 10, nx = 2, ny = 10, E = 20000, nu = 0.3, gam = 18;
const X: number[] = [], Y: number[] = [], id = (i: number, j: number) => j * (2 * nx + 1) + i;
for (let j = 0; j <= 2 * ny; j++) for (let i = 0; i <= 2 * nx; i++) { X.push(i * W / (2 * nx)); Y.push(j * H / (2 * ny)); }
const ELE: number[][] = [];
for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
  const a = id(2 * i, 2 * j), b = id(2 * i + 2, 2 * j), c = id(2 * i + 2, 2 * j + 2), d = id(2 * i, 2 * j + 2);
  ELE.push([a, b, c, id(2 * i + 1, 2 * j), id(2 * i + 2, 2 * j + 1), id(2 * i + 1, 2 * j + 1)]);
  ELE.push([a, c, d, id(2 * i + 1, 2 * j + 1), id(2 * i + 1, 2 * j + 2), id(2 * i, 2 * j + 1)]);
}
const nn = X.length, FIXED: number[] = [];
for (let n = 0; n < nn; n++) { if (X[n] === 0 || X[n] === W) FIXED.push(2 * n); if (Y[n] === 0) { FIXED.push(2 * n + 1); if (X[n] !== 0 && X[n] !== W) FIXED.push(2 * n); } }
const z = () => new Array(2 * nn).fill(0);
const m: GeoModel = { X, Y, ELE, EMAT: ELE.map(() => 1), FIXED, Fg: z(), Fs: z(), Fa: z(), MAT: [[E, nu, 30, 5, gam, 0]], recomputeGravity: true, stages: [{ name: "s", loads: ["Fg"] }] };
const fem = new GeoFem(m, () => {});
const u = fem.elasticSolve(fem.Fg2), sg = fem.elasticStress(u);
const M = E * (1 - nu) / ((1 + nu) * (1 - 2 * nu)), uTop = -gam * H * H / (2 * M);
const top = X.map((_, n) => n).filter((n) => Y[n] === H);
const uyTop = top.reduce((s, n) => s + u[2 * n + 1], 0) / top.length;
let dsy = 0, dsx = 0;
for (let e = 0; e < ELE.length; e++) for (let q = 0; q < 7; q++) {
  const k = e * 7 + q, ys = ELE[e].map((i) => Y[i]), Nf = t6(GP[q][0], GP[q][1])[0];
  const yg = Nf.reduce((s, v, i) => s + v * ys[i], 0), exy = -gam * (H - yg);
  dsy = Math.max(dsy, Math.abs(sg[k * 4 + 1] - exy)); dsx = Math.max(dsx, Math.abs(sg[k * 4] - nu / (1 - nu) * exy));
}
const r = { E, nu, gam, H, W, uy_cima: uyTop, uy_cima_exacto: uTop, sy_base_exacto: -gam * H, dif_sy_max: dsy, dif_sx_max: dsx, elementos: ELE.length, nudos: nn };
writeFileSync(process.argv[2], JSON.stringify(r));
console.log("Geotechnic (T6, %d elem): uy cima %s m (exacto %s) · dif σy máx %s kPa · dif σx máx %s kPa", ELE.length, uyTop.toFixed(6), uTop.toFixed(6), dsy.toExponential(2), dsx.toExponential(2));
