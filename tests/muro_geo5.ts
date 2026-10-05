// MURO EN VOLADIZO DE GEO5 (T, T+dentellón, L, L+dentellón): Hekatan Geotechnic contra la tabla «Verification» de GEO5 2024.
// Datos: muro de Portoviejo (arena SP γ 18.5 φ 30 hasta 3.0 m, SP-SM γ 17.5 φ 29.97 debajo, δ pared 20°), γc 23, kh 0.336.
// Capturas: hekatan-school/VIDEOS/serie_muro_manabi/01_geo5_muro/{kv,medir}/ y registros/2026-10-05_geo5_muro_nec15_borrador_mononobe.md
import { muroGeo5, MuroG5, SueloG5 } from "../src/wall/geo5Cantilever";

const perfil: SueloG5[] = [
  { nombre: "SP", gamma: 18.5, phi: 30, deltaPared: 20, hasta: 3.0 },
  { nombre: "SP-SM", gamma: 17.5, phi: 29.97, deltaPared: 20, hasta: Infinity },
];
let fallos = 0, total = 0;
function cmp(que: string, v: number, g: number, tol: number) {
  total++; const ok = Math.abs(v - g) <= tol; if (!ok) fallos++;
  console.log(`${ok ? "ok   " : "FALLA"} ${que.padEnd(44)} Hekatan ${v.toFixed(4).padStart(9)}  GEO5 ${g.toFixed(2).padStart(8)}  dif ${(v - g).toFixed(4).padStart(8)}`);
}
const base: MuroG5 = { k: 0.25, h: 2.6, xx: 0.4, v1: 0.7, v2: 1.9, s1: 17.33, gammaC: 23 };

// 1) T con fuste inclinado (el de la serie): canto de la zapata 0.2 … 1.0 → estático y sísmico (Fx, Fz, x, y) y peso del muro
const T = { 0.2: [33.24, 1.17, 23.63, 37.12, 2.51, 0.95, 33.59, 58.02, 2.03, 1.87], 0.4: [47.04, 1.27, 26.63, 38.21, 2.53, 1.03, 38.39, 65.87, 2.06, 2.01],
  0.6: [60.84, 1.32, 29.83, 39.37, 2.54, 1.11, 43.15, 73.38, 2.08, 2.16], 0.8: [74.64, 1.35, 33.23, 40.61, 2.56, 1.19, 48.13, 80.97, 2.10, 2.30],
  1.0: [88.44, 1.38, 36.83, 41.92, 2.57, 1.26, 53.32, 88.63, 2.12, 2.45] } as Record<string, number[]>;
for (const [t, G] of Object.entries(T)) {
  const r = muroGeo5({ ...base, xx: +t }, perfil, { kh: 0.336, kv: 0 });
  const e = r.estatico, s = r.sismico;
  cmp(`T t=${t} peso muro`, r.pesoMuro, G[0], 0.011); cmp(`T t=${t} estático Fx`, e.Fx, G[2], 0.011); cmp(`T t=${t} estático Fz`, e.Fz, G[3], 0.011);
  cmp(`T t=${t} estático x`, e.x, G[4], 0.011); cmp(`T t=${t} estático y`, e.y, G[5], 0.011);
  cmp(`T t=${t} sísmico Fx`, s.Fx, G[6], 0.02); cmp(`T t=${t} sísmico Fz`, s.Fz, G[7], 0.03);
  cmp(`T t=${t} sísmico x`, s.x, G[8], 0.011); cmp(`T t=${t} sísmico y`, s.y, G[9], 0.011);
}
// 2) vuelco y deslizamiento del caso base (kh 0.336) con kv = 0, ±0.092, ±0.224
const FS: [number, number, number, number][] = [[0, 2.71, 1.20, 388.96], [0.224, 2.28, 1.05, 0], [-0.224, 3.11, 1.36, 0], [0.092, 2.54, 1.13, 0], [-0.092, 2.88, 1.26, 0]];
for (const [kv, v, d, mr] of FS) {
  const r = muroGeo5(base, perfil, { kh: 0.336, kv });
  cmp(`kv=${kv} vuelco`, r.fsVuelco, v, 0.0051); cmp(`kv=${kv} deslizamiento`, r.fsDeslizamiento, d, 0.0051);
  if (mr) { cmp("kv=0 Mres", r.Mres, mr, 0.06); cmp("kv=0 Movr", r.Movr, 143.34, 0.06); }
}
// 3) formas con dentellón y en L (fuste vertical, k = 0.25): peso, empuje estático y sísmico, vuelco y deslizamiento (de los % de GEO5)
const vert: MuroG5 = { k: 0.25, h: 2.6, xx: 0.4, v1: 0.7, v2: 1.9, gammaC: 23 };
const casos: [string, MuroG5, number[], number, number][] = [
  ["L + dentellón", { ...vert, v1: 0, dent: { x1: 0.7, x2: 0.5, x3: 0 } }, [38.18, 31.51, 39.98, 1.70, 0.85, 45.61, 77.16, 1.24, 1.93], 2.0 / 1.239, 1.05 / 0.638],
  ["T + dentellón", { ...vert, dent: { x1: 0.7, x2: 0.5, x3: 0 } }, [44.62, 31.51, 39.98, 2.40, 0.85, 45.61, 77.16, 1.94, 1.93], 2.0 / 0.770, 1.05 / 0.699],
  ["T vertical", vert, [41.17, 26.63, 38.21, 2.38, 1.03, 38.39, 65.87, 1.91, 2.01], 2.0 / 0.796, 1.05 / 0.885],
];
for (const [n, m, G, fv, fd] of casos) {
  const r = muroGeo5(m, perfil, { kh: 0.336, kv: 0 }); const e = r.estatico, s = r.sismico;
  cmp(`${n} peso muro`, r.pesoMuro, G[0], 0.011); cmp(`${n} estático Fx`, e.Fx, G[1], 0.011); cmp(`${n} estático Fz`, e.Fz, G[2], 0.011);
  cmp(`${n} estático x`, e.x, G[3], 0.011); cmp(`${n} estático y`, e.y, G[4], 0.011);
  cmp(`${n} sísmico Fx`, s.Fx, G[5], 0.02); cmp(`${n} sísmico Fz`, s.Fz, G[6], 0.03);
  cmp(`${n} sísmico x`, s.x, G[7], 0.011); cmp(`${n} sísmico y`, s.y, G[8], 0.011);
  cmp(`${n} vuelco (del %)`, r.fsVuelco, fv, 0.006); cmp(`${n} deslizamiento (del %)`, r.fsDeslizamiento, fd, 0.006);
}
console.log(`\n${total - fallos}/${total} filas dentro de la tolerancia`);
process.exit(fallos ? 1 : 0);
