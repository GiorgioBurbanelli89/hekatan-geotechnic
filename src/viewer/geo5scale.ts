// Escala y paleta de GEO5, MEDIDAS en sus capturas (talud_plot_lib.py, 2026-09-03/04):
//  - paso = (max − min)/11 con la mantisa redondeada al 0.5 más cercano;
//  - bordes = [min, múltiplos del paso, max] (min/max a 0.1 mm; un múltiplo a < 0.1·paso del min se omite,
//    uno a < 0.05·paso del max se funde con él);
//  - extremos de la barra = nudos ESQUINA solamente;
//  - colores muestreados píxel a píxel (11, 12 y 13 bandas); otro nº → interpolación de la de 13.

export function geo5Step(vmin: number, vmax: number): number {
  const rng = vmax - vmin;
  if (rng <= 0) return 1;
  const raw = rng / 11;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (Math.round(m * 2) / 2) * p;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function geo5Levels(vmin: number, vmax: number): number[] {
  const st = geo5Step(vmin, vmax);
  const vmaxR = r1(vmax), vminR = r1(vmin);
  const lv = [vminR];
  let k = Math.floor(vminR / st) + 1;
  while (k * st < vmaxR - 1e-9) {
    const v = r6(k * st);
    if (v - vminR >= 0.1 * st) lv.push(v);
    k++;
  }
  if (vmaxR > lv[lv.length - 1] + 0.05 * st) lv.push(vmaxR); else lv[lv.length - 1] = vmaxR;
  return lv;
}

type RGB = [number, number, number];
const G5_11: RGB[] = [[0,0,255],[0,0,176],[0,88,88],[0,176,0],[0,255,0],[128,255,0],[255,255,0],[255,128,0],[255,64,0],[255,0,0],[176,0,0]];
const G5_13: RGB[] = [[0,0,255],[0,0,224],[0,0,176],[0,176,0],[0,216,0],[0,255,0],[128,255,0],[255,255,0],[255,192,0],[255,128,0],[255,0,0],[213,0,0],[176,0,0]];
const G5_12: RGB[] = [[0,0,255],[0,0,220],[0,0,176],[0,176,0],[0,216,0],[0,255,0],[255,255,0],[255,192,0],[255,128,0],[255,0,0],[211,0,0],[176,0,0]];

export function geo5Cmap(nb: number): RGB[] {
  if (nb === 11) return G5_11;
  if (nb === 12) return G5_12;
  if (nb === 13) return G5_13;
  const out: RGB[] = [];
  for (let k = 0; k < nb; k++) {
    const t = nb === 1 ? 0 : k / (nb - 1), x = t * (G5_13.length - 1), i = Math.min(Math.floor(x), G5_13.length - 2), f = x - i;
    out.push([0, 1, 2].map((c) => G5_13[i][c] + f * (G5_13[i + 1][c] - G5_13[i][c])) as RGB);
  }
  return out;
}

/** Interpola un campo nodal (esquinas del T6) a una rejilla regular por baricéntricas. NaN fuera. */
export function gridField(X: number[], Y: number[], ELE: number[][], vals: Float64Array | number[], NX = 440, NZ = 340) {   // 2× la rejilla del .py: la máscara NaN del contorno queda fina en pantalla
  let xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < X.length; i++) { if (X[i] < xmin) xmin = X[i]; if (X[i] > xmax) xmax = X[i]; if (Y[i] < zmin) zmin = Y[i]; if (Y[i] > zmax) zmax = Y[i]; }
  const Z = new Float64Array(NX * NZ).fill(NaN);
  const dxg = (xmax - xmin) / (NX - 1), dzg = (zmax - zmin) / (NZ - 1);
  for (const el of ELE) {
    const [n0, n1, n2] = el;
    const ax = X[n0], ay = Y[n0], bx = X[n1], by = Y[n1], cx = X[n2], cy = Y[n2];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    const i0 = Math.max(Math.floor((Math.min(ax, bx, cx) - xmin) / dxg), 0), i1 = Math.min(Math.ceil((Math.max(ax, bx, cx) - xmin) / dxg), NX - 1);
    const j0 = Math.max(Math.floor((Math.min(ay, by, cy) - zmin) / dzg), 0), j1 = Math.min(Math.ceil((Math.max(ay, by, cy) - zmin) / dzg), NZ - 1);
    const v0 = vals[n0], v1 = vals[n1], v2 = vals[n2];
    for (let j = j0; j <= j1; j++) {
      const zz = zmin + j * dzg;
      for (let i = i0; i <= i1; i++) {
        const xx = xmin + i * dxg;
        const L1 = ((by - cy) * (xx - cx) + (cx - bx) * (zz - cy)) / det;
        const L2 = ((cy - ay) * (xx - cx) + (ax - cx) * (zz - cy)) / det;
        const L3 = 1 - L1 - L2;
        if (L1 >= -1e-9 && L2 >= -1e-9 && L3 >= -1e-9) Z[j * NX + i] = L1 * v0 + L2 * v1 + L3 * v2;
      }
    }
  }
  return { xmin, xmax, zmin, zmax, NX, NZ, Z };
}

// Los mismos resultados que ofrece GEO5 FEM en «Variable» (Jorge, 8-sep-2026: "fíjate cuántos resultados se pueden escoger").
// dx/dz/d = mecanismo de falla (u(SRF) − u_el, como GEO5 en estabilidad); el resto = estado de TENSIÓN (SRF=1, «stress analysis»).
export type FieldKind = "dx" | "dz" | "d" | "sx" | "sz" | "sxt" | "szt" | "txz" | "J" | "u" | "Ed" | "Edpl";
export const FIELD_LABEL: Record<FieldKind, string> = { dx: "d_x", dz: "d_z", d: "|d|", sx: "σ_x,eff", sz: "σ_z,eff", sxt: "σ_x,tot", szt: "σ_z,tot", txz: "τ_xz", J: "J", u: "u_tot", Ed: "E_d", Edpl: "E_d,pl" };
export const FIELD_UNIT: Record<FieldKind, string> = { dx: "mm", dz: "mm", d: "mm", sx: "kPa", sz: "kPa", sxt: "kPa", szt: "kPa", txz: "kPa", J: "kPa", u: "kPa", Ed: "%", Edpl: "%" };
export const FIELD_NAME: Record<FieldKind, string> = { dx: "Displacement d_x", dz: "Displacement d_z", d: "Displacement resultant |d|", sx: "Effective stress σ_x,eff", sz: "Effective stress σ_z,eff", sxt: "Total stress σ_x,tot", szt: "Total stress σ_z,tot", txz: "Shear stress τ_xz", J: "Equivalent deviatoric stress J", u: "Total pore pressure u_tot", Ed: "Equivalent deviatoric strain E_d", Edpl: "Plastic equivalent deviatoric strain E_d,pl" };
export const isStressField = (k: FieldKind) => k !== "dx" && k !== "dz" && k !== "d";

/** Promedio nodal de un valor por punto de Gauss (media de los GP del elemento a sus 6 nudos, media entre elementos). */
export function gpToNodal(ELE: number[][], nn: number, ngpPerEl: number, val: (kk: number) => number): Float64Array {
  const sum = new Float64Array(nn), cnt = new Float64Array(nn);
  for (let e = 0; e < ELE.length; e++) {
    let s = 0; for (let q = 0; q < ngpPerEl; q++) s += val(e * ngpPerEl + q); s /= ngpPerEl;
    for (const n of ELE[e]) { sum[n] += s; cnt[n]++; }
  }
  for (let i = 0; i < nn; i++) sum[i] = cnt[i] ? sum[i] / cnt[i] : 0;
  return sum;
}
/** Campo nodal de tensión/deformación (SRF=1) con el convenio de GEO5: compresión POSITIVA; sin agua u_tot = 0 y σ_tot = σ_eff. */
export function stressField(kind: FieldKind, ELE: number[][], nn: number, ngp: number, sig: Float64Array, eps: Float64Array, epl: Float64Array): Float64Array {
  const per = Math.round(ngp / ELE.length);
  const dev = (a: Float64Array, kk: number, strain: boolean) => {   // invariante desviador: J = √J2 (σ) ; E_d = √(2/3 e:e) (ε)
    const xx = a[kk * 4], yy = a[kk * 4 + 1], zz = a[kk * 4 + 2], xy = a[kk * 4 + 3], m = (xx + yy + zz) / 3;
    const ex = xx - m, ey = yy - m, ez = zz - m, g = strain ? xy / 2 : xy;   // ε_xy = γ_xy/2
    const J2 = 0.5 * (ex * ex + ey * ey + ez * ez) + g * g;
    return strain ? Math.sqrt((4 / 3) * J2) : Math.sqrt(J2);
  };
  switch (kind) {
    case "sx": case "sxt": return gpToNodal(ELE, nn, per, (kk) => -sig[kk * 4]);
    case "sz": case "szt": return gpToNodal(ELE, nn, per, (kk) => -sig[kk * 4 + 1]);
    case "txz": return gpToNodal(ELE, nn, per, (kk) => sig[kk * 4 + 3]);
    case "J": return gpToNodal(ELE, nn, per, (kk) => dev(sig, kk, false));
    case "u": return new Float64Array(nn);
    case "Ed": return gpToNodal(ELE, nn, per, (kk) => 1e2 * dev(eps, kk, true));   // en %, como GEO5
    case "Edpl": return gpToNodal(ELE, nn, per, (kk) => 1e2 * dev(epl, kk, true));
    default: return new Float64Array(nn);
  }
}

/** Campo nodal en mm con el signo de GEO5: d_x + hacia la izquierda, d_z asiento +, d resultante. */
export function nodalField(u: Float64Array, uel: Float64Array, nn: number, kind: FieldKind): Float64Array {
  const f = new Float64Array(nn);
  for (let i = 0; i < nn; i++) {
    const ux = u[2 * i] - uel[2 * i], uy = u[2 * i + 1] - uel[2 * i + 1];
    f[i] = kind === "dx" ? -ux * 1e3 : kind === "dz" ? -uy * 1e3 : Math.hypot(ux, uy) * 1e3;
  }
  return f;
}
