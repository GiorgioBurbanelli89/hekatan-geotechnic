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

export type FieldKind = "dx" | "dz" | "d";
export const FIELD_LABEL: Record<FieldKind, string> = { dx: "d_x", dz: "d_z", d: "d" };

/** Campo nodal en mm con el signo de GEO5: d_x + hacia la izquierda, d_z asiento +, d resultante. */
export function nodalField(u: Float64Array, uel: Float64Array, nn: number, kind: FieldKind): Float64Array {
  const f = new Float64Array(nn);
  for (let i = 0; i < nn; i++) {
    const ux = u[2 * i] - uel[2 * i], uy = u[2 * i + 1] - uel[2 * i + 1];
    f[i] = kind === "dx" ? -ux * 1e3 : kind === "dz" ? -uy * 1e3 : Math.hypot(ux, uy) * 1e3;
  }
  return f;
}
