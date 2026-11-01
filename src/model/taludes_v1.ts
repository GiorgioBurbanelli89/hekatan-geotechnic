// TIPOS DE TALUD v1 (1-nov-2026, ya publicados): cada tipo dibujaba un talud DISTINTO desde cero. Desde el 2-nov los tipos son
// VARIANTES del mismo talud base (taludes.ts). Este fichero queda SOLO para leer los .hgeo viejos (`talud tipo=berma h1=… b1=…`
// sin `corona=`): se convierten en el terreno por puntos que dibujaban.
import type { Pt } from "./dsl";

export type ParamDef = {
  key: string; label: string; unit: string; def: number; min: number; max: number; step: number;
  /** si devuelve false el parámetro no se muestra ni se escribe (p. ej. la berma 3 cuando solo hay 2) */
  visible?: (p: Record<string, number>) => boolean;
};
export type TipoTalud = {
  id: string; nombre: string; descripcion: string; params: ParamDef[];
  /** terreno de `xmin` a `xmax`, en metros */
  generar: (p: Record<string, number>, xmin: number, xmax: number) => Pt[];
};

const RAD = Math.PI / 180;
const cot = (b: number) => 1 / Math.max(Math.tan(b * RAD), 1e-6);
const X: ParamDef = { key: "xpie", label: "x del pie", unit: "m", def: 11, min: 2, max: 25, step: 0.5 };
const Z: ParamDef = { key: "zpie", label: "cota del pie", unit: "m", def: -9, min: -20, max: 0, step: 0.1 };

/** recorta a [xmin, xmax], quita puntos repetidos y cierra con tramo horizontal hasta el margen derecho */
function cerrar(pts: Pt[], xmin: number, xmax: number): Pt[] {
  const out: Pt[] = [];
  for (const q of pts) {
    const p = out[out.length - 1];
    if (q[0] > xmax) { if (p && p[0] < xmax) out.push([xmax, p[1] + ((q[1] - p[1]) * (xmax - p[0])) / (q[0] - p[0])]); break; }
    if (p && Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9) continue;
    if (p && q[0] < p[0] - 1e-9) continue;                       // x nunca retrocede: una interfaz de GEO5 es y(x)
    out.push([Math.max(q[0], xmin), q[1]]);
  }
  if (out[0][0] > xmin + 1e-9) out.unshift([xmin, out[0][1]]);
  if (out[out.length - 1][0] < xmax - 1e-9) out.push([xmax, out[out.length - 1][1]]);
  return out;
}

export const TIPOS_V1: Record<string, TipoTalud> = {
  simple: {
    id: "simple", nombre: "Simple inclinado", descripcion: "pie plano → una cara inclinada β hasta la altura H → corona plana hasta el margen",
    params: [X, Z,
      { key: "H", label: "altura H", unit: "m", def: 6.5, min: 1, max: 30, step: 0.1 },
      { key: "beta", label: "talud β", unit: "°", def: 33, min: 10, max: 75, step: 0.5 }],
    generar: (p, xmin, xmax) => cerrar([[xmin, p.zpie], [p.xpie, p.zpie], [p.xpie + p.H * cot(p.beta), p.zpie + p.H]], xmin, xmax),
  },

  berma: {
    id: "berma", nombre: "Con bermas", descripcion: "caras a β separadas por bermas horizontales: cada berma con su ancho y cada cara con su altura (hasta 3 bermas)",
    params: [X, Z,
      { key: "beta", label: "talud β de las caras", unit: "°", def: 33, min: 10, max: 75, step: 0.5 },
      { key: "nb", label: "n.º de bermas", unit: "", def: 2, min: 1, max: 3, step: 1 },
      { key: "h1", label: "altura cara 1", unit: "m", def: 3, min: 0.5, max: 12, step: 0.1 },
      { key: "b1", label: "ancho berma 1", unit: "m", def: 3, min: 0.5, max: 10, step: 0.25 },
      { key: "h2", label: "altura cara 2", unit: "m", def: 3, min: 0.5, max: 12, step: 0.1 },
      { key: "b2", label: "ancho berma 2", unit: "m", def: 3, min: 0.5, max: 10, step: 0.25, visible: (p) => p.nb >= 2 },
      { key: "h3", label: "altura cara 3", unit: "m", def: 3, min: 0.5, max: 12, step: 0.1, visible: (p) => p.nb >= 2 },
      { key: "b3", label: "ancho berma 3", unit: "m", def: 3, min: 0.5, max: 10, step: 0.25, visible: (p) => p.nb >= 3 },
      { key: "h4", label: "altura cara 4", unit: "m", def: 3, min: 0.5, max: 12, step: 0.1, visible: (p) => p.nb >= 3 }],
    generar: (p, xmin, xmax) => {
      const n = Math.max(1, Math.min(3, Math.round(p.nb))), H = [p.h1, p.h2, p.h3, p.h4], B = [p.b1, p.b2, p.b3];
      const pts: Pt[] = [[xmin, p.zpie], [p.xpie, p.zpie]]; let x = p.xpie, z = p.zpie;
      for (let k = 0; k <= n; k++) {
        x += H[k] * cot(p.beta); z += H[k]; pts.push([x, z]);
        if (k < n) { x += B[k]; pts.push([x, z]); }
      }
      return cerrar(pts, xmin, xmax);
    },
  },

  dos_pendientes: {
    id: "dos_pendientes", nombre: "Dos pendientes", descripcion: "la cara cambia de inclinación a una altura intermedia (quiebre): β₁ abajo y β₂ arriba",
    params: [X, Z,
      { key: "H", label: "altura total H", unit: "m", def: 8, min: 2, max: 30, step: 0.1 },
      { key: "hq", label: "altura del quiebre", unit: "m", def: 4, min: 0.5, max: 29, step: 0.1 },
      { key: "beta1", label: "talud inferior β₁", unit: "°", def: 40, min: 10, max: 75, step: 0.5 },
      { key: "beta2", label: "talud superior β₂", unit: "°", def: 22, min: 10, max: 75, step: 0.5 }],
    generar: (p, xmin, xmax) => {
      const hq = Math.min(Math.max(p.hq, 0.2), p.H - 0.2), x1 = p.xpie + hq * cot(p.beta1);
      return cerrar([[xmin, p.zpie], [p.xpie, p.zpie], [x1, p.zpie + hq], [x1 + (p.H - hq) * cot(p.beta2), p.zpie + p.H]], xmin, xmax);
    },
  },

  curvo: {
    id: "curvo", nombre: "Cóncavo / convexo", descripcion: "la cara es un arco (parábola) sobre la cuerda pie-corona; flecha f > 0 convexo (panza afuera), f < 0 cóncavo",
    params: [X, Z,
      { key: "H", label: "altura H", unit: "m", def: 7, min: 2, max: 30, step: 0.1 },
      { key: "beta", label: "talud de la cuerda β", unit: "°", def: 35, min: 15, max: 70, step: 0.5 },
      { key: "f", label: "flecha f (+ convexo · − cóncavo)", unit: "m", def: -1.2, min: -3, max: 3, step: 0.1 }],
    generar: (p, xmin, xmax) => {
      const dx = p.H * cot(p.beta), L = Math.hypot(dx, p.H), nx = -p.H / L, ny = dx / L;      // normal a la cuerda, apunta hacia arriba-izquierda (afuera del talud)
      const arco = (f: number): Pt[] => { const a: Pt[] = []; for (let i = 0; i <= 24; i++) { const s = i / 24, o = f * 4 * s * (1 - s); a.push([p.xpie + s * dx + nx * o, p.zpie + s * p.H + ny * o]); } return a; };
      let f = p.f, a = arco(f);
      for (let it = 0; it < 30 && a.some((q, i) => i && q[0] < a[i - 1][0] + 1e-6); it++) { f *= 0.9; a = arco(f); }   // si la cara se vuelve vertical o se pliega sobre sí misma, se reduce la flecha (la superficie debe ser y(x))
      return cerrar([[xmin, p.zpie], [p.xpie, p.zpie], ...a.slice(1)], xmin, xmax);
    },
  },

  terraplen: {
    id: "terraplen", nombre: "Terraplén / dique trapezoidal", descripcion: "relleno sobre terreno plano: talud aguas arriba, corona de ancho b y talud aguas abajo",
    params: [X, Z,
      { key: "H", label: "altura del terraplén H", unit: "m", def: 6, min: 1, max: 25, step: 0.1 },
      { key: "corona", label: "ancho de corona b", unit: "m", def: 6, min: 1, max: 20, step: 0.5 },
      { key: "beta_a", label: "talud aguas arriba", unit: "°", def: 30, min: 10, max: 60, step: 0.5 },
      { key: "beta_b", label: "talud aguas abajo", unit: "°", def: 27, min: 10, max: 60, step: 0.5 }],
    generar: (p, xmin, xmax) => {
      const x1 = p.xpie + p.H * cot(p.beta_a), x2 = x1 + p.corona;
      return cerrar([[xmin, p.zpie], [p.xpie, p.zpie], [x1, p.zpie + p.H], [x2, p.zpie + p.H], [x2 + p.H * cot(p.beta_b), p.zpie]], xmin, xmax);
    },
  },

  cuneta: {
    id: "cuneta", nombre: "Corte con cuneta", descripcion: "talud de corte con una cuneta trapezoidal al pie (profundidad d, ancho de fondo y talud lateral)",
    params: [X, Z,
      { key: "H", label: "altura del corte H", unit: "m", def: 7, min: 2, max: 30, step: 0.1 },
      { key: "beta", label: "talud del corte β", unit: "°", def: 45, min: 15, max: 75, step: 0.5 },
      { key: "d", label: "profundidad de cuneta", unit: "m", def: 1, min: 0.3, max: 3, step: 0.1 },
      { key: "fondo", label: "ancho del fondo", unit: "m", def: 1.5, min: 0.3, max: 6, step: 0.1 },
      { key: "bz", label: "talud lateral de cuneta", unit: "°", def: 35, min: 15, max: 70, step: 1 }],
    generar: (p, xmin, xmax) => {
      const w = p.d * cot(p.bz), x1 = p.xpie + w, x2 = x1 + p.fondo, x3 = x2 + w;
      return cerrar([[xmin, p.zpie], [p.xpie, p.zpie], [x1, p.zpie - p.d], [x2, p.zpie - p.d], [x3, p.zpie], [x3 + p.H * cot(p.beta), p.zpie + p.H]], xmin, xmax);
    },
  },
};

/** terreno de un `talud tipo=… ` del formato v1 (valores por defecto del tipo para lo que falte) */
export function terrenoV1(id: string, dados: Record<string, number>, xmin: number, xmax: number): Pt[] {
  const t = TIPOS_V1[id]; if (!t) throw new Error(`tipo de talud desconocido «${id}»`);
  const p: Record<string, number> = {}; for (const q of t.params) p[q.key] = dados[q.key] ?? q.def;
  return t.generar(p, xmin, xmax);
}
