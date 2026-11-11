// GALERÍA DE TIPOS DE TALUD (Jorge, 8-nov-2026): «veo un solo talud y parametrizarlo es complejo». Cada tipo es una PLANTILLA con
// POCOS controles (H, pendiente 1:n, suelo φ/c/γ, freático, sobrecarga y lo propio del tipo) que ESCRIBE un .hgeo completo
// (márgenes, terreno, estratos, suelos, asignación, agua, cargas). El .hgeo pasa por el mismo camino de siempre: parseHgeo →
// malla → SRM (GeoFEM) y equilibrio límite (Bishop/Fellenius). No toca los modelos ni las variantes de taludes.ts.
//
// Convenio: pie del talud en (xpie, 0); pendiente H:V = n:1 (β = atan(1/n)); la corona a la cota H.
//   corte      talud en CORTE (desmonte) en un solo suelo: llano al pie (H m), cara, corona (2H m), fondo 0.5H bajo el pie
//              (con H=10 n=2 es la geometría de ACADS EX1(a), Giam & Donald 1989)
//   terraplen  TERRAPLÉN (relleno) de corona B sobre un suelo de FUNDACIÓN de otra resistencia
//   berma      corte con una BERMA de ancho b a la altura hb sobre el pie (las dos caras a 1:n)
//   estratos   corte en DOS ESTRATOS: el de arriba de espesor e (desde la corona), el de abajo hasta el fondo
//   muro       talud con MURO cantilever al pie (Rigid body) de altura Hm: el relleno retenido sigue hasta el talud de arriba
//   ladera     talud NATURAL: el terreno del pie también baja, con pendiente α hacia afuera
//   compuesto  una cara con QUIEBRE: 1:n abajo hasta hq y 1:n₂ arriba
//   blando     corte con un ESTRATO BLANDO intermedio (espesor t a la profundidad d bajo la corona): la falla lo busca
//   zapata     corte con una CARGA q de ancho Bz a la distancia dz del borde de la cara (zapata, edificio, tránsito)
import type { Pt } from "./dsl";

export type PDef = { key: string; label: string; unit: string; def: number; min: number; max: number; step: number };
export type Plantilla = { id: string; nombre: string; descripcion: string; params: PDef[] };

const COMUNES = {
  H: { key: "H", label: "altura H", unit: "m", def: 8, min: 2, max: 25, step: 0.5 },
  n: { key: "n", label: "pendiente 1:n (H:V = n:1)", unit: "", def: 1.5, min: 0.5, max: 4, step: 0.1 },
  phi: { key: "phi", label: "φ", unit: "°", def: 28, min: 0, max: 45, step: 0.5 },
  c: { key: "c", label: "c", unit: "kPa", def: 10, min: 0, max: 80, step: 0.5 },
  gamma: { key: "gamma", label: "γ", unit: "kN/m³", def: 19, min: 14, max: 23, step: 0.1 },
  hw: { key: "hw", label: "freático bajo la corona (0 = sin agua)", unit: "m", def: 0, min: 0, max: 25, step: 0.25 },
  q: { key: "q", label: "sobrecarga q en la corona", unit: "kPa", def: 0, min: 0, max: 100, step: 1 },
} satisfies Record<string, PDef>;
const P = (k: keyof typeof COMUNES, o: Partial<PDef> = {}): PDef => ({ ...COMUNES[k], ...o });

export const PLANTILLAS: Plantilla[] = [
  { id: "corte", nombre: "Corte simple (desmonte)", descripcion: "talud excavado en un solo suelo: llano al pie, cara a 1:n y corona", params: [P("H"), P("n"), P("phi"), P("c"), P("gamma"), P("hw"), P("q")] },
  { id: "terraplen", nombre: "Terraplén sobre fundación", descripcion: "relleno de corona B y taludes 1:n sobre un suelo de fundación (otra resistencia)", params: [
    P("H", { def: 6 }), P("n", { def: 2 }), { key: "B", label: "ancho de corona B", unit: "m", def: 8, min: 2, max: 30, step: 0.5 },
    P("phi", { label: "φ relleno", def: 30 }), P("c", { label: "c relleno", def: 5 }), P("gamma", { label: "γ relleno", def: 19 }),
    { key: "phif", label: "φ fundación", unit: "°", def: 20, min: 0, max: 45, step: 0.5 }, { key: "cf", label: "c fundación", unit: "kPa", def: 20, min: 0, max: 100, step: 0.5 },
    P("hw", { label: "freático sobre el terreno natural (0 = sin agua)", max: 15 }), P("q", { label: "sobrecarga q en la corona" })] },
  { id: "berma", nombre: "Con berma (banqueta)", descripcion: "corte con una berma horizontal de ancho b a la altura hb sobre el pie; las dos caras a 1:n", params: [
    P("H", { def: 12 }), P("n", { def: 1 }), { key: "b", label: "ancho de berma b", unit: "m", def: 3, min: 0.5, max: 10, step: 0.25 },
    { key: "hb", label: "altura de la berma sobre el pie hb", unit: "m", def: 6, min: 1, max: 24, step: 0.25 }, P("phi"), P("c", { def: 15 }), P("gamma"), P("hw"), P("q")] },
  { id: "estratos", nombre: "Dos estratos", descripcion: "corte en dos suelos: el de arriba con espesor e desde la corona, el de abajo hasta el fondo", params: [
    P("H"), P("n"), { key: "e", label: "espesor del estrato superior e", unit: "m", def: 4, min: 0.5, max: 25, step: 0.25 },
    P("phi", { label: "φ₁ (arriba)", def: 26 }), P("c", { label: "c₁ (arriba)", def: 8 }), { key: "phi2", label: "φ₂ (abajo)", unit: "°", def: 32, min: 0, max: 45, step: 0.5 },
    { key: "c2", label: "c₂ (abajo)", unit: "kPa", def: 25, min: 0, max: 100, step: 0.5 }, P("gamma"), P("hw"), P("q")] },
  { id: "muro", nombre: "Talud con muro al pie", descripcion: "muro cantilever (Rigid body) de altura Hm al pie; detrás, el relleno retenido y el talud de altura H a 1:n", params: [
    { key: "Hm", label: "altura del muro Hm", unit: "m", def: 3, min: 1, max: 8, step: 0.25 }, P("H", { label: "altura del talud sobre el muro H", def: 5, max: 15 }), P("n"),
    P("phi", { def: 30 }), P("c", { def: 12 }), P("gamma"), P("q")] },
  { id: "ladera", nombre: "Talud natural (ladera con pendiente al pie)", descripcion: "el terreno delante del pie también baja con pendiente α (ladera); la corona es llana", params: [
    P("H"), P("n"), { key: "alfa", label: "pendiente del terreno al pie α", unit: "°", def: 10, min: 0, max: 25, step: 0.5 }, P("phi"), P("c"), P("gamma"), P("hw"), P("q")] },
  { id: "compuesto", nombre: "Talud compuesto (dos pendientes)", descripcion: "una sola cara con quiebre: pendiente 1:n abajo hasta la altura hq y 1:n₂ arriba", params: [
    P("H", { def: 12 }), P("n", { label: "pendiente inferior 1:n", def: 1 }), { key: "n2", label: "pendiente superior 1:n₂", unit: "", def: 2.5, min: 0.5, max: 5, step: 0.1 },
    { key: "hq", label: "altura del quiebre sobre el pie hq", unit: "m", def: 5, min: 1, max: 24, step: 0.25 }, P("phi"), P("c", { def: 15 }), P("gamma"), P("hw"), P("q")] },
  { id: "blando", nombre: "Estrato blando intermedio", descripcion: "corte en tres suelos: un estrato débil de espesor t a la profundidad d bajo la corona (la falla busca ese estrato)", params: [
    P("H"), P("n"), { key: "d", label: "profundidad del techo del estrato blando d", unit: "m", def: 4, min: 0.5, max: 24, step: 0.25 },
    { key: "t", label: "espesor del estrato blando t", unit: "m", def: 1.5, min: 0.25, max: 8, step: 0.25 },
    P("phi", { label: "φ suelo", def: 30 }), P("c", { label: "c suelo", def: 20 }), { key: "phib", label: "φ estrato blando", unit: "°", def: 14, min: 0, max: 45, step: 0.5 },
    { key: "cb", label: "c estrato blando", unit: "kPa", def: 3, min: 0, max: 80, step: 0.5 }, P("gamma"), P("hw")] },
  { id: "zapata", nombre: "Carga en la corona (zapata)", descripcion: "corte con una carga q de ancho Bz a la distancia dz detrás del borde de la cara (zapata, edificio, tránsito)", params: [
    P("H"), P("n"), P("phi"), P("c"), P("gamma"), P("hw"), P("q", { label: "carga q de la zapata", def: 100 }),
    { key: "Bz", label: "ancho de la carga Bz", unit: "m", def: 3, min: 0.5, max: 12, step: 0.25 }, { key: "dz", label: "distancia al borde dz", unit: "m", def: 2, min: 0, max: 15, step: 0.25 }] },
];
export const plantilla = (id: string) => { const t = PLANTILLAS.find((p) => p.id === id); if (!t) throw new Error(`tipo de talud desconocido «${id}» (hay: ${PLANTILLAS.map((p) => p.id).join(", ")})`); return t; };
export function paramsPorDefecto(id: string): Record<string, number> { const o: Record<string, number> = {}; for (const q of plantilla(id).params) o[q.key] = q.def; return o; }
export const betaDeN = (n: number) => (Math.atan(1 / Math.max(n, 1e-6)) * 180) / Math.PI;

const r = (v: number) => String(Math.round(v * 1000) / 1000);
const pts = (P: Pt[]) => P.map((p) => `${r(p[0])},${r(p[1])}`).join(" ");
const suelo = (nom: string, phi: number, c: number, g: number, E = 20000) => `suelo ${nom} E=${E} nu=0.3 phi=${r(phi)} c=${r(c)} gamma=${r(g)} gsat=${r(g + 1.5)}`;
const malla = (H: number) => `malla ${r(Math.min(Math.max(H / 6, 0.6), 2))}`;
/** etapas: peso propio y, con q > 0, «+sobrecarga» en la corona sobre [x1, x2] */
const etapas = (q: number, x1: number, x2: number, z: number) => ["etapa peso propio", ...(q > 0 ? [`etapa +sobrecarga q=${r(q)} en ${r(x1)},${r(z)} -> ${r(x2)},${r(z)}`] : [])];

/** .hgeo del tipo `id` con los parámetros `p` (los que falten, por defecto) */
export function hgeoPlantilla(id: string, dados: Record<string, number> = {}): string {
  const t = plantilla(id), p = { ...paramsPorDefecto(id), ...dados };
  const H = p.H, n = p.n, L = n * H, cab = `# Tipo de talud: ${t.nombre} · H=${r(H)} m · 1:${r(n)} (β=${r(betaDeN(n))}°)` + Object.entries(p).filter(([k]) => k !== "H" && k !== "n").map(([k, v]) => ` ${k}=${r(v)}`).join("");
  const L1: string[] = [cab];
  // agua: freático a ras del terreno al pie, recta por la cara hasta hw (≤ H − 0.3) y horizontal en la corona
  const gwt = (xpie: number, xc: number, xmin: number, xmax: number, z0 = 0) => {
    if (!(p.hw > 0)) return [];
    const zc = Math.min(p.hw, H - 0.3); return [`agua gwt ${pts([[xmin, z0], [xpie, 0], [xc, zc], [xmax, zc]])}`];
  };
  if (id === "compuesto") {
    const hq = Math.min(Math.max(p.hq, 0.5), H - 0.5), xpie = Math.max(H, 5), x1 = xpie + hq * n, xc = x1 + (H - hq) * p.n2;
    const xmax = xc + Math.max(2 * H, 10), fondo = -Math.max(0.5 * H, 3);
    L1.push(`margenes xmin=0 xmax=${r(xmax)} fondo=${r(fondo)}`, `interfaz ${pts([[0, 0], [xpie, 0], [x1, hq], [xc, H], [xmax, H]])}`);
    L1.push(suelo("SUELO", p.phi, p.c, p.gamma), `asignar SUELO en ${r(xc + 1)},${r(fondo / 2)}`);
    if (p.hw > 0) { const zc = Math.min(p.hw, H - 0.3), zq = Math.min(zc, hq); L1.push(`agua gwt ${pts([[0, 0], [xpie, 0], [xpie + zq * n, zq], [xc, zc], [xmax, zc]])}`); }
    L1.push(malla(H), ...etapas(p.q, xc + 1, Math.min(xc + 7, xmax - 1), H));
  } else if (id === "blando") {
    const xpie = Math.max(H, 5), xc = xpie + L, xmax = xc + Math.max(2 * H, 10), fondo = -Math.max(0.5 * H, 3);
    const z1 = Math.max(H - p.d, fondo + 1.5), z2 = Math.max(z1 - p.t, fondo + 0.5);   // techo y base del estrato blando (cotas)
    const cara = (zi: number) => (zi > 0 ? [[0, 0], [xpie, 0], [xpie + zi * n, zi], [xmax, zi]] : [[0, zi], [xmax, zi]]) as Pt[];
    L1.push(`margenes xmin=0 xmax=${r(xmax)} fondo=${r(fondo)}`, `interfaz ${pts([[0, 0], [xpie, 0], [xc, H], [xmax, H]])}`, `interfaz ${pts(cara(z1))}`, `interfaz ${pts(cara(z2))}`);
    L1.push(suelo("SUELO", p.phi, p.c, p.gamma), suelo("BLANDO", p.phib, p.cb, p.gamma - 1), suelo("BASE", p.phi, p.c, p.gamma));
    L1.push(`asignar SUELO en ${r(xmax - 1)},${r((H + z1) / 2)}`, `asignar BLANDO en ${r(xmax - 1)},${r((z1 + z2) / 2)}`, `asignar BASE en ${r(xmax - 1)},${r((z2 + fondo) / 2)}`);
    L1.push(...gwt(xpie, xc, 0, xmax), malla(H), ...etapas(0, 0, 0, H));
  } else if (id === "corte" || id === "estratos" || id === "zapata") {
    const xpie = Math.max(H, 5), xc = xpie + L, xmax = xc + Math.max(2 * H, 10), fondo = -Math.max(0.5 * H, 3);
    L1.push(`margenes xmin=0 xmax=${r(xmax)} fondo=${r(fondo)}`, `interfaz ${pts([[0, 0], [xpie, 0], [xc, H], [xmax, H]])}`);
    if (id !== "estratos") { L1.push(suelo("SUELO", p.phi, p.c, p.gamma), `asignar SUELO en ${r(xc + 1)},${r(fondo / 2)}`); }
    else {
      const zi = H - Math.min(p.e, H - fondo - 0.5), xi = xpie + Math.max(zi, 0) * n;
      L1.push(`interfaz ${pts(zi > 0 ? [[0, 0], [xpie, 0], [xi, zi], [xmax, zi]] : [[0, zi], [xmax, zi]])}`);
      L1.push(suelo("ESTRATO_1", p.phi, p.c, p.gamma), suelo("ESTRATO_2", p.phi2, p.c2, p.gamma + 1));
      L1.push(`asignar ESTRATO_1 en ${r(xmax - 1)},${r((H + zi) / 2)}`, `asignar ESTRATO_2 en ${r(xmax - 1)},${r((zi + fondo) / 2)}`);
    }
    // zapata: carga q sobre [xc + dz, xc + dz + Bz] (la corona termina 2H más allá); los demás tipos: 6 m desde 1 m del borde
    const qa = id === "zapata" ? xc + p.dz : xc + 1, qb = id === "zapata" ? Math.min(xc + p.dz + p.Bz, xmax - 1) : Math.min(xc + 1 + 6, xmax - 1);
    L1.push(...gwt(xpie, xc, 0, xmax), malla(H), ...etapas(p.q, qa, qb, H));
  } else if (id === "berma") {
    const hb = Math.min(Math.max(p.hb, 0.5), H - 0.5), xpie = Math.max(H, 5), x1 = xpie + hb * n, x2 = x1 + p.b, xc = x2 + (H - hb) * n;
    const xmax = xc + Math.max(2 * H, 10), fondo = -Math.max(0.5 * H, 3);
    L1.push(`margenes xmin=0 xmax=${r(xmax)} fondo=${r(fondo)}`, `interfaz ${pts([[0, 0], [xpie, 0], [x1, hb], [x2, hb], [xc, H], [xmax, H]])}`);
    L1.push(suelo("SUELO", p.phi, p.c, p.gamma), `asignar SUELO en ${r(xc + 1)},${r(fondo / 2)}`);
    if (p.hw > 0) { const zc = Math.min(p.hw, H - 0.3), zb = Math.min(zc, hb - 0.2); L1.push(`agua gwt ${pts([[0, 0], [xpie, 0], [x1, Math.max(zb, 0)], [xc, zc], [xmax, zc]])}`); }
    L1.push(malla(H), ...etapas(p.q, xc + 1, Math.min(xc + 7, xmax - 1), H));
  } else if (id === "terraplen") {
    const xL = Math.max(H, 5), xcL = xL + L, xcR = xcL + p.B, xR = xcR + L, xmax = xR + Math.max(H, 5), D = Math.max(H, 5);
    L1.push(`margenes xmin=0 xmax=${r(xmax)} fondo=${r(-D)}`, `interfaz ${pts([[0, 0], [xL, 0], [xcL, H], [xcR, H], [xR, 0], [xmax, 0]])}`, `interfaz ${pts([[0, 0], [xmax, 0]])}`);
    L1.push(suelo("RELLENO", p.phi, p.c, p.gamma), suelo("FUNDACION", p.phif, p.cf, p.gamma));
    L1.push(`asignar RELLENO en ${r((xcL + xcR) / 2)},${r(H / 2)}`, `asignar FUNDACION en ${r(xmax / 2)},${r(-D / 2)}`);
    if (p.hw > 0) { const zw = Math.min(p.hw, H - 0.3); L1.push(`agua gwt ${pts([[0, 0], [xL, 0], [xL + zw * n, zw], [xR - zw * n, zw], [xR, 0], [xmax, 0]])}`); }
    const qa = xcL + Math.min(1, p.B / 4), qb = xcR - Math.min(1, p.B / 4);
    L1.push(malla(H), ...etapas(p.q, qa, qb, H));
  } else if (id === "muro") {
    const Hm = p.Hm, Ht = Hm + H, xw = Math.max(Ht * 0.6, 5), xc = xw + Ht * n, xmax = xc + Math.max(2 * Ht, 10), fondo = -Math.max(0.6 * Ht, 4);
    L1.push(`margenes xmin=0 xmax=${r(xmax)} fondo=${r(fondo)}`, `interfaz ${pts([[0, 0], [xw, 0], [xc, Ht], [xmax, Ht]])}`);
    L1.push(suelo("SUELO", p.phi, p.c, p.gamma), "suelo HORMIGON E=30000000 nu=0.2 phi=45 c=1000 gamma=24", `asignar SUELO en ${r(xc + 1)},${r(fondo / 2)}`);
    // HORMIGON = Rigid body (no se reduce en la SRM); φ y c altos solo para que no salte el aviso «φ < 1°»
    L1.push(`muro HORMIGON x=${r(xw)} H=${r(Hm)}`, malla(Ht), ...etapas(p.q, xc + 1, Math.min(xc + 7, xmax - 1), Ht));
  } else if (id === "ladera") {
    const ta = Math.tan((p.alfa * Math.PI) / 180), xpie = Math.max(1.5 * H, 8), z0 = -xpie * ta, xc = xpie + L, xmax = xc + Math.max(2 * H, 10), fondo = z0 - Math.max(0.5 * H, 3);
    L1.push(`margenes xmin=0 xmax=${r(xmax)} fondo=${r(fondo)}`, `interfaz ${pts([[0, z0], [xpie, 0], [xc, H], [xmax, H]])}`);
    L1.push(suelo("SUELO", p.phi, p.c, p.gamma), `asignar SUELO en ${r(xc + 1)},${r(fondo / 2)}`);
    L1.push(...gwt(xpie, xc, 0, xmax, z0), malla(H), ...etapas(p.q, xc + 1, Math.min(xc + 7, xmax - 1), H));
  }
  return L1.join("\n") + "\n";
}
/** FS del talud INFINITO (analítico, sin agua): FS = c/(γ z sinβ cosβ) + tanφ/tanβ; con c = 0, tanφ/tanβ */
export function fsInfinito(phi: number, beta: number, c = 0, gamma = 1, z = 1): number {
  const b = (beta * Math.PI) / 180;
  return c / (gamma * z * Math.sin(b) * Math.cos(b)) + Math.tan((phi * Math.PI) / 180) / Math.tan(b);
}
