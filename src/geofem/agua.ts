// Agua en GeoFEM (marco «Water» de GEO5 FEM: No water · GWT · Coefficient Ru · Pore pressure).
//
// Lo que dice el manual de GEO5 FEM (§2.1.1, ec. 2.6-2.10) y el binario (GeoFEMSolver.exe, PorePressureLoading 0x1401fbbb0):
//  · análisis en TENSIONES EFECTIVAS: σ = σ_ef − m·p  ⇒  la carga es  F = ∫Nᵀρ g dV  +  ∫Bᵀ m p dV
//  · ρ = ρ_dry sobre el GWT y ρ_sat bajo él, según el PUNTO DE GAUSS («macroscopic point»)
//  · p se interpola desde las presiones NODALES: p(gauss) = Σ Nᵢ pᵢ   (m = [1 1 0] en plano, sin cortante)
//  · succión despreciada: p = 0 sobre el GWT
// Aquí solo se arma el vector de carga: el solver no cambia (σ del solver = σ efectiva).
import { GP, GW, t6, type GeoModel } from "./solver";

export type AguaGWT = {
  /** línea freática: polilínea [x, y] ordenada por x (fuera de su rango se extiende horizontal) */
  gwt: [number, number][];
  /** peso unitario saturado por material (mismo orden que MAT); positivo, kN/m³ */
  gammaSat: number[];
  /** peso unitario del agua (GEO5: 9.81) */
  gammaW?: number;
};

/** y de la línea freática en x */
export function yGWT(gwt: [number, number][], x: number): number {
  if (x <= gwt[0][0]) return gwt[0][1];
  for (let i = 1; i < gwt.length; i++) {
    if (x <= gwt[i][0]) { const [x0, y0] = gwt[i - 1], [x1, y1] = gwt[i]; return x1 === x0 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  }
  return gwt[gwt.length - 1][1];
}

/** presión de poros nodal hidrostática: p = γw·(yGWT − y) bajo el GWT, 0 sobre él */
export function presionNodal(m: GeoModel, a: AguaGWT): Float64Array {
  const gw = a.gammaW ?? 9.81, p = new Float64Array(m.X.length);
  for (let i = 0; i < p.length; i++) p[i] = Math.max(0, gw * (yGWT(a.gwt, m.X[i]) - m.Y[i]));
  return p;
}

/** Vectores de carga con agua (gdl completos): `Fg` = peso (ρ_sat bajo el GWT por punto de Gauss) y `Fp` = ∫Bᵀ m p dV.
 *  La carga que debe aplicar el solver es Fg + Fp. Usa la MISMA cuadratura (7 puntos de Gauss) y t6() que el solver. */
export function cargaAgua(m: GeoModel, a: AguaGWT): { Fg: Float64Array; Fp: Float64Array; p: Float64Array } {
  const ndof = 2 * m.X.length, Fg = new Float64Array(ndof), Fp = new Float64Array(ndof), p = presionNodal(m, a);
  for (let e = 0; e < m.ELE.length; e++) {
    const nd = m.ELE[e], xs = nd.map((i) => m.X[i]), ys = nd.map((i) => m.Y[i]), mm = m.EMAT[e] - 1;
    for (let q = 0; q < GP.length; q++) {
      const [N, dL1, dL2] = t6(GP[q][0], GP[q][1]);
      let j11 = 0, j12 = 0, j21 = 0, j22 = 0, xg = 0, yg = 0, pg = 0;
      for (let k = 0; k < 6; k++) { j11 += dL1[k] * xs[k]; j12 += dL1[k] * ys[k]; j21 += dL2[k] * xs[k]; j22 += dL2[k] * ys[k]; xg += N[k] * xs[k]; yg += N[k] * ys[k]; pg += N[k] * p[nd[k]]; }
      const dJ = j11 * j22 - j12 * j21, w = dJ * GW[q];
      const bajo = yg < yGWT(a.gwt, xg);
      const rho = bajo ? -a.gammaSat[mm] : -m.MAT[mm][4];   // MAT[.,4] = γ positivo; el peso va hacia abajo (como solver.ts: rho = -γ)
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
  const { Fg, Fp } = cargaAgua(m, m.agua!);
  return Array.from(Fg, (v, i) => v + Fp[i]);
}
