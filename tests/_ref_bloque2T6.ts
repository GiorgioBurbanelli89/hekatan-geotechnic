// Referencia del ejemplo didáctico de Math Studio «Los elementos finitos de Geotechnic paso a paso»: bloque de 4×2 m con 2 T6, base fija, gravedad.
//   npx tsx tests/_ref_bloque2T6.ts
import { GeoFem, GeoModel, GP } from "../src/geofem/solver";

const X = [0, 4, 4, 0, 2, 4, 2, 2, 0], Y = [0, 0, 2, 2, 0, 1, 1, 2, 1];   // nudos 1..9
const ELE = [[0, 1, 2, 4, 5, 6], [0, 2, 3, 6, 7, 8]];                       // T6: 3 esquinas CCW + 3 medios (12, 23, 31)
const base = [0, 1, 4];                                                      // nudos con y = 0
const FIXED = base.flatMap((n) => [2 * n, 2 * n + 1]);
const nn = X.length;
const model: GeoModel = { X, Y, ELE, EMAT: [1, 1], FIXED, Fg: new Array(2 * nn).fill(0), Fs: new Array(2 * nn).fill(0), Fa: new Array(2 * nn).fill(0),
  MAT: [[20000, 0.3, 25, 2, 18, 0]], MODEL: [1], stages: [] };
const fem = new GeoFem(model, () => {});
const u = fem.elasticSolve(fem.Fg2);
const sig = fem.elasticStress(u);
console.log("Fg2 (kN) por nudo [fy]:", Array.from({ length: nn }, (_, i) => fem.Fg2[2 * i + 1].toFixed(6)).join(" "));
console.log("u (mm) por nudo:");
for (let i = 0; i < nn; i++) console.log(`  nudo ${i + 1}: ux=${(u[2 * i] * 1e3).toFixed(9)}  uy=${(u[2 * i + 1] * 1e3).toFixed(9)}`);
console.log("σ (kPa) por punto de Gauss [xx yy zz xy]:");
for (let e = 0; e < 2; e++) for (let q = 0; q < 7; q++) { const k = (e * 7 + q) * 4; console.log(`  e${e + 1} q${q + 1}: ${[0, 1, 2, 3].map((j) => sig[k + j].toFixed(6)).join("  ")}`); }
console.log("GP:", JSON.stringify(GP));
// Mohr-Coulomb en cada punto: f = ½(σ1−σ3) + ½(σ1+σ3)·senφ − c·cosφ (tracción +)
const phi = (25 * Math.PI) / 180, c = 2, sp = Math.sin(phi), cc = c * Math.cos(phi);
console.log("MC f por punto (kPa):");
for (let e = 0; e < 2; e++) for (let q = 0; q < 7; q++) {
  const k = (e * 7 + q) * 4, sx = sig[k], sy = sig[k + 1], sz = sig[k + 2], txy = sig[k + 3], cen = (sx + sy) / 2, R = Math.hypot((sx - sy) / 2, txy);
  const s = [cen + R, cen - R, sz].sort((a, b) => b - a); const f = 0.5 * (s[0] - s[2]) + 0.5 * (s[0] + s[2]) * sp - cc;
  console.log(`  e${e + 1} q${q + 1}: σ1=${s[0].toFixed(5)} σ2=${s[1].toFixed(5)} σ3=${s[2].toFixed(5)}  f=${f.toFixed(6)}`);
}

// ---- retorno de Mohr-Coulomb del solver en el punto e2 q3 (c = 2, φ = 25°, ψ = 0) ----
{
  const De = (fem as any).D4[1] as Float64Array, k = (7 + 2) * 4, st = [sig[k], sig[k + 1], sig[k + 2], sig[k + 3]];
  const out = new Float64Array(4), info = { t2: 0, ix: [0, 1, 2], reg: 0 };
  const reg = (GeoFem as any).mcReturn(st, De, phi, 0, c, out, info);
  console.log("MC retorno e2 q3: región", reg, "σ trial", st.map((v) => v.toFixed(6)).join(" "), "→ σ devuelta", Array.from(out).map((v) => v.toFixed(8)).join(" "), "ix", info.ix, "t2", info.t2.toFixed(8));
}
// ---- FS de la SRM de Geotechnic con este bloque (c = 8, φ = 30°) ----
{
  const m2: GeoModel = { ...model, MAT: [[20000, 0.3, 30, 8, 18, 0]], recomputeGravity: true, stages: [{ name: "peso propio", loads: ["Fg"] }] };
  const f2 = new GeoFem(m2, () => {});
  const r = f2.run(m2);
  console.log("SRM Geotechnic (c=8, φ=30) FS =", r[0].fs.toFixed(6), "peldaños", r[0].steps.length);
}
