// IMPORTAR DXF (GEO5 también lo permite y es una ventaja): ASCII R12 y posteriores. Entidades: POLYLINE/VERTEX, LWPOLYLINE, LINE, ARC, SPLINE
// (puntos de ajuste o de control), CIRCLE y POINT. Los arcos se discretizan. Las LINE sueltas de una capa se ENCADENAN en polilíneas.
//
// IDA Y VUELTA con nuestro propio export (`hgeoToDxf`, src/model/dxf.ts): capas MARGENES · TERRENO · INTERFAZ_k · LINEA_LIBRE_k · ASIGNAR_<suelo> · MURO_k.
// Exporta → importa → misma geometría. Para un DXF CUALQUIERA, `capasDeDxf` lista las capas y propone un rol por capa (terreno, interfaz,
// línea libre, márgenes, asignar, ignorar) que el usuario puede cambiar en un selector simple (ver main.ts: diálogo «Importar DXF»).
import type { Pt, SlopeDef, Soil } from "./dsl";
import { spanInterface } from "./dsl";

export type Ent = { tipo: string; layer: string; pts: Pt[]; closed?: boolean };
export type Rol = "terreno" | "interfaz" | "linea" | "margenes" | "asignar" | "ignorar";
export type CapaInfo = { layer: string; n: number; tipos: string[]; xmin: number; xmax: number; ymin: number; ymax: number; rol: Rol; orden: number };

/** pares (código, valor) de un DXF ASCII */
function pares(text: string): [number, string][] {
  const L = text.split(/\r?\n/), out: [number, string][] = [];
  for (let i = 0; i + 1 < L.length; i += 2) { const c = parseInt(L[i].trim(), 10); if (Number.isFinite(c)) out.push([c, L[i + 1].trim()]); }
  return out;
}
const arco = (cx: number, cy: number, r: number, a0: number, a1: number): Pt[] => {
  let d = a1 - a0; if (d <= 0) d += 360;
  const n = Math.max(6, Math.ceil(d / 7.5)), o: Pt[] = [];
  for (let i = 0; i <= n; i++) { const a = ((a0 + (d * i) / n) * Math.PI) / 180; o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return o;
};
/** LWPOLYLINE con bulge (código 42): el tramo entre dos vértices es un arco de ángulo 4·atan(bulge) */
function conBulge(v: { x: number; y: number; b: number }[], cerrada: boolean): Pt[] {
  const o: Pt[] = [];
  const n = v.length;
  for (let i = 0; i < n; i++) {
    const a = v[i], b = v[(i + 1) % n];
    o.push([a.x, a.y]);
    if ((i === n - 1 && !cerrada) || !a.b) continue;
    const th = 4 * Math.atan(a.b), c = Math.hypot(b.x - a.x, b.y - a.y), R = c / (2 * Math.sin(Math.abs(th) / 2));
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, h = R * Math.cos(th / 2), nx = -(b.y - a.y) / c, ny = (b.x - a.x) / c, sg = a.b > 0 ? 1 : -1;
    const cx = mx + nx * h * sg, cy = my + ny * h * sg, a0 = Math.atan2(a.y - cy, a.x - cx);
    const m = Math.max(3, Math.ceil(Math.abs(th) / 0.13));
    for (let k = 1; k < m; k++) { const t = a0 + (th * k) / m; o.push([cx + R * Math.cos(t), cy + R * Math.sin(t)]); }
  }
  return o;
}

export function parseDxf(text: string): Ent[] {
  const P = pares(text), ents: Ent[] = [];
  let i = 0;
  while (i < P.length && !(P[i][0] === 2 && P[i][1] === "ENTITIES")) i++;     // solo la sección ENTITIES
  for (i++; i < P.length; ) {
    if (P[i][0] === 0 && P[i][1] === "ENDSEC") break;
    if (P[i][0] !== 0) { i++; continue; }
    const tipo = P[i][1].toUpperCase(); i++;
    if (tipo === "POLYLINE") {                                               // R12: POLYLINE, VERTEX…, SEQEND
      let layer = "0", cerrada = false; const pts: Pt[] = [];
      for (; i < P.length && !(P[i][0] === 0); i++) { if (P[i][0] === 8) layer = P[i][1]; if (P[i][0] === 70) cerrada = (parseInt(P[i][1], 10) & 1) === 1; }
      while (i < P.length && P[i][0] === 0 && P[i][1].toUpperCase() === "VERTEX") {
        i++; let x = NaN, y = NaN;
        for (; i < P.length && P[i][0] !== 0; i++) { if (P[i][0] === 10) x = parseFloat(P[i][1]); if (P[i][0] === 20) y = parseFloat(P[i][1]); }
        if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
      }
      if (pts.length >= 2) ents.push({ tipo, layer, pts, closed: cerrada });
      continue;
    }
    // entidades de una sola pieza: se juntan sus códigos hasta el próximo 0
    const c: [number, string][] = [];
    for (; i < P.length && P[i][0] !== 0; i++) c.push(P[i]);
    const get = (k: number, d = NaN) => { const q = c.find((e) => e[0] === k); return q ? parseFloat(q[1]) : d; };
    const layer = c.find((e) => e[0] === 8)?.[1] ?? "0";
    const todos = (k: number) => c.filter((e) => e[0] === k).map((e) => parseFloat(e[1]));
    if (tipo === "LINE") { const a: Pt = [get(10), get(20)], b: Pt = [get(11), get(21)]; if (a.every(Number.isFinite) && b.every(Number.isFinite)) ents.push({ tipo, layer, pts: [a, b] }); }
    else if (tipo === "LWPOLYLINE") {
      const v: { x: number; y: number; b: number }[] = [];
      for (const [k, s] of c) { if (k === 10) v.push({ x: parseFloat(s), y: NaN, b: 0 }); else if (k === 20 && v.length) v[v.length - 1].y = parseFloat(s); else if (k === 42 && v.length) v[v.length - 1].b = parseFloat(s); }
      const cerrada = ((get(70, 0) as number) & 1) === 1, vv = v.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
      if (vv.length >= 2) ents.push({ tipo, layer, pts: conBulge(vv, cerrada), closed: cerrada });
    } else if (tipo === "ARC") { const cx = get(10), cy = get(20), r = get(40), a0 = get(50, 0), a1 = get(51, 360); if ([cx, cy, r].every(Number.isFinite)) ents.push({ tipo, layer, pts: arco(cx, cy, r, a0, a1) }); }
    else if (tipo === "CIRCLE") { const cx = get(10), cy = get(20), r = get(40); if ([cx, cy, r].every(Number.isFinite)) ents.push({ tipo, layer, pts: arco(cx, cy, r, 0, 360), closed: true }); }
    else if (tipo === "SPLINE") {                                           // puntos de ajuste (11/21) si hay; si no, los de control (10/20)
      const fx = todos(11), fy = todos(21), cx = todos(10), cy = todos(20);
      const xs = fx.length >= 2 ? fx : cx, ys = fx.length >= 2 ? fy : cy;
      const pts: Pt[] = xs.map((x, k) => [x, ys[k]] as Pt).filter((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]));
      if (pts.length >= 2) ents.push({ tipo, layer, pts });
    } else if (tipo === "POINT") { const x = get(10), y = get(20); if (Number.isFinite(x) && Number.isFinite(y)) ents.push({ tipo, layer, pts: [[x, y]] }); }
  }
  return ents;
}

/** encadena LINE sueltas (extremo con extremo) en polilíneas; las demás entidades pasan tal cual */
function encadenar(ents: Ent[]): Ent[] {
  const out: Ent[] = [], lineas = ents.filter((e) => e.tipo === "LINE");
  for (const e of ents) if (e.tipo !== "LINE") out.push(e);
  const usada = new Set<Ent>(), eq = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
  for (const l of lineas) {
    if (usada.has(l)) continue; usada.add(l);
    const pts: Pt[] = [l.pts[0], l.pts[1]]; let sigue = true;
    while (sigue) {
      sigue = false;
      for (const m of lineas) {
        if (usada.has(m) || m.layer !== l.layer) continue;
        const [a, b] = m.pts, f = pts[pts.length - 1], g = pts[0];
        if (eq(f, a)) pts.push(b); else if (eq(f, b)) pts.push(a); else if (eq(g, b)) pts.unshift(a); else if (eq(g, a)) pts.unshift(b); else continue;
        usada.add(m); sigue = true;
      }
    }
    out.push({ tipo: "LINE", layer: l.layer, pts });
  }
  return out;
}

const esTerr = (s: string) => /^(terreno|terrain|ground|surface|superficie|talud|slope)/i.test(s);
const esInt = (s: string) => /^(interfaz|interface|estrato|layer_?\d|strata)/i.test(s);
const esLin = (s: string) => /^(linea_?libre|free_?line|linea|line)/i.test(s);
const esMar = (s: string) => /^(margenes|margins|marco|boundary|contorno|border)/i.test(s);

/** Lista las capas del DXF y propone un rol por capa: primero la convención de NUESTRO export, luego heurística (la polilínea más ancha = terreno) */
export function capasDeDxf(ents: Ent[]): CapaInfo[] {
  const E = encadenar(ents), por = new Map<string, Ent[]>();
  for (const e of E) { if (!por.has(e.layer)) por.set(e.layer, []); por.get(e.layer)!.push(e); }
  const info: CapaInfo[] = [];
  for (const [layer, es] of por) {
    const pp = es.flatMap((e) => e.pts), xs = pp.map((p) => p[0]), ys = pp.map((p) => p[1]);
    const num = parseInt((layer.match(/(\d+)\s*$/) ?? [])[1] ?? "0", 10);
    let rol: Rol = "ignorar";
    if (es.every((e) => e.tipo === "POINT") || /^asignar/i.test(layer)) rol = "asignar";
    else if (esMar(layer)) rol = "margenes"; else if (esTerr(layer)) rol = "terreno"; else if (esInt(layer)) rol = "interfaz"; else if (esLin(layer)) rol = "linea";
    info.push({ layer, n: es.length, tipos: [...new Set(es.map((e) => e.tipo))], xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys), rol, orden: num });
  }
  if (!info.some((c) => c.rol === "terreno")) {                                // DXF cualquiera: la capa de polilínea más ancha sin rol asignado es el terreno
    const cand = info.filter((c) => c.rol === "ignorar" && c.tipos.some((t) => t !== "POINT")).sort((a, b) => (b.xmax - b.xmin) - (a.xmax - a.xmin));
    if (cand[0]) cand[0].rol = "terreno";
    for (const c of cand.slice(1)) if (c.xmax - c.xmin > 0.5 * ((cand[0].xmax - cand[0].xmin) || 1)) c.rol = "interfaz";
  }
  return info;
}

/** Construye la definición (SlopeDef) con los roles elegidos. Los suelos del DXF no existen: se crean por las capas ASIGNAR_<suelo> con valores
 *  por defecto (E, ν, φ, c, γ típicos de una arena limosa) que el usuario edita en el .hgeo. */
export function dxfADef(ents: Ent[], capas: CapaInfo[], nombre = "DXF"): { def: SlopeDef; avisos: string[] } {
  const avisos: string[] = [], E = encadenar(ents), rol = new Map(capas.map((c) => [c.layer, c]));
  const de = (r: Rol) => E.filter((e) => rol.get(e.layer)?.rol === r);
  const terr = de("terreno").filter((e) => e.pts.length >= 2).sort((a, b) => (Math.max(...b.pts.map((p) => p[0])) - Math.min(...b.pts.map((p) => p[0]))) - (Math.max(...a.pts.map((p) => p[0])) - Math.min(...a.pts.map((p) => p[0]))))[0];
  if (!terr) throw new Error("falta la capa del terreno: elige un rol «terreno» para una capa con una polilínea");
  const mar = de("margenes").flatMap((e) => e.pts), todos = [...terr.pts, ...de("interfaz").flatMap((e) => e.pts)];
  const mx = mar.length ? mar : todos;
  const xmin = Math.min(...mx.map((p) => p[0])), xmax = Math.max(...mx.map((p) => p[0])), bottom = mar.length ? Math.min(...mar.map((p) => p[1])) : Math.min(...todos.map((p) => p[1])) - 10;
  const xsT = terr.pts.map((p) => p[0]); if (terr.pts.some((p, k) => k && p[0] < terr.pts[k - 1][0] - 1e-9) && !(xsT[0] <= xsT[xsT.length - 1])) avisos.push("el terreno va de derecha a izquierda: se ordenó por x");
  const sorted = terr.pts.slice().sort((a, b) => a[0] - b[0]);
  if (sorted.some((p, k) => k && Math.abs(p[0] - sorted[k - 1][0]) < 1e-9 && Math.abs(p[1] - sorted[k - 1][1]) > 1e-9)) avisos.push("el terreno tiene un tramo vertical: GEO5 y Hekatan Geotechnic piden una superficie y(x); se movió 1 mm");
  const unico = sorted.map((p, k, a) => (k && Math.abs(p[0] - a[k - 1][0]) < 1e-9 ? ([p[0] + 1e-3, p[1]] as Pt) : p));
  const ints = de("interfaz").sort((a, b) => (rol.get(a.layer)!.orden - rol.get(b.layer)!.orden)).map((e) => spanInterface(e.pts, xmin, xmax));
  const lineas = de("linea").map((e) => e.pts);
  const asign = E.filter((e) => rol.get(e.layer)?.rol === "asignar").flatMap((e) => e.pts.map((p) => ({ soil: e.layer.replace(/^ASIGNAR_/i, "").replace(/^asignar[_ ]*/i, "") || "SUELO1", p })));
  const nombres = [...new Set(asign.map((a) => a.soil))]; if (!nombres.length) nombres.push("SUELO1");
  const soils: Soil[] = nombres.map((n) => ({ name: n, E: 30000, nu: 0.3, phi: 30, c: 10, gamma: 18, psi: 0 }));
  if (!asign.length) { const p0 = unico[Math.floor(unico.length / 2)]; asign.push({ soil: nombres[0], p: [p0[0], p0[1] - 2] }); avisos.push("el DXF no tiene puntos ASIGNAR: se asignó el primer suelo bajo el terreno"); }
  const def: SlopeDef = { outline: [], soils, layers: [], h: 1.5, stages: [{ name: "peso propio", surcharges: [], anchors: [] }], margins: { xmin, xmax, bottom },
    interfaces: [spanInterface(unico, xmin, xmax), ...ints], lines: lineas, assign: asign, walls: [], comments: [`# Importado de ${nombre}: suelos con valores por defecto (E=30000 ν=0.3 φ=30 c=10 γ=18): edítalos`] };
  if (de("margenes").length === 0) avisos.push("sin capa de márgenes: se usó el ancho del terreno y 10 m de fondo");
  return { def, avisos };
}
