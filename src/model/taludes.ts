// TALUD BASE + VARIANTES (Jorge, 2-nov-2026): «más formas de graficar un talud parametrizado; al cambiar de tipo NO debe salir otro
// talud, debe cambiar EL MISMO talud que está por defecto». Hay UN talud base (el clásico de GEO5: pie, cara a β hasta H, corona,
// contratalud) y cada tipo es una MODIFICACIÓN de ese talud: misma altura H, mismo pie, misma cresta (cuando el tipo lo permite),
// mismos estratos, agua, cargas y márgenes. Así el FS de cada variante se compara con el del base.
//
//   talud xpie=11 zpie=-9 H=6.5 beta=33 corona=8.5 zfin=-4 beta2=28.6 tipo=berma nb=1 b=2 hb1=3.25      (línea del DSL .hgeo)
//   talud … tipo=puntos pts=0,-9;11,-9;16,-5;21,-2.5;40,-2.5      perfil por puntos (también: arrastrar vértices en el lienzo)
//   talud … tipo=tramos tr=40/2;1.5h/2                            tramos desde el pie: ángulo°/Δz  o  nH (H:V = n:1)/Δz; cierra a la cresta
//
// Sin `tipo=` (o `tipo=clasico`) el talud es el base tal cual: el FS de Demo04 y del muro de Manabí no cambia.
// Cada variante declara su ZONA [x0, x1]: fuera de ella el terreno es EXACTAMENTE el del base (lo comprueban las pruebas).
import type { Pt, TaludParam } from "./dsl";

const RAD = Math.PI / 180;
const cot = (b: number) => 1 / Math.max(Math.tan(b * RAD), 1e-6);
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

/** Terreno del talud BASE (clásico de GEO5): pie plano → cara a β (con `bermas` iguales si las hay) → corona → contratalud β₂ → plano. */
export function terrainFromParam(pm: TaludParam, xmin: number, xmax: number): Pt[] {
  const tb = Math.tan((pm.beta * Math.PI) / 180), tb2 = Math.tan((pm.beta2 * Math.PI) / 180);
  const nb = Math.max(0, Math.round(pm.bermas ?? 0)), wb = nb ? Math.max(0, pm.berma ?? 0) : 0;
  const hc = pm.H / (nb + 1);                                   // altura de cada cara del talud escalonado
  const pts: Pt[] = [[xmin, pm.zpie], [pm.xpie, pm.zpie]];
  let x = pm.xpie, z = pm.zpie;
  for (let k = 0; k <= nb; k++) {                                // cara k (a beta°) y, salvo la última, su berma
    x += hc / Math.max(tb, 1e-6); z += hc; pts.push([x, z]);
    if (k < nb && wb > 0) { x += wb; pts.push([x, z]); }
  }
  const zc = pm.zpie + pm.H, x2 = x + pm.corona, drop = zc - pm.zfin;
  pts.push([x2, zc]);
  if (Math.abs(drop) > 1e-9) pts.push([x2 + Math.abs(drop) / Math.max(tb2, 1e-6), pm.zfin]);
  pts.push([xmax, pts[pts.length - 1][1]]);
  return pts.filter((q, i, a) => i === 0 || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) > 1e-9);
}

/** y(x) de una polilínea ordenada en x (extremos: horizontal) */
export function yEn(P: Pt[], x: number): number {
  if (x <= P[0][0]) return P[0][1];
  for (let i = 0; i + 1 < P.length; i++) if (x <= P[i + 1][0]) { const dx = P[i + 1][0] - P[i][0]; return dx < 1e-12 ? P[i + 1][1] : P[i][1] + ((x - P[i][0]) / dx) * (P[i + 1][1] - P[i][1]); }
  return P[P.length - 1][1];
}

/** Lo que se conserva del talud base: pie, cresta, H, L (proyección horizontal de la cara) e índices en la polilínea. */
export type BaseGeom = { pm: TaludParam; terr: Pt[]; pie: Pt; cresta: Pt; H: number; L: number; xmin: number; xmax: number; iPie: number; iCresta: number };
export function baseGeom(pm: TaludParam, xmin: number, xmax: number): BaseGeom {
  const terr = terrainFromParam(pm, xmin, xmax), zc = pm.zpie + pm.H;
  let iPie = terr.findIndex((p) => Math.abs(p[0] - pm.xpie) < 1e-9 && Math.abs(p[1] - pm.zpie) < 1e-9); if (iPie < 0) iPie = 0;
  let iCresta = terr.findIndex((p, i) => i > iPie && Math.abs(p[1] - zc) < 1e-9); if (iCresta < 0) iCresta = Math.min(iPie + 1, terr.length - 1);
  return { pm, terr, pie: terr[iPie], cresta: terr[iCresta], H: pm.H, L: terr[iCresta][0] - terr[iPie][0], xmin, xmax, iPie, iCresta };
}

/** x crecientes, sin repetidos, de xmin a xmax (una interfaz de GEO5 es y(x)) */
function limpiar(pts: Pt[], xmin: number, xmax: number): Pt[] {
  const out: Pt[] = [];
  for (const q0 of pts) {
    const q: Pt = [clamp(q0[0], xmin, xmax), q0[1]], p = out[out.length - 1];
    if (p && Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9) continue;
    if (p && q[0] < p[0] - 1e-9) continue;
    out.push(q);
  }
  if (out[0][0] > xmin + 1e-9) out.unshift([xmin, out[0][1]]);
  if (out[out.length - 1][0] < xmax - 1e-9) out.push([xmax, out[out.length - 1][1]]);
  return out;
}
/** sustituye la CARA del base (del pie a la cresta) por `cara` (que empieza en el pie); después sigue el base desde x > fin de la cara */
function cambiarCara(b: BaseGeom, cara: Pt[]): Pt[] {
  const fin = cara[cara.length - 1][0];
  return limpiar([...b.terr.slice(0, b.iPie), ...cara, ...b.terr.filter((p, i) => i > b.iPie && p[0] > fin + 1e-9)], b.xmin, b.xmax);
}
/** primer cruce, desde p y hacia `dir` (+1 derecha, −1 izquierda), de la recta z = p.z + m·(x − p.x) con la polilínea A */
function cruce(A: Pt[], p: Pt, m: number, dir: 1 | -1, xlim: number): Pt {
  const f = (x: number) => yEn(A, x) - (p[1] + m * (x - p[0]));
  const xs = A.map((q) => q[0]).filter((x) => (dir > 0 ? x > p[0] && x < xlim : x < p[0] && x > xlim)).sort((a, c) => dir * (a - c));
  let x0 = p[0], f0 = f(x0);
  for (const x1 of [...xs, xlim]) {
    const f1 = f(x1);
    if ((f0 <= 0 && f1 >= 0) || (f0 >= 0 && f1 <= 0)) { const x = Math.abs(f1 - f0) < 1e-12 ? x1 : x0 + ((x1 - x0) * f0) / (f0 - f1); return [x, yEn(A, x)]; }
    x0 = x1; f0 = f1;
  }
  return [xlim, yEn(A, xlim)];
}
/** A con el tramo de T superpuesto: op = max (relleno) o min (excavación). T empieza y acaba SOBRE A (no hay saltos). */
function superponer(A: Pt[], T: Pt[], op: "max" | "min", xmin: number, xmax: number): Pt[] {
  const t0 = T[0][0], tn = T[T.length - 1][0], F = op === "max" ? Math.max : Math.min;
  const xs = [...new Set([...A.map((p) => p[0]).filter((x) => x > t0 && x < tn), ...T.map((p) => p[0])])].sort((a, c) => a - c);
  const mid: Pt[] = [];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]; mid.push([x, F(yEn(A, x), yEn(T, x))]);
    if (i + 1 < xs.length) {
      const x1 = xs[i + 1], d0 = yEn(A, x) - yEn(T, x), d1 = yEn(A, x1) - yEn(T, x1);
      if (d0 * d1 < -1e-18) { const xc = x + ((x1 - x) * d0) / (d0 - d1); mid.push([xc, yEn(A, xc)]); }
    }
  }
  return limpiar([...A.filter((p) => p[0] < t0 - 1e-9), ...mid, ...A.filter((p) => p[0] > tn + 1e-9)], xmin, xmax);
}

export type ParamDef = {
  key: string; label: string; unit: string; def: number; min: number; max: number; step: number;
  /** valor por defecto que depende del talud base (p. ej. la cota de la berma = H/2) */
  defBase?: (b: BaseGeom, p: Record<string, number>) => number;
  /** máximo que depende del talud base (p. ej. la berma no puede superar H) */
  maxBase?: (b: BaseGeom) => number;
  visible?: (p: Record<string, number>) => boolean;
};
export type Tramo = { ang: number; dz: number; hv?: number };
/** variante elegida: tipo + parámetros (+ puntos o tramos en los tipos que los usan) */
export type Variante = { id: string; p: Record<string, number>; pts?: Pt[]; tramos?: Tramo[]; origen?: string };
export type TipoVariante = {
  id: string; nombre: string; descripcion: string; params: ParamDef[];
  /** qué conserva del talud base (texto para la nota y el documento) */
  conserva: string;
  aplicar: (b: BaseGeom, v: Variante) => Pt[];
  /** intervalo de x donde la variante puede cambiar el terreno; fuera, terreno = base */
  zona: (b: BaseGeom, v: Variante) => [number, number];
  /** al mover el parámetro `key`, reajusta los que dependen de él (p. ej. n.º de bermas → cotas repartidas) */
  ajustar?: (b: BaseGeom, p: Record<string, number>, key: string) => void;
};

const bermaCotas = (b: BaseGeom, p: Record<string, number>) => { const n = clamp(Math.round(p.nb), 1, 3); for (let k = 1; k <= 3; k++) p["hb" + k] = Math.round((b.H * k) / (n + 1) * 100) / 100; };
/** relleno del terraplén: polígono superior [inicio, …, fin], ambos extremos sobre el terreno base */
function rellenoTerraplen(b: BaseGeom, p: Record<string, number>): Pt[] {
  const w = p.Ht * cot(p.bf), m = Math.tan(p.bf * RAD);
  if (Math.round(p.lado) === 1) {                                   // al PIE (contrafuerte / berma de pie): sube por la cara hasta Ht
    const zt = b.pie[1] + p.Ht, xh = cruce(b.terr, [b.pie[0], zt], 0, 1, b.cresta[0])[0], xs = Math.max(xh - p.bt, b.xmin + w + 0.5);
    const izq = cruce(b.terr, [xs, zt], m, -1, b.xmin);
    return [izq, [xs, zt], [xh, zt]];
  }
  const xa = Math.min(b.cresta[0] + p.dc, b.xmax - 1), za = yEn(b.terr, xa);   // sobre la CORONA, a dc de la cresta
  const x1 = Math.min(xa + w, b.xmax), x2 = Math.min(x1 + p.bt, b.xmax), zt = za + p.Ht;
  const der = x2 < b.xmax ? cruce(b.terr, [x2, zt], -m, 1, b.xmax) : ([b.xmax, zt] as Pt);
  return [[xa, za], [x1, zt], [x2, zt], der];
}
function cunetaPts(b: BaseGeom, p: Record<string, number>): Pt[] {
  const w = p.d * cot(p.bz), x3 = b.pie[0] - p.sep, x2 = x3 - w, x1 = Math.max(x2 - p.fondo, b.xmin + w + 0.2), x0 = x1 - w;
  return [[x0, yEn(b.terr, x0)], [x1, yEn(b.terr, x1) - p.d], [x2, yEn(b.terr, x2) - p.d], [x3, yEn(b.terr, x3)]];
}
/** cara por tramos sucesivos desde el pie; el último cierra a la cresta (misma H) */
function caraTramos(b: BaseGeom, tr: Tramo[]): Pt[] {
  const zc = b.cresta[1], cara: Pt[] = [b.pie]; let x = b.pie[0], z = b.pie[1];
  for (const t of tr) { const dz = Math.min(Math.max(t.dz, 0), zc - z); if (dz <= 1e-6) break; x += dz * cot(t.ang); z += dz; cara.push([x, z]); }
  if (z < zc - 1e-6) cara.push([Math.max(b.cresta[0], x + (zc - z) * cot(85)), zc]);     // cierre a la cresta (la H es la del base)
  const sig = b.terr.find((q, i) => i > b.iCresta)?.[0] ?? b.xmax, last = cara[cara.length - 1];
  if (last[0] > sig - 0.2) last[0] = sig - 0.2;
  return cara;
}

export const VARIANTES: Record<string, TipoVariante> = {
  clasico: {
    id: "clasico", nombre: "Base (clásico GEO5)", descripcion: "el talud base tal cual: pie plano → cara a β hasta H → corona → contratalud β₂",
    conserva: "todo", params: [], aplicar: (b) => b.terr.map((q) => [q[0], q[1]] as Pt), zona: (b) => [b.pie[0], b.pie[0]],
  },
  angulo: {
    id: "angulo", nombre: "Ángulo de la cara", descripcion: "la misma H desde el mismo pie con otro ángulo β′: la cresta corre sobre la corona",
    conserva: "pie, H, estratos (la cresta se desplaza sobre la corona)",
    params: [{ key: "betav", label: "talud β′", unit: "°", def: 33, min: 10, max: 80, step: 0.5, defBase: (b) => b.pm.beta }],
    aplicar: (b, v) => { const sig = b.terr[b.iCresta + 1]?.[0] ?? b.xmax; return cambiarCara(b, [b.pie, [Math.min(b.pie[0] + b.H * cot(v.p.betav), sig - 0.2), b.cresta[1]]]); },
    zona: (b, v) => [b.pie[0], Math.max(b.cresta[0], Math.min(b.pie[0] + b.H * cot(v.p.betav), b.terr[b.iCresta + 1]?.[0] ?? b.xmax))],
  },
  berma: {
    id: "berma", nombre: "Con bermas", descripcion: "se insertan n bermas de ancho b a las cotas h_b sin mover el pie ni la cresta: las caras quedan más empinadas",
    conserva: "pie, cresta, H, estratos",
    params: [
      { key: "nb", label: "n.º de bermas", unit: "", def: 1, min: 1, max: 3, step: 1 },
      { key: "b", label: "ancho de berma b", unit: "m", def: 2, min: 0.25, max: 8, step: 0.25 },
      { key: "hb1", label: "cota berma 1 sobre el pie", unit: "m", def: 3, min: 0.2, max: 30, step: 0.05, defBase: (b, p) => b.H / (clamp(Math.round(p.nb ?? 1), 1, 3) + 1), maxBase: (b) => b.H - 0.2 },
      { key: "hb2", label: "cota berma 2 sobre el pie", unit: "m", def: 4, min: 0.2, max: 30, step: 0.05, defBase: (b, p) => (2 * b.H) / (clamp(Math.round(p.nb ?? 1), 1, 3) + 1), maxBase: (b) => b.H - 0.2, visible: (p) => p.nb >= 2 },
      { key: "hb3", label: "cota berma 3 sobre el pie", unit: "m", def: 5, min: 0.2, max: 30, step: 0.05, defBase: (b, p) => (3 * b.H) / (clamp(Math.round(p.nb ?? 1), 1, 3) + 1), maxBase: (b) => b.H - 0.2, visible: (p) => p.nb >= 3 }],
    ajustar: (b, p, key) => { if (key === "nb") bermaCotas(b, p); },
    aplicar: (b, v) => {
      const p = v.p, n = clamp(Math.round(p.nb), 1, 3), H = b.H, L = b.L;
      const bw = clamp(p.b, 0, Math.max(0, (L - 0.3 * H) / n));                 // las caras no pasan de ~73°
      const hs: number[] = []; for (let k = 1; k <= n; k++) hs.push(clamp(p["hb" + k], 0.2, H - 0.2));
      hs.sort((a, c) => a - c); for (let k = 1; k < hs.length; k++) hs[k] = Math.max(hs[k], hs[k - 1] + 0.2);
      const kx = (L - n * bw) / H, cara: Pt[] = [b.pie]; let x = b.pie[0], z = b.pie[1];
      for (const h of hs) { const zb = b.pie[1] + Math.min(h, H - 0.05); x += (zb - z) * kx; z = zb; cara.push([x, z]); x += bw; cara.push([x, z]); }
      cara.push([b.cresta[0], b.cresta[1]]);
      return cambiarCara(b, cara);
    },
    zona: (b) => [b.pie[0], b.cresta[0]],
  },
  dos_pendientes: {
    id: "dos_pendientes", nombre: "Dos pendientes", descripcion: "el mismo H partido en dos tramos: β₁ abajo hasta la cota del quiebre h_q; arriba sube recto a la cresta",
    conserva: "pie, cresta, H, estratos",
    params: [
      { key: "hq", label: "cota del quiebre h_q", unit: "m", def: 3, min: 0.2, max: 30, step: 0.05, defBase: (b) => b.H / 2, maxBase: (b) => b.H - 0.2 },
      { key: "beta1", label: "talud inferior β₁", unit: "°", def: 45, min: 10, max: 80, step: 0.5, defBase: (b) => Math.min(b.pm.beta + 12, 80) }],
    aplicar: (b, v) => {
      const hq = clamp(v.p.hq, 0.2, b.H - 0.2), x1 = clamp(b.pie[0] + hq * cot(v.p.beta1), b.pie[0] + hq * cot(85), b.cresta[0] - (b.H - hq) * cot(85));
      return cambiarCara(b, [b.pie, [x1, b.pie[1] + hq], b.cresta]);
    },
    zona: (b) => [b.pie[0], b.cresta[0]],
  },
  curvo: {
    id: "curvo", nombre: "Cóncavo / convexo", descripcion: "la cara es una parábola sobre la cuerda pie–cresta: flecha f > 0 convexa (panza afuera), f < 0 cóncava",
    conserva: "pie, cresta, H, estratos",
    params: [{ key: "f", label: "flecha f (+ convexo · − cóncavo)", unit: "m", def: -1, min: -3, max: 3, step: 0.05 }],
    aplicar: (b, v) => {
      const dx = b.cresta[0] - b.pie[0], dz = b.H, L = Math.hypot(dx, dz), nx = -dz / L, ny = dx / L;
      const arco = (f: number): Pt[] => { const a: Pt[] = []; for (let i = 0; i <= 24; i++) { const s = i / 24, o = f * 4 * s * (1 - s); a.push([b.pie[0] + s * dx + nx * o, b.pie[1] + s * dz + ny * o]); } return a; };
      let f = v.p.f, a = arco(f);
      for (let it = 0; it < 40 && a.some((q, i) => i && q[0] < a[i - 1][0] + 1e-6); it++) { f *= 0.9; a = arco(f); }   // nunca vertical ni plegada (y(x))
      return cambiarCara(b, a);
    },
    zona: (b) => [b.pie[0], b.cresta[0]],
  },
  terraplen: {
    id: "terraplen", nombre: "Terraplén / relleno", descripcion: "relleno trapezoidal sobre el mismo talud: en la corona (a dc de la cresta) o al pie (contrafuerte); recibe el suelo de la región de arriba",
    conserva: "H del corte, estratos; en la corona también pie y cresta",
    params: [
      { key: "lado", label: "dónde (0 corona · 1 pie)", unit: "", def: 0, min: 0, max: 1, step: 1 },
      { key: "Ht", label: "altura del relleno", unit: "m", def: 2, min: 0.3, max: 10, step: 0.1 },
      { key: "bt", label: "ancho arriba", unit: "m", def: 3, min: 0.5, max: 15, step: 0.25 },
      { key: "bf", label: "talud del relleno", unit: "°", def: 30, min: 10, max: 60, step: 0.5 },
      { key: "dc", label: "distancia a la cresta", unit: "m", def: 1, min: 0, max: 15, step: 0.25, visible: (p) => Math.round(p.lado) === 0 }],
    aplicar: (b, v) => superponer(b.terr, rellenoTerraplen(b, v.p), "max", b.xmin, b.xmax),
    zona: (b, v) => { const T = rellenoTerraplen(b, v.p); return [T[0][0], T[T.length - 1][0]]; },
  },
  cuneta: {
    id: "cuneta", nombre: "Cuneta al pie", descripcion: "cuneta trapezoidal (profundidad d, fondo, talud lateral) excavada delante del pie, a una separación s",
    conserva: "pie, cresta, H, estratos",
    params: [
      { key: "d", label: "profundidad d", unit: "m", def: 1, min: 0.2, max: 4, step: 0.05 },
      { key: "fondo", label: "ancho del fondo", unit: "m", def: 1.5, min: 0.2, max: 6, step: 0.1 },
      { key: "bz", label: "talud lateral", unit: "°", def: 35, min: 15, max: 70, step: 0.5 },
      { key: "sep", label: "separación al pie s", unit: "m", def: 0, min: 0, max: 8, step: 0.1 }],
    aplicar: (b, v) => superponer(b.terr, cunetaPts(b, v.p), "min", b.xmin, b.xmax),
    zona: (b, v) => { const T = cunetaPts(b, v.p); return [T[0][0], T[T.length - 1][0]]; },
  },
  tramos: {
    id: "tramos", nombre: "Por tramos (ángulo o H:V + Δz)", descripcion: "la cara se escribe tramo a tramo desde el pie: ángulo°/Δz o nH/Δz (H:V = n:1); el último cierra a la cresta (misma H)",
    conserva: "pie, H, estratos (y la cresta si los tramos no la sobrepasan)", params: [],
    aplicar: (b, v) => cambiarCara(b, caraTramos(b, v.tramos ?? [])),
    zona: (b, v) => { const c = caraTramos(b, v.tramos ?? []); return [b.pie[0], Math.max(b.cresta[0], c[c.length - 1][0])]; },
  },
  puntos: {
    id: "puntos", nombre: "Por puntos (x,z · arrastrar)", descripcion: "el terreno es una lista de puntos x,z (tabla o arrastrar los vértices con «mover»; también el perfil de un DXF); estratos y lo demás quedan",
    conserva: "estratos, agua, cargas, márgenes (el perfil es libre)", params: [],
    aplicar: (b, v) => limpiar((v.pts?.length ? v.pts : b.terr).slice().sort((p, q) => p[0] - q[0]), b.xmin, b.xmax),
    zona: () => [-Infinity, Infinity],
  },
};
export const ORDEN_VARIANTES = Object.keys(VARIANTES);

/** parámetros por defecto de una variante SOBRE un talud base (lo dado manda) */
export function paramsVariante(id: string, b: BaseGeom, dados: Record<string, number> = {}): Record<string, number> {
  const t = VARIANTES[id]; if (!t) throw new Error(`tipo de talud desconocido «${id}» (hay: ${ORDEN_VARIANTES.join(", ")})`);
  const o: Record<string, number> = {};
  for (const q of t.params) o[q.key] = dados[q.key] ?? (q.defBase ? Math.round(q.defBase(b, { ...o, ...dados }) * 100) / 100 : q.def);
  return o;
}
export function paramsVisibles(id: string, p: Record<string, number>): ParamDef[] {
  return VARIANTES[id].params.filter((q) => !q.visible || q.visible(p));
}
/** Terreno = talud base + variante (sin variante: el base exacto, el de siempre) */
export function terrenoTalud(pm: TaludParam, v: Variante | undefined, xmin: number, xmax: number): Pt[] {
  if (!v || v.id === "clasico") return terrainFromParam(pm, xmin, xmax);
  const t = VARIANTES[v.id]; if (!t) throw new Error(`tipo de talud desconocido «${v.id}» (hay: ${ORDEN_VARIANTES.join(", ")})`);
  return t.aplicar(baseGeom(pm, xmin, xmax), v);
}

// ---- texto del .hgeo ----
export function tramosDeTexto(s: string): Tramo[] {
  return s.split(/[;\n]/).map((t) => t.trim()).filter(Boolean).map((t) => {
    const m = t.match(/^(-?[\d.]+)\s*(h|H)?(?::1v?)?\s*[/ ]\s*(-?[\d.]+)$/i); if (!m) throw new Error(`tramo inválido «${t}» (usa ángulo/Δz, p. ej. 40/2, o nH/Δz, p. ej. 1.5h/2)`);
    const a = parseFloat(m[1]), dz = parseFloat(m[3]);
    return m[2] ? { hv: a, ang: Math.atan(1 / Math.max(a, 1e-6)) / RAD, dz } : { ang: a, dz };
  });
}
const r3 = (v: number) => String(Math.round(v * 1000) / 1000);
export function tramosATexto(tr: Tramo[]): string { return tr.map((t) => (t.hv !== undefined ? `${r3(t.hv)}h/${r3(t.dz)}` : `${r3(t.ang)}/${r3(t.dz)}`)).join(";"); }
/** sufijo de la línea `talud …` con la variante (vacío para el base) */
export function varianteATexto(v: Variante | undefined): string {
  if (!v || v.id === "clasico") return "";
  if (v.id === "puntos") return ` tipo=puntos pts=${(v.pts ?? []).map((q) => `${r3(q[0])},${r3(q[1])}`).join(";")}`;
  if (v.id === "tramos") return ` tipo=tramos tr=${tramosATexto(v.tramos ?? [])}`;
  return ` tipo=${v.id} ` + paramsVisibles(v.id, v.p).map((q) => `${q.key}=${r3(v.p[q.key])}`).join(" ");
}
/** variante a partir de las claves de la línea `talud` (claves en minúsculas) */
export function varianteDeTexto(o: Record<string, string>, b: BaseGeom): Variante | undefined {
  const id = (o.tipo ?? "clasico").toLowerCase(); if (id === "clasico") return undefined;
  const t = VARIANTES[id]; if (!t) throw new Error(`tipo de talud desconocido «${o.tipo}» (hay: ${ORDEN_VARIANTES.join(", ")})`);
  if (id === "puntos") return { id, p: {}, pts: (o.pts ?? "").split(";").filter(Boolean).map((s) => { const [x, z] = s.split(",").map(Number); if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error(`punto inválido «${s}»`); return [x, z] as Pt; }) };
  if (id === "tramos") return { id, p: {}, tramos: tramosDeTexto(o.tr ?? "") };
  const dados: Record<string, number> = {};
  for (const q of t.params) { const s = o[q.key.toLowerCase()]; if (s !== undefined) { const v = parseFloat(s); if (!Number.isFinite(v)) throw new Error(`número inválido ${q.key}=${s}`); dados[q.key] = v; } }
  return { id, p: paramsVariante(id, b, dados) };
}
