// MÉTODO ANALÍTICO junto al FEM (27-nov-2026, Jorge: «debería también mostrar el método analítico»). Todo es de libro y se comprueba
// en tests/analitico.ts contra fórmulas cerradas; aquí no hay nada de GEO5:
//   · estado inicial: σz = γ·z, σx = K0·γ·z (Jaky 1 − sinφ y elástico ν/(1−ν)); asiento 1D por peso propio s = γH²/(2M)
//   · muro en voladizo: empuje activo por cuñas de prueba (cunaCulmann.ts, terreno inclinado y cohesión), vuelco, deslizamiento,
//     excentricidad y capacidad portante (Meyerhof con factores de inclinación, Das) — el muro como sólido rígido
//   · FS del talud por equilibrio límite: Fellenius y Bishop de src/lem/slices.ts (círculo crítico)
import { empujeCulmann } from "../wall/cunaCulmann";
import { muroExcavacion } from "../model/plantillas";

const rad = (g: number) => (g * Math.PI) / 180;
export type Fila = { nombre: string; formula: string; analitico: number; fem?: number; unidad: string; nota?: string };

/** módulo edométrico M = E(1−ν)/((1+ν)(1−2ν)) y asiento 1D por peso propio de una columna de altura H: s = γH²/(2M) */
export const moduloEdometrico = (E: number, nu: number) => (E * (1 - nu)) / ((1 + nu) * (1 - 2 * nu));
export const asientoPesoPropio = (gamma: number, H: number, E: number, nu: number) => (gamma * H * H) / (2 * moduloEdometrico(E, nu));

/** Capacidad portante de una zapata CORRIDA (drenado), Meyerhof con área efectiva B' = B − 2e y factores de inclinación
 *  i_c = i_q = (1 − α/90°)², i_γ = (1 − α/φ)², α = atan(H/V) (Das, Principios de ingeniería de cimentaciones, §3.6).
 *  Nq = e^(π tanφ)·tan²(45 + φ/2), Nc = (Nq − 1)·cotφ, Nγ = (Nq − 1)·tan(1.4φ) (Meyerhof). Sin factores de forma ni de profundidad. */
export function portanteMeyerhof(B: number, e: number, Df: number, gamma: number, phi: number, c: number, H: number, V: number) {
  const f = rad(phi), Nq = Math.exp(Math.PI * Math.tan(f)) * Math.tan(rad(45 + phi / 2)) ** 2, Nc = phi > 0 ? (Nq - 1) / Math.tan(f) : 5.14, Ng = (Nq - 1) * Math.tan(1.4 * f);
  const a = (Math.atan2(Math.abs(H), V) * 180) / Math.PI, iq = (1 - a / 90) ** 2, ig = phi > 0 ? Math.max(0, 1 - a / phi) ** 2 : 0;
  const Bp = Math.max(B - 2 * Math.abs(e), 0.01), q = gamma * Df;
  const qu = c * Nc * iq + q * Nq * iq + 0.5 * gamma * Bp * Ng * ig;
  return { qu, Bp, Nq, Nc, Ng, iq, ig, alfa: a, Qu: qu * Bp };
}

/** Verificación clásica del muro de la plantilla «excavación + muro en voladizo», como sólido rígido (por metro). */
export function muroClasico(p: Record<string, number>) {
  const g = muroExcavacion(p), gs = p.gamma, gm = p.gm;
  const xT = g.xt, zb = g.zb, B = g.xt - g.xp, H0 = g.zt(xT) - zb;
  const cuna = empujeCulmann(xT, zb, g.zt, g.xmax - 0.01, gs, p.phi, p.c, p.phi);   // δ = φ en el plano ficticio (suelo contra suelo, como verify.ts)
  const E = Math.max(cuna.E, 0), d = rad(p.phi), Eh = E * Math.cos(d), Ev = E * Math.sin(d);
  // pesos y brazos respecto al extremo de la puntera (x = xp, z = zb)
  const F: { n: string; V: number; x: number }[] = [];
  F.push({ n: "pantalla", V: p.tp * (0 - g.zz) * gm, x: (g.xw + g.xb) / 2 - g.xp });
  F.push({ n: "zapata", V: B * p.tz * gm, x: B / 2 });
  if (g.dp > 0.01) F.push({ n: "dentellón", V: g.db * g.dp * gm, x: g.xd + g.db / 2 - g.xp });
  let Ar = 0, Mx = 0; const n = 200; for (let i = 0; i < n; i++) { const x = g.xb + (g.xt - g.xb) * (i + 0.5) / n, h = Math.max(g.zt(x) - g.zz, 0), dx = (g.xt - g.xb) / n; Ar += h * dx; Mx += h * dx * x; }
  F.push({ n: "suelo sobre el talón (hasta el talud)", V: Ar * gs, x: Mx / Math.max(Ar, 1e-9) - g.xp });
  const hPun = Math.max(g.zz + g.dexc < 0 ? -(g.zz + g.dexc) : 0, 0);
  if (p.pun > 0 && hPun > 0) F.push({ n: "suelo sobre la puntera", V: (g.xw - g.xp) * hPun * gs, x: (g.xw - g.xp) / 2 });
  F.push({ n: `empuje activo vertical (E·sinδ)`, V: Ev, x: B });
  const N = F.reduce((s, f) => s + f.V, 0), Mest = F.reduce((s, f) => s + f.V * f.x, 0), Mdes = Eh * (H0 / 3);
  const sfVuelco = Mest / Math.max(Mdes, 1e-9);
  const sfDesl = (N * Math.tan(d) + p.c * B) / Math.max(Eh, 1e-9);
  const xR = (Mest - Mdes) / N, e = B / 2 - xR;
  const nucleo = Math.abs(e) <= B / 6;
  const sMax = nucleo ? (N / B) * (1 + (6 * Math.abs(e)) / B) : (2 * N) / (3 * (B / 2 - Math.abs(e))), sMin = nucleo ? (N / B) * (1 - (6 * Math.abs(e)) / B) : 0;
  const Df = Math.max(zb < 0 ? -g.dexc - zb : 0, 0);   // profundidad de la base bajo el fondo excavado (lado de la puntera)
  const cap = portanteMeyerhof(B, e, Df, gs, p.phi, p.c, Eh, N);
  return { g, cuna, E, Eh, Ev, H0, B, F, N, Mest, Mdes, sfVuelco, sfDesl, e, nucleo, sMax, sMin, cap, sfPortante: cap.Qu / N, Df };
}

/** .hgeo del ESTADO FINAL de la plantilla para el equilibrio límite: terreno ya excavado y el muro como `muro` (el círculo no corta
 *  el hormigón; puede pasar POR DEBAJO del muro). Misma geometría que las líneas libres del FEM. */
export function hgeoLemExcavacion(p: Record<string, number>): string {
  const g = muroExcavacion(p), r = (v: number) => String(Math.round(v * 1e6) / 1e6), H = p.H;
  // terreno natural; la excavación delante la hace el propio `muro … z=` (muro EMBEBIDO: excava hasta la cota del pie desde la izquierda
  // hasta donde el natural ya está por debajo); si la excavación no llega al margen, su borde se da con un escalón casi vertical
  const terreno = (g.dexc > 0.05 && g.xe > 0.05 ? `0,0 ${r(g.xe)},0 ${r(g.xe + 0.01)},${r(-g.dexc)} ${r(g.xw - 0.5)},${r(-g.dexc)} ` : "0,0 ") + `${r(g.xpie)},0 ${r(g.xc)},${r(H)} ${r(g.xmax)},${r(H)}`;
  return [
    `margenes xmin=0 xmax=${r(g.xmax)} fondo=${r(g.fondo)}`, `interfaz ${terreno}`,
    `suelo SUELO E=${r(p.Es * 1000)} nu=${r(p.nus)} phi=${r(p.phi)} c=${r(p.c)} gamma=${r(p.gamma)}`,
    `suelo HORMIGON E=${r(p.Em * 1e6)} nu=${r(p.num)} phi=45 c=10000 gamma=${r(p.gm)}`,
    `asignar SUELO en ${r(g.xc + 1)},${r(g.fondo / 2)}`,
    `muro HORMIGON x=${r(g.xw)} z=${r(-g.dexc)} H=${r(g.dexc)} fuste=${r(p.tp)} zapata=${r(p.tz)} talon=${r(p.tal)} dedo=${r(g.xw - g.xp)} emp=${r(g.hp + p.tz - g.dexc)}${g.dp > 0.01 ? ` dentp=${r(g.dp)} dentb=${r(g.db)}` : ""}`,
    "malla 1", "etapa final",
  ].join("\n") + "\n";
}
