// MURO DE CONTENCIÓN EN 2D: UNA SOLA ÁREA con la forma de la sección transversal (Jorge, 19-sep-2026:
// «una sola área en forma geométrica de una sección transversal de muro de contención», comparada con
// el mismo área 2D en SAP2000). Es la TERCERA ventana del muro, junto a la verificación analítica
// (cuerpo rígido, módulo Cantilever Wall de GEO5) y a los sólidos H8 en 3D.
//
//   sección   puntera · fuste (cara vista vertical hasta el terreno de delante e inclinada hasta la
//             coronación, trasdós vertical) · talón · zapata · DENTELLÓN opcional bajo la zapata
//   elemento  Q4 isoparamétrico en DEFORMACIÓN PLANA, 1 m de ancho. Con o sin los modos incompatibles
//             de Wilson corregidos por Taylor (J₀ del centro): son las dos opciones del elemento «Plane»
//             de SAP2000 (`PropArea.SetPlane(..., Incompatible)`), que es el oráculo nudo a nudo.
//   suelo     no es malla: EMPUJA (Ka·(γ·profundidad + q) en el trasdós), PESA (relleno sobre el talón y
//             sobre la puntera) y SOSTIENE (Winkler ks en la base; el deslizamiento lo toma el
//             dentellón, o la base entera si no lo hay).
//
// Unidades kN, m. x horizontal (la tierra retenida hacia +x), z vertical hacia arriba.
import type { WallParam } from "../model/dsl";
import { wallLevels } from "../model/dsl";
import { bandCreate, bandAdd, bandFactor, bandSolve, reverseCuthillMcKee } from "../geofem/band";

export type Muro2DOpts = {
  /** espesor del fuste en la coronación [m] (el trasdós es vertical; la cara vista se inclina) */
  corona: number;
  /** dentellón: ancho, profundidad bajo la zapata y x de su eje (0 = sin dentellón) */
  bD: number; hD: number; xD: number;
  /** tamaño de elemento [m] */
  ms: number;
  /** balasto de la base [kN/m³] */
  ks: number;
  /** empuje: Ka, γ del relleno, sobrecarga q; γ del hormigón */
  Ka: number; gamma: number; q: number; gammaC: number;
  E: number; nu: number;
  incompatible: boolean;
};

export type Muro2D = {
  nodes: [number, number][];
  quads: [number, number, number, number][];
  /** fuerzas nodales [Fx, Fz] (peso propio consistente + empuje + rellenos) */
  loads: Map<number, [number, number]>;
  /** muelles verticales k [kN/m] por nudo (Winkler de la base, por área tributaria) */
  springs: Map<number, number>;
  /** nudos con ux restringido (dentellón; la base entera si no hay dentellón) */
  fixX: Set<number>;
  info: { ks: number; B: number; zb: number; ztf: number; ztop: number; x: number; xf: number; nCorona: number;
    empuje: number; peso: number; rellenos: number; baseXs: number[] };
};

const div = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
const nDiv = (L: number, ms: number) => Math.max(1, Math.round(Math.abs(L) / ms));
const uniq = (v: number[]) => [...new Set(v.map((x) => +x.toFixed(9)))].sort((a, b) => a - b);
const trib = (v: number[]) => v.map((_, i) => ((i > 0 ? v[i] - v[i - 1] : 0) + (i < v.length - 1 ? v[i + 1] - v[i] : 0)) / 2);

/** La malla Q4 de la sección, con cargas y apoyos. `zGround` = cota del terreno delante del muro. */
export function mallaMuro2D(pm: WallParam, zGround: number, o: Muro2DOpts): Muro2D {
  const lv = wallLevels(pm, zGround);
  const { zb, ztf, ztop } = lv, x = pm.x, xf = x + pm.fuste, zg = Math.min(Math.max(zGround, ztf), ztop);
  const xTop = xf - Math.min(Math.max(o.corona, 0.05), pm.fuste);                // cara vista en la coronación
  const front = (z: number) => z <= zg ? x : x + (xTop - x) * (z - zg) / (ztop - zg);
  const conD = o.bD > 1e-9 && o.hD > 1e-9;
  const xD0 = o.xD - o.bD / 2, xD1 = o.xD + o.bD / 2;
  // líneas en x de la zapata: puntera · base del fuste · talón (+ los bordes del dentellón)
  const xs = uniq([...div(x - pm.dedo, x, nDiv(pm.dedo, o.ms)), ...div(x, xf, Math.max(2, nDiv(pm.fuste, o.ms))),
    ...div(xf, xf + pm.talon, nDiv(pm.talon, o.ms)), ...(conD ? [xD0, xD1] : [])])
    .filter((v) => v >= x - pm.dedo - 1e-9 && v <= xf + pm.talon + 1e-9);
  const zsF = div(zb, ztf, Math.max(2, nDiv(pm.zapata, o.ms)));
  const zsS = uniq([...div(ztf, zg, zg > ztf + 1e-9 ? nDiv(zg - ztf, o.ms) : 0), ...div(zg, ztop, nDiv(ztop - zg, o.ms))]);
  const xsS = xs.filter((v) => v >= x - 1e-9 && v <= xf + 1e-9);                   // las del fuste, en su base
  const uS = xsS.map((v) => (v - x) / (xf - x));

  const nodes: [number, number][] = [], ids = new Map<string, number>();
  const nodo = (px: number, pz: number) => {
    const k = `${px.toFixed(7)},${pz.toFixed(7)}`;
    let id = ids.get(k);
    if (id === undefined) { id = nodes.length; ids.set(k, id); nodes.push([px, pz]); }
    return id;
  };
  const quads: [number, number, number, number][] = [];
  // zapata
  for (let i = 0; i < xs.length - 1; i++) for (let k = 0; k < zsF.length - 1; k++)
    quads.push([nodo(xs[i], zsF[k]), nodo(xs[i + 1], zsF[k]), nodo(xs[i + 1], zsF[k + 1]), nodo(xs[i], zsF[k + 1])]);
  // fuste: cada fila de z con sus líneas repartidas entre la cara vista y el trasdós
  const xAt = (j: number, z: number) => front(z) + uS[j] * (xf - front(z));
  for (let j = 0; j < xsS.length - 1; j++) for (let k = 0; k < zsS.length - 1; k++) {
    const za = zsS[k], zc = zsS[k + 1];
    quads.push([nodo(xAt(j, za), za), nodo(xAt(j + 1, za), za), nodo(xAt(j + 1, zc), zc), nodo(xAt(j, zc), zc)]);
  }
  // dentellón
  const xsD = conD ? xs.filter((v) => v >= xD0 - 1e-9 && v <= xD1 + 1e-9) : [];
  const zsD = conD ? div(zb - o.hD, zb, Math.max(2, nDiv(o.hD, o.ms))) : [];
  for (let i = 0; i < xsD.length - 1; i++) for (let k = 0; k < zsD.length - 1; k++)
    quads.push([nodo(xsD[i], zsD[k]), nodo(xsD[i + 1], zsD[k]), nodo(xsD[i + 1], zsD[k + 1]), nodo(xsD[i], zsD[k + 1])]);

  // ── cargas ──
  const loads = new Map<number, [number, number]>();
  const add = (n: number, fx: number, fz: number) => { const c = loads.get(n) ?? [0, 0]; c[0] += fx; c[1] += fz; loads.set(n, c); };
  // peso propio CONSISTENTE: f_i = −γc ∫ N_i dA (Gauss 2×2; en la cara inclinada el Q4 no es rectángulo)
  let peso = 0;
  for (const q of quads) {
    const P = q.map((n) => nodes[n]);
    for (const [xi, eta] of GAUSS2) {
      const { N, detJ } = shapeQ4(P, xi, eta);
      for (let a = 0; a < 4; a++) { add(q[a], 0, -o.gammaC * N[a] * detJ); }
      peso += o.gammaC * detJ;
    }
  }
  // empuje en el trasdós (x = xf), de la cara de arriba de la zapata a la coronación, hacia −x
  const tz = trib(zsS);
  let empuje = 0;
  zsS.forEach((z, k) => { const f = o.Ka * (o.gamma * (ztop - z) + o.q) * tz[k]; add(nodo(xf, z), -f, 0); empuje += f; });
  // relleno sobre el talón (γ·(ztop − ztf) + q) y suelo sobre la puntera (γ·(zg − ztf))
  let rellenos = 0;
  const xsT = xs.filter((v) => v >= xf - 1e-9), tT = trib(xsT);
  xsT.forEach((v, i) => { const f = (o.gamma * (ztop - ztf) + o.q) * tT[i]; add(nodo(v, ztf), 0, -f); rellenos += f; });
  if (zg > ztf + 1e-9) {
    const xsP = xs.filter((v) => v <= x + 1e-9), tP = trib(xsP);
    xsP.forEach((v, i) => { const f = o.gamma * (zg - ztf) * tP[i]; add(nodo(v, ztf), 0, -f); rellenos += f; });
  }

  // ── apoyos: Winkler en la superficie de contacto (base fuera del dentellón + fondo del dentellón) ──
  const springs = new Map<number, number>(), fixX = new Set<number>();
  const muelle = (n: number, k: number) => springs.set(n, (springs.get(n) ?? 0) + k);
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1];
    if (conD && a >= xD0 - 1e-9 && b <= xD1 + 1e-9) continue;              // ahí la base es el dentellón
    const k = o.ks * (b - a) / 2; muelle(nodo(a, zb), k); muelle(nodo(b, zb), k);
  }
  for (let i = 0; i < xsD.length - 1; i++) {
    const k = o.ks * (xsD[i + 1] - xsD[i]) / 2; muelle(nodo(xsD[i], zb - o.hD), k); muelle(nodo(xsD[i + 1], zb - o.hD), k);
  }
  if (conD) xsD.forEach((v) => fixX.add(nodo(v, zb - o.hD)));
  else xs.forEach((v) => fixX.add(nodo(v, zb)));

  return { nodes, quads, loads, springs, fixX,
    info: { ks: o.ks, B: pm.dedo + pm.fuste + pm.talon, zb, ztf, ztop, x, xf, nCorona: nodo(xTop, ztop), empuje, peso, rellenos, baseXs: xs } };
}

// ─────────────────────────────────────────────────────────────────────
// Elemento Q4 de deformación plana (con modos incompatibles de Wilson-Taylor opcionales)
// ─────────────────────────────────────────────────────────────────────
const g = 1 / Math.sqrt(3);
const GAUSS2: [number, number][] = [[-g, -g], [g, -g], [g, g], [-g, g]];
const XI = [-1, 1, 1, -1], ETA = [-1, -1, 1, 1];

function shapeQ4(P: [number, number][], xi: number, eta: number) {
  const N = XI.map((a, i) => 0.25 * (1 + a * xi) * (1 + ETA[i] * eta));
  const dxi = XI.map((a, i) => 0.25 * a * (1 + ETA[i] * eta));
  const deta = XI.map((a, i) => 0.25 * ETA[i] * (1 + a * xi));
  let J11 = 0, J12 = 0, J21 = 0, J22 = 0;
  for (let i = 0; i < 4; i++) { J11 += dxi[i] * P[i][0]; J12 += dxi[i] * P[i][1]; J21 += deta[i] * P[i][0]; J22 += deta[i] * P[i][1]; }
  const detJ = J11 * J22 - J12 * J21;
  const inv = [J22 / detJ, -J12 / detJ, -J21 / detJ, J11 / detJ];          // [dξ/dx dη/dx; dξ/dz dη/dz] ordenado
  const dx = dxi.map((d, i) => inv[0] * d + inv[1] * deta[i]);
  const dz = dxi.map((d, i) => inv[2] * d + inv[3] * deta[i]);
  return { N, dx, dz, detJ, inv };
}

function Dmat(E: number, nu: number) {
  const c = E / ((1 + nu) * (1 - 2 * nu));
  return [[c * (1 - nu), c * nu, 0], [c * nu, c * (1 - nu), 0], [0, 0, c * (1 - 2 * nu) / 2]];
}

/** K del elemento (8×8) y, con modos incompatibles, lo necesario para recuperar α. */
function kQ4(P: [number, number][], D: number[][], incompatible: boolean) {
  const nd = incompatible ? 12 : 8;
  const K = Array.from({ length: nd }, () => new Float64Array(nd));
  const c0 = shapeQ4(P, 0, 0);
  for (const [xi, eta] of GAUSS2) {
    const s = shapeQ4(P, xi, eta);
    // B = [∂/∂x 0; 0 ∂/∂z; ∂/∂z ∂/∂x]; columnas: u1 w1 … u4 w4 (+ a1 b1 a2 b2 incompatibles)
    const dN: [number, number][] = s.dx.map((d, i) => [d, s.dz[i]]);
    if (incompatible) {
      // modos (1−ξ²), (1−η²); derivadas con J₀⁻¹ del centro y escaladas por detJ₀/detJ (Taylor 1976):
      // así ∫B_inc dΩ = 0 y el elemento pasa el patch test aunque esté distorsionado.
      const f = c0.detJ / s.detJ;
      const dP = [[-2 * xi, 0], [0, -2 * eta]];                               // (∂/∂ξ, ∂/∂η) de cada modo
      for (const [dxi, deta] of dP) dN.push([f * (c0.inv[0] * dxi + c0.inv[1] * deta), f * (c0.inv[2] * dxi + c0.inv[3] * deta)]);
    }
    const B = [new Float64Array(nd), new Float64Array(nd), new Float64Array(nd)];
    dN.forEach(([ddx, ddz], a) => { B[0][2 * a] = ddx; B[1][2 * a + 1] = ddz; B[2][2 * a] = ddz; B[2][2 * a + 1] = ddx; });
    const w = s.detJ;
    for (let i = 0; i < nd; i++) {
      const DB = [0, 1, 2].map((r) => D[r][0] * B[0][i] + D[r][1] * B[1][i] + D[r][2] * B[2][i]);
      for (let j = 0; j < nd; j++) K[i][j] += w * (B[0][j] * DB[0] + B[1][j] * DB[1] + B[2][j] * DB[2]);
    }
  }
  if (!incompatible) return { K, Kc: K, Kai: null as number[][] | null, Kii: null as number[][] | null };
  // condensación estática de los 4 gdl internos: Kc = Kcc − Kci Kii⁻¹ Kic
  const Kii = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => K[8 + i][8 + j]));
  const iKii = inv4(Kii);
  const Kc = Array.from({ length: 8 }, (_, i) => new Float64Array(8));
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    let s = K[i][j];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) s -= K[i][8 + a] * iKii[a][b] * K[8 + b][j];
    Kc[i][j] = s;
  }
  const Kai = [0, 1, 2, 3].map((a) => Array.from({ length: 8 }, (_, j) => K[8 + a][j]));
  return { K, Kc, Kai, Kii: iKii };
}

function inv4(A: number[][]): number[][] {
  const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r) => r.slice(n));
}

export type Muro2DResult = {
  u: [number, number][];                      // desplazamientos [ux, uz] por nudo [m]
  /** tensiones en el centro de cada elemento [σxx, σzz, τxz, von Mises] [kPa] */
  sigma: [number, number, number, number][];
  /** presión de contacto en cada nudo con muelle: k·(−uz)/ancho tributario [kPa] */
  contacto: { x: number; z: number; p: number }[];
  /** reacciones: ΣRx (restricciones) y ΣRz (muelles) */
  Rx: number; Rz: number;
  ms: number;
};

/** Resuelve la malla. Elimina los gdl restringidos (ux del dentellón) y suma los muelles a la diagonal. */
export function resolverMuro2D(m: Muro2D, E: number, nu: number, incompatible: boolean): Muro2DResult {
  const t0 = performance.now();
  const nn = m.nodes.length, D = Dmat(E, nu);
  const perm = reverseCuthillMcKee(nn, m.quads as unknown as number[][]);   // perm[nuevo] = viejo
  const pos = new Int32Array(nn); perm.forEach((old, k) => { pos[old] = k; });
  const dof = (n: number, c: number) => 2 * pos[n] + c;
  let bw = 0;
  for (const q of m.quads) for (const a of q) for (const b of q) bw = Math.max(bw, Math.abs(dof(a, 1) - dof(b, 0)), Math.abs(dof(a, 0) - dof(b, 1)));
  const K = bandCreate(2 * nn, bw + 1);
  const eK = m.quads.map((q) => kQ4(q.map((n) => m.nodes[n]) as [number, number][], D, incompatible));
  m.quads.forEach((q, e) => {
    const Kc = eK[e].Kc;
    for (let a = 0; a < 4; a++) for (let ca = 0; ca < 2; ca++) for (let b = 0; b < 4; b++) for (let cb = 0; cb < 2; cb++)
      bandAdd(K, dof(q[a], ca), dof(q[b], cb), Kc[2 * a + ca][2 * b + cb]);
  });
  for (const [n, k] of m.springs) bandAdd(K, dof(n, 1), dof(n, 1), k);
  const F = new Float64Array(2 * nn);
  for (const [n, [fx, fz]] of m.loads) { F[dof(n, 0)] += fx; F[dof(n, 1)] += fz; }
  // restricción ux = 0 por penalización exacta: fila/columna a la identidad (el gdl se elimina)
  const fijos = [...m.fixX].map((n) => dof(n, 0));
  const Kcopy = new Float64Array(K.a);                                      // para las reacciones
  for (const d of fijos) {
    for (let j = Math.max(0, d - K.b); j <= Math.min(2 * nn - 1, d + K.b); j++) { K.a[d * K.w + (j - d + K.b)] = 0; K.a[j * K.w + (d - j + K.b)] = 0; }
    K.a[d * K.w + K.b] = 1; F[d] = 0;
  }
  if (!bandFactor(K)) throw new Error("la matriz es singular: el muro no está bien apoyado");
  const U = new Float64Array(2 * nn);
  bandSolve(K, F, U);
  const u = m.nodes.map((_, n) => [U[dof(n, 0)], U[dof(n, 1)]] as [number, number]);
  // reacciones en los gdl restringidos: R = (K·u − F) con la K sin tocar
  let Rx = 0;
  const Fo = new Float64Array(2 * nn); for (const [n, [fx, fz]] of m.loads) { Fo[dof(n, 0)] += fx; Fo[dof(n, 1)] += fz; }
  for (const d of fijos) {
    let s = 0; for (let j = Math.max(0, d - K.b); j <= Math.min(2 * nn - 1, d + K.b); j++) s += Kcopy[d * K.w + (j - d + K.b)] * U[j];
    Rx += s - Fo[d];
  }
  let Rz = 0; for (const [n, k] of m.springs) Rz += -k * u[n][1];
  // tensiones en el centro (con los α recuperados si hay modos incompatibles)
  const sigma = m.quads.map((q, e) => {
    const P = q.map((n) => m.nodes[n]) as [number, number][];
    const ue = q.flatMap((n) => u[n]);
    const s = shapeQ4(P, 0, 0);
    let exx = 0, ezz = 0, gxz = 0;
    for (let a = 0; a < 4; a++) { exx += s.dx[a] * ue[2 * a]; ezz += s.dz[a] * ue[2 * a + 1]; gxz += s.dz[a] * ue[2 * a] + s.dx[a] * ue[2 * a + 1]; }
    // en el centro las derivadas de (1−ξ²) y (1−η²) son 0: los modos incompatibles no aportan ahí
    const sx = D[0][0] * exx + D[0][1] * ezz, sz = D[1][0] * exx + D[1][1] * ezz, t = D[2][2] * gxz;
    const sy = nu * (sx + sz);
    const vm = Math.sqrt(0.5 * ((sx - sy) ** 2 + (sy - sz) ** 2 + (sz - sx) ** 2) + 3 * t * t);
    return [sx, sz, t, vm] as [number, number, number, number];
  });
  // presión de contacto: fuerza del muelle / ancho tributario
  const contacto: Muro2DResult["contacto"] = [];
  // p = k·(−uz)/b_trib con k = ks·b_trib  ⇒  p = ks·(−uz)
  for (const [n] of m.springs) contacto.push({ x: m.nodes[n][0], z: m.nodes[n][1], p: m.info.ks * (-u[n][1]) });
  contacto.sort((a, b) => a.z - b.z || a.x - b.x);
  return { u, sigma, contacto, Rx, Rz, ms: performance.now() - t0 };
}
