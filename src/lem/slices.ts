// Métodos ANALÍTICOS de estabilidad de taludes por EQUILIBRIO LÍMITE (dovelas), el módulo "Slope Stability" de GEO5,
// APARTE de GeoFEM. Métodos que calcula GEO5 (clases TStabResult* de SlopeStability_5.dll): Fellenius/Petterson, Bishop,
// Janbu, Spencer, Morgenstern-Price, Sarma, Shahunyants. Aquí, la primera entrega: superficie CIRCULAR con Fellenius y Bishop.
//
// Formulación (equilibrio límite, deformación plana, dovelas verticales — de libro; el equilibrio límite es terreno firme):
//   Fellenius (ordinario/sueco):  FS = Σ[c·l + (W·cosα − u·l)·tanφ] / Σ[W·sinα]
//   Bishop simplificado:          FS = Σ[(c·b + (W − u·b)·tanφ)/mα] / Σ[W·sinα],  mα = cosα + sinα·tanφ/FS   (iterativo)
// W = peso de la dovela (Σ γ·área por capa), α = inclinación de la base (tangente al círculo), b = ancho, l = b/cosα,
// u = presión de poros en la base (Ru·γ·h ó nivel freático; 0 sin agua). c, φ = del suelo en la base de la dovela.
import { SlopeDef, Pt, spanInterface, interfaceY, regionAt } from "../model/dsl";

export type LemMethod = "fellenius" | "bishop";
export type Circle = { cx: number; cy: number; R: number };
export type Slice = { xm: number; b: number; alpha: number; W: number; c: number; phi: number; u: number; yb: number; yt: number };
export type LemResult = { fs: number; method: LemMethod; circle: Circle; slices: Slice[]; x0: number; x1: number; iters?: number };

const soilAt = (def: SlopeDef, x: number, y: number) => {
  // región de GEO5 (nº de interfaces por encima) → suelo asignado; sin asignación, el primer suelo
  const reg = regionAt(def, x, y);
  const a = def.assign.find((a) => regionAt(def, a.p[0], a.p[1]) === reg);
  return def.soils.find((s) => s.name === (a?.soil ?? def.soils[0]?.name)) ?? def.soils[0];
};

/** Peso de la columna vertical en x entre el círculo (yb) y el terreno (yt): Σ γ·Δh por capa que atraviesa. */
function columnWeight(def: SlopeDef, spans: Pt[][], x: number, yb: number, yt: number): { W: number } {
  if (yt <= yb) return { W: 0 };
  // límites verticales = las interfaces en x, entre yb y yt, ordenados de arriba a abajo
  const zs = [yt, ...spans.map((sp) => interfaceY(sp, x)).filter((z) => z > yb + 1e-6 && z < yt - 1e-6).sort((a, b) => b - a), yb];
  let W = 0;
  for (let i = 0; i + 1 < zs.length; i++) {
    const zmid = (zs[i] + zs[i + 1]) / 2, s = soilAt(def, x, zmid);
    W += (s?.gamma ?? 18) * (zs[i] - zs[i + 1]);   // por unidad de ancho (se multiplica por b fuera)
  }
  return { W };
}

/** Dovelas de un círculo: intersección con el terreno (entrada x0 y salida x1) y N columnas. Devuelve null si no corta bien. */
export function sliceCircle(def: SlopeDef, cir: Circle, n = 40): { slices: Slice[]; x0: number; x1: number } | null {
  const m = def.margins!; const terr = spanInterface(def.interfaces[0], m.xmin, m.xmax);
  const spans = def.interfaces.map((it) => spanInterface(it, m.xmin, m.xmax));
  // el círculo corta el terreno donde (yterr − cy)² + (x − cx)² = R²  →  buscamos los dos x de corte por barrido de signo
  const f = (x: number) => { const dx = x - cir.cx, yt = interfaceY(terr, x); return dx * dx + (yt - cir.cy) ** 2 - cir.R * cir.R; };
  const xs: number[] = []; const N = 400;
  let prev = f(m.xmin);
  for (let i = 1; i <= N; i++) { const x = m.xmin + (m.xmax - m.xmin) * i / N, v = f(x); if (prev * v < 0) { let a = x - (m.xmax - m.xmin) / N, bb = x; for (let k = 0; k < 40; k++) { const mid = (a + bb) / 2; if (f(a) * f(mid) < 0) bb = mid; else a = mid; } xs.push((a + bb) / 2); } prev = v; }
  if (xs.length < 2) return null;
  const x0 = xs[0], x1 = xs[xs.length - 1]; if (x1 - x0 < 1e-3) return null;
  const yBot = (x: number) => cir.cy - Math.sqrt(Math.max(0, cir.R * cir.R - (x - cir.cx) ** 2));   // rama INFERIOR del círculo
  const slices: Slice[] = [];
  for (let i = 0; i < n; i++) {
    const xa = x0 + (x1 - x0) * i / n, xb = x0 + (x1 - x0) * (i + 1) / n, xm = (xa + xb) / 2, b = xb - xa;
    const yb = yBot(xm), yt = interfaceY(terr, xm); if (yt <= yb) continue;
    const dyb = yBot(xb) - yBot(xa); const alpha = Math.atan2(dyb, b);   // inclinación de la base
    const { W } = columnWeight(def, spans, xm, yb, yt);
    const s = soilAt(def, xm, yb + 1e-3);                                 // suelo en la BASE de la dovela
    const u = 0;                                                          // sin agua (freático/Ru = siguiente entrega)
    slices.push({ xm, b, alpha, W: W * b, c: s?.c ?? 0, phi: (s?.phi ?? 0) * Math.PI / 180, u, yb, yt });
  }
  return slices.length >= 3 ? { slices, x0, x1 } : null;
}

/** FS de un círculo por Fellenius o Bishop. Bishop itera mα(FS); Fellenius es explícito. */
export function fsCircle(def: SlopeDef, cir: Circle, method: LemMethod, n = 40): LemResult | null {
  const cut = sliceCircle(def, cir, n); if (!cut) return null;
  const { slices, x0, x1 } = cut;
  const driving = slices.reduce((s, sl) => s + sl.W * Math.sin(sl.alpha), 0);
  if (driving <= 1e-6) return null;   // masa que no desliza (círculo mal puesto)
  if (method === "fellenius") {
    const resist = slices.reduce((s, sl) => { const l = sl.b / Math.cos(sl.alpha); return s + sl.c * l + (sl.W * Math.cos(sl.alpha) - sl.u * l) * Math.tan(sl.phi); }, 0);
    return { fs: resist / driving, method, circle: cir, slices, x0, x1 };
  }
  let fs = 1.0, it = 0;   // Bishop: punto fijo sobre mα
  for (; it < 100; it++) {
    let num = 0; for (const sl of slices) { const ma = Math.cos(sl.alpha) + Math.sin(sl.alpha) * Math.tan(sl.phi) / fs; if (Math.abs(ma) < 1e-6) return null; num += (sl.c * sl.b + (sl.W - sl.u * sl.b) * Math.tan(sl.phi)) / ma; }
    const nf = num / driving; if (!Number.isFinite(nf)) return null;
    if (Math.abs(nf - fs) < 1e-6) { fs = nf; break; } fs = nf;
  }
  return { fs, method, circle: cir, slices, x0, x1, iters: it };
}

/** BÚSQUEDA de la superficie crítica: barre una malla de centros (arriba del talud) y radios; devuelve el FS mínimo. */
export function criticalCircle(def: SlopeDef, method: LemMethod, n = 40): LemResult | null {
  const m = def.margins!; const terr = spanInterface(def.interfaces[0], m.xmin, m.xmax);
  const xmin = m.xmin, xmax = m.xmax, ytopMax = Math.max(...terr.map((p) => p[1])), ybotMin = m.bottom;
  const H = ytopMax - ybotMin, W = xmax - xmin;
  let best: LemResult | null = null;
  const NC = 12;   // rejilla de centros
  for (let ix = 0; ix <= NC; ix++) for (let iy = 0; iy <= NC; iy++) {
    const cx = xmin + W * (0.2 + 0.6 * ix / NC), cy = ytopMax + H * (0.1 + 1.2 * iy / NC);
    for (let ir = 0; ir <= 14; ir++) {
      const R = H * (0.5 + 1.6 * ir / 14);
      const r = fsCircle(def, { cx, cy, R }, method, n);
      if (r && r.fs > 0.2 && r.fs < 50 && (!best || r.fs < best.fs)) best = r;
    }
  }
  if (!best) return null;
  // refinamiento local alrededor del mejor centro/radio
  const c0 = best.circle; const dc = W * 0.06, dr = H * 0.12;
  for (let ix = -3; ix <= 3; ix++) for (let iy = -3; iy <= 3; iy++) for (let ir = -3; ir <= 3; ir++) {
    const cir = { cx: c0.cx + dc * ix / 3, cy: c0.cy + dc * iy / 3, R: c0.R + dr * ir / 3 };
    const r = fsCircle(def, cir, method, n);
    if (r && r.fs > 0.2 && r.fs < 50 && r.fs < best.fs) best = r;
  }
  return best;
}
