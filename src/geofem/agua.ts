// Agua en GeoFEM (marco «Water» de GEO5 FEM: No water · GWT · Coefficient Ru · Pore pressure).
//
// Lo que dice el manual de GEO5 FEM (§2.1.1, ec. 2.6-2.10) y el binario (GeoFEMSolver.exe, PorePressureLoading 0x1401fbbb0):
//  · análisis en TENSIONES EFECTIVAS: σ = σ_ef − m·p  ⇒  la carga es  F = ∫Nᵀρ g dV  +  ∫Bᵀ m p dV
//  · ρ = ρ_dry sobre el GWT y ρ_sat bajo él, según el PUNTO DE GAUSS («macroscopic point»)
//  · p se interpola desde las presiones NODALES: p(gauss) = Σ Nᵢ pᵢ   (m = [1 1 0] en plano, sin cortante)
//  · succión despreciada: p = 0 sobre el GWT
// Aquí solo se arma el vector de carga: el solver no cambia (σ del solver = σ efectiva).
import { GP, GW, t6, type GeoModel } from "./solver";

/** γw que usa GEO5 GeoFEM (medido en su InputFile) */
export const GAMMA_W_GEO5 = 10;

export type AguaGWT = {
  /** línea freática: polilínea [x, y] ordenada por x (fuera de su rango se extiende horizontal) */
  gwt: [number, number][];
  /** GEO5 «Coefficient Ru»: u = Ru·γ·(profundidad bajo `terreno`), peso γsat en todo el suelo (medido en GEO5 2024: u_máx = 94.35 =
   *  0.3·18.5·17 m; σz,tot sube respecto al seco). Con `ru` no hay línea freática (gwt = []) */
  ru?: number; terreno?: [number, number][];
  /** peso unitario saturado por material (mismo orden que MAT); positivo, kN/m³ */
  gammaSat: number[];
  /** peso unitario del agua (GEO5: 10, `gamma_w=1.0E+01` en su InputFile) */
  gammaW?: number;
  /** GEO5 «Pore pressure» (presión dada): u NODAL [kPa], un valor por nudo de la malla. El solver solo conoce `load.porepressures`
   *  (binario: PorePressureLoading), así que es el mismo camino que GWT con `p` ya calculada; manda sobre `gwt`. */
  pNodal?: ArrayLike<number>;
  /** GEO5 «Pore pressure»: ISOLÍNEAS de presión (cada una una polilínea con un u [kPa]). Medido en GEO5 2024: se interpola LINEAL en z entre las
   *  isolíneas que corta cada columna vertical x=cte; con UNA sola, u es constante en todo el modelo; sobre la isolínea más alta (si hay ≥2) no hay
   *  presión (u = 0); bajo la más baja vale el u de esa isolínea. Peso γsat donde u > 0 (ayuda de GEO5, misma regla que Ru). */
  poros?: { pts: [number, number][]; u: number }[];
};

/** u [kPa] en (x, y) a partir de las isolíneas de presión dadas (ver `AguaGWT.poros`) */
export function uPoros(iso: { pts: [number, number][]; u: number }[], x: number, y: number): number {
  if (iso.length === 1) return iso[0].u;
  const c = iso.map((q) => ({ z: yGWT(q.pts, x), u: q.u })).sort((a, b) => b.z - a.z);   // de arriba abajo en esta columna
  if (y > c[0].z) return 0;
  for (let i = 1; i < c.length; i++) if (y > c[i].z || i === c.length - 1 && y >= c[i].z) {
    const a = c[i - 1], b = c[i];
    return b.z === a.z ? b.u : a.u + (b.u - a.u) * (a.z - y) / (a.z - b.z);
  }
  return c[c.length - 1].u;
}

/** y de la línea freática en x */
export function yGWT(gwt: [number, number][], x: number): number {
  if (x <= gwt[0][0]) return gwt[0][1];
  for (let i = 1; i < gwt.length; i++) {
    if (x <= gwt[i][0]) { const [x0, y0] = gwt[i - 1], [x1, y1] = gwt[i]; return x1 === x0 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  }
  return gwt[gwt.length - 1][1];
}

/** distancia d ≥ 0 del punto (x, y) al freático, como la mide GEO5 (medido nudo a nudo en su InputFile, 743 de 744 nudos a 1e-3):
 *  PERPENDICULAR a la recta del tramo que queda verticalmente encima del punto (no la profundidad vertical): bajo un tramo inclinado
 *  p = γw·h·cos θ. En un quiebre ENTRANTE (la pendiente aumenta hacia la derecha: el suelo de abajo ve un ángulo > 180°) GEO5 prolonga las
 *  rectas hasta el empalme a inglete: en esa cuña vale el máximo de las dos distancias. En un quiebre saliente el reparto es el vertical. */
export function distGWT(gwt: [number, number][], x: number, y: number): number {
  const n = gwt.length - 1; if (n < 1) return Math.max(0, gwt[0][1] - y);
  let i = 0; while (i < n - 1 && x > gwt[i + 1][0]) i++;      // tramo cuyo rango x contiene al punto (el último si se sale)
  const pend = (k: number) => (gwt[k + 1][1] - gwt[k][1]) / (gwt[k + 1][0] - gwt[k][0] || 1e-12);
  const dist = (k: number) => { const [x0, y0] = gwt[k], [x1, y1] = gwt[k + 1], L = Math.hypot(x1 - x0, y1 - y0) || 1e-12; return ((x - x0) * (y1 - y0) - (y - y0) * (x1 - x0)) / L; };   // >0 si el punto está debajo de la recta
  if (y >= yGWT(gwt, x)) return 0;
  let d = dist(i);
  if (i > 0 && pend(i) > pend(i - 1) + 1e-12) d = Math.max(d, dist(i - 1));
  if (i < n - 1 && pend(i + 1) > pend(i) + 1e-12) d = Math.max(d, dist(i + 1));
  return Math.max(0, d);
}

/** presión de poros nodal del freático (GEO5, γw = 10 kN/m³ como su InputFile `gamma_w=1.0E+01`): p = γw·d, 0 sobre el GWT. Ver `distGWT`. */
export function presionNodal(m: GeoModel, a: AguaGWT): Float64Array {
  const gw = a.gammaW ?? GAMMA_W_GEO5, p = new Float64Array(m.X.length);
  if (a.pNodal) { for (let i = 0; i < p.length; i++) p[i] = Math.max(0, a.pNodal[i]); return p; }
  if (a.poros?.length) { for (let i = 0; i < p.length; i++) p[i] = Math.max(0, uPoros(a.poros, m.X[i], m.Y[i])); return p; }
  for (let i = 0; i < p.length; i++) p[i] = gw * distGWT(a.gwt, m.X[i], m.Y[i]);
  return p;
}

/** Vectores de carga con agua (gdl completos): `Fg` = peso (ρ_sat bajo el GWT por punto de Gauss) y `Fp` = ∫Bᵀ m p dV.
 *  La carga que debe aplicar el solver es Fg + Fp. Usa la MISMA cuadratura (7 puntos de Gauss) y t6() que el solver. */
export function cargaAgua(m: GeoModel, a: AguaGWT, act?: ArrayLike<number>): { Fg: Float64Array; Fp: Float64Array; p: Float64Array } {
  const ndof = 2 * m.X.length, Fg = new Float64Array(ndof), Fp = new Float64Array(ndof), p = presionNodal(m, a);
  for (let e = 0; e < m.ELE.length; e++) {
    if (act && !act[e]) continue;
    const nd = m.ELE[e], xs = nd.map((i) => m.X[i]), ys = nd.map((i) => m.Y[i]), mm = m.EMAT[e] - 1;
    const sat = nd.every((i) => p[i] > 1e-9);   // GEO5 (medido): γsat solo si TODOS los nudos del elemento tienen p > 0; los que tocan el GWT o la superficie van con γ seco
    for (let q = 0; q < GP.length; q++) {
      const [N, dL1, dL2] = t6(GP[q][0], GP[q][1]);
      let j11 = 0, j12 = 0, j21 = 0, j22 = 0, xg = 0, yg = 0, pg = 0;
      for (let k = 0; k < 6; k++) { j11 += dL1[k] * xs[k]; j12 += dL1[k] * ys[k]; j21 += dL2[k] * xs[k]; j22 += dL2[k] * ys[k]; xg += N[k] * xs[k]; yg += N[k] * ys[k]; pg += N[k] * p[nd[k]]; }
      const dJ = j11 * j22 - j12 * j21, w = dJ * GW[q];
      const rho = sat ? -a.gammaSat[mm] : -m.MAT[mm][4];   // MAT[.,4] = γ positivo; el peso va hacia abajo (como solver.ts: rho = -γ)
      for (let k = 0; k < 6; k++) {
        Fg[2 * nd[k] + 1] += N[k] * rho * w;
        const dNx = (j22 * dL1[k] - j12 * dL2[k]) / dJ, dNy = (-j21 * dL1[k] + j11 * dL2[k]) / dJ;
        Fp[2 * nd[k]] += dNx * pg * w; Fp[2 * nd[k] + 1] += dNy * pg * w;
      }
    }
  }
  return { Fg, Fp, p };
}

/** Modelo con el agua aplicada: Fg = peso con ρ_sat bajo el GWT + ∫Bᵀ m p dV (lo único que cambia; los motores TS y WASM lo leen igual). */
export function conAgua(m: GeoModel, a: AguaGWT): GeoModel {
  const { Fg, Fp } = cargaAgua(m, a);
  return { ...m, Fg: Array.from(Fg, (v, i) => v + Fp[i]), recomputeGravity: false };
}

/** Fg + Fp listo para el solver (lo que usan run() de TS y WASM cuando el modelo trae `agua`). */
export function fgConAgua(m: GeoModel): number[] {
  const a = m.agua!;
  if (a.ru !== undefined && a.terreno) {   // Ru: peso γsat, presión = Ru·γ·h (γ seco)
    const { Fg, Fp } = cargaRu(m, a.ru, a.terreno, "gauss", (k) => a.gammaSat[k]);
    return Array.from(Fg, (v, i) => v + Fp[i]);
  }
  const { Fg, Fp } = cargaAgua(m, a);
  return Array.from(Fg, (v, i) => v + Fp[i]);
}

/** Coeficiente Ru (GEO5 Water → Coefficient Ru): u = Ru·σv, con σv = ∫γ dz desde el terreno (una sola capa: γ·profundidad).
 *  `en`: dónde se evalúa σv — "gauss" (en cada punto de Gauss) o "nudos" (u nodal y luego Σ Nᵢ uᵢ, como PorePressureLoading). */
export function cargaRu(m: GeoModel, ru: number, terreno: [number, number][], en: "gauss" | "nudos", gPeso: ((mm: number) => number) | undefined = undefined, gSv = (mm: number) => m.MAT[mm][4], pGauss?: ArrayLike<number>, act?: ArrayLike<number>): { Fg: Float64Array; Fp: Float64Array } {
  const ndof = 2 * m.X.length, Fg = new Float64Array(ndof), Fp = new Float64Array(ndof);
  const sv = (x: number, y: number, mm: number) => Math.max(0, (yGWT(terreno, x) - y) * gSv(mm));
  const pn = new Float64Array(m.X.length);
  for (let i = 0; i < pn.length; i++) pn[i] = ru * sv(m.X[i], m.Y[i], 0);   // p nodal = Ru·γ·h (también decide qué elementos son saturados)

  for (let e = 0; e < m.ELE.length; e++) {
    if (act && !act[e]) continue;
    const nd = m.ELE[e], xs = nd.map((i) => m.X[i]), ys = nd.map((i) => m.Y[i]), mm = m.EMAT[e] - 1;
    const gEl = gPeso && nd.every((i) => pn[i] > 1e-9) ? gPeso(mm) : m.MAT[mm][4];   // γsat solo en elementos con TODOS los nudos bajo presión (medido en GEO5)
    for (let q = 0; q < GP.length; q++) {
      const [N, dL1, dL2] = t6(GP[q][0], GP[q][1]);
      let j11 = 0, j12 = 0, j21 = 0, j22 = 0, xg = 0, yg = 0, pg = 0;
      for (let k = 0; k < 6; k++) { j11 += dL1[k] * xs[k]; j12 += dL1[k] * ys[k]; j21 += dL2[k] * xs[k]; j22 += dL2[k] * ys[k]; xg += N[k] * xs[k]; yg += N[k] * ys[k]; pg += N[k] * pn[nd[k]]; }
      if (pGauss) pg = pGauss[e * GP.length + q]; else if (en === "gauss") pg = ru * sv(xg, yg, mm);
      const dJ = j11 * j22 - j12 * j21, w = dJ * GW[q];
      for (let k = 0; k < 6; k++) {
        Fg[2 * nd[k] + 1] += -N[k] * gEl * w;
        const dNx = (j22 * dL1[k] - j12 * dL2[k]) / dJ, dNy = (-j21 * dL1[k] + j11 * dL2[k]) / dJ;
        Fp[2 * nd[k]] += dNx * pg * w; Fp[2 * nd[k] + 1] += dNy * pg * w;
      }
    }
  }
  return { Fg, Fp };
}

/** Carga EXTRA del agua para una etapa de construcción: el motor ya pone el peso SECO de los elementos activos, así que aquí va
 *  (peso con γsat − peso seco) + ∫Bᵀ m p dV, solo de los elementos activos `act`. Misma regla de saturación que `fgConAgua`. */
export function extraAguaEtapa(m: GeoModel, act: ArrayLike<number>): Float64Array {
  const a = m.agua!;
  let mojado: { Fg: Float64Array; Fp: Float64Array }, seco: { Fg: Float64Array };
  if (a.ru !== undefined && a.terreno) {
    mojado = cargaRu(m, a.ru, a.terreno, "gauss", (k) => a.gammaSat[k], undefined, undefined, act);
    seco = cargaRu(m, a.ru, a.terreno, "gauss", undefined, undefined, undefined, act);
  } else {
    mojado = cargaAgua(m, a, act);
    seco = cargaAgua(m, { ...a, gammaSat: m.MAT.map((r) => r[4]) }, act);
  }
  return Float64Array.from(mojado.Fg, (v, i) => v - seco.Fg[i] + mojado.Fp[i]);
}
