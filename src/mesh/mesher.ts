// Mallador T6 de Hekatan Geotechnic: Delaunay restringida + refinamiento de Ruppert (puntos de Steiner)
// con tamaño de arista objetivo h, aristas restringidas (contorno + interfaces de suelos) pre-partidas a h
// → malla UNIFORME y CONFORME con la interfaz. Luego: nudos de lado medio (T6), material por capa,
// apoyos de GEO5 (base MX+MY, laterales MX), cargas CONSISTENTES (sobrecarga integrada en las aristas
// cuadráticas del contorno, ancla con las N del T6 que la contiene).
// NOTA honesta: GEO5 malla por FRENTE DE AVANCE (decompilación de FRFEMesh2D.dll, 2026-07-27); este
// mallador es otro. Con la misma h las mallas se parecen (arista media 2.31 en la Demo04) pero no son
// iguales, así que el FS puede moverse en el 2º-3º decimal: se compara contra GEO5, no se copia.
import type { GeoModel } from "../geofem/solver";
import { interfaceY, spanInterface, outlineFromInterfaces, clampLayersToTerrain, autoAssign, type Pt, type SlopeDef } from "../model/dsl";

type Tri = { a: number; b: number; c: number; dead?: boolean };
export let meshDebug: (msg: string) => void = () => {};
export function setMeshDebug(f: (msg: string) => void) { meshDebug = f; }

const EPS = 1e-9;
const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

function pointInPoly(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** y de una polilínea en x (interpolación; extrapola plana en los extremos) */
function polyY(poly: Pt[], x: number): number {
  const P = poly.slice().sort((p, q) => p[0] - q[0]);
  if (x <= P[0][0]) return P[0][1];
  for (let i = 0; i + 1 < P.length; i++) if (x <= P[i + 1][0]) { const t = (x - P[i][0]) / (P[i + 1][0] - P[i][0] || 1); return P[i][1] + t * (P[i + 1][1] - P[i][1]); }
  return P[P.length - 1][1];
}

export type MeshStats = { nodes: number; corners: number; elements: number; minAngle: number; meanEdge: number; area: number; steiner: number; avisos: string[] };

export function meshSlope(def: SlopeDef): { model: GeoModel; stats: MeshStats } {
  const h = def.h;
  // el contorno DERIVA de las interfaces: si un slider o el ratón cambió el terreno, se rehace aquí
  // (2026-09-06: el slider de H escribía el texto pero mallaba el contorno viejo)
  if (def.interfaces.length && def.margins) { clampLayersToTerrain(def); autoAssign(def); def.outline = outlineFromInterfaces(def); }   // GEO5: capas recortadas al terreno ANTES de asignar regiones (si no, la cuña bajo la capa recortada se clasificaba con la capa cruda)
  const P: Pt[] = [];                       // puntos (esquinas de la malla)
  const S: [number, number][] = [];         // segmentos restringidos (índices en P)
  const addPt = (p: Pt): number => { for (let i = 0; i < P.length; i++) if (Math.abs(P[i][0] - p[0]) < 1e-7 && Math.abs(P[i][1] - p[1]) < 1e-7) return i; P.push([p[0], p[1]]); return P.length - 1; };
  // contorno en sentido antihorario
  let outline = def.outline.slice();
  let area2 = 0; for (let i = 0; i < outline.length; i++) { const p = outline[i], q = outline[(i + 1) % outline.length]; area2 += cross(p[0], p[1], q[0], q[1]); }
  if (area2 < 0) outline = outline.reverse();
  const domArea = Math.abs(area2) / 2;
  // polilíneas restringidas: contorno cerrado + interfaces recortadas al dominio
  const chains: Pt[][] = [outline.concat([outline[0]])];
  for (const L of def.layers) chains.push(clipPolyline(L.poly, outline));
  // GEO5: las interfaces (salvo el terreno, que ya es contorno) son restricciones internas de margen a margen
  const spans: Pt[][] = def.margins ? def.interfaces.map((it) => spanInterface(it, def.margins!.xmin, def.margins!.xmax)) : [];
  // Una capa NO puede ir por encima del terreno (GEO5 la recorta contra él): de cada capa solo entran los tramos
  // estrictamente por debajo; donde toca o sube sobre el terreno se corta en el cruce exacto, y ese cruce pasa a ser
  // vértice del contorno (si no, el tramo coincidente con el borde rompía la triangulación: FS=1.0000 divergiendo).
  for (let k = 1; k < spans.length; k++) for (const ch of belowTerrain(spans[k], spans[0])) {
    chains.push(ch);
    for (const e of [ch[0], ch[ch.length - 1]]) if (Math.abs(interfaceY(spans[0], e[0]) - e[1]) < 1e-6) insertOnOutline(outline, e);
  }
  // LÍNEAS LIBRES (GEO5 Free line): polilíneas cualesquiera recortadas al dominio; sus extremos sobre el contorno pasan a ser
  // vértices del contorno. Cierran regiones (componentes de la malla separadas por líneas) que reciben su propio suelo.
  const freeChains: Pt[][] = [];
  for (const ln of def.lines ?? []) { const ch = clipPolyline(ln, outline); if (ch.length < 2) continue; for (const e of [ch[0], ch[ch.length - 1]]) insertOnOutline(outline, e, 1e-3); freeChains.push(ch); chains.push(ch); }
  chains[0] = outline.concat([outline[0]]);   // el contorno con los cruces insertados
  // región de GEO5 = nº de interfaces por encima del punto (el terreno cuenta): asignación por punto
  const regionOf = (x: number, y: number) => spans.reduce((n, sp) => n + (interfaceY(sp, x) > y + 1e-9 ? 1 : 0), 0);
  const regionSoil = new Map<number, number>();
  const soilIdx = new Map(def.soils.map((s, i) => [s.name, i + 1]));
  for (const a of def.assign) { const si = soilIdx.get(a.soil); if (si) regionSoil.set(regionOf(a.p[0], a.p[1]), si); }
  // pre-partición a h (partes iguales, ≥1)
  for (const ch of chains) for (let i = 0; i + 1 < ch.length; i++) {
    const a = ch[i], b = ch[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-9) continue;
    const n = Math.max(1, Math.round(L / h));
    let prev = addPt(a);
    for (let k = 1; k <= n; k++) { const t = k / n; const id = addPt([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); if (id !== prev) S.push([prev, id]); prev = id; }
  }
  const nBoundary = P.length;
  const isSeg = () => { const set = new Set<string>(); for (const [a, b] of S) set.add(a < b ? a + "," + b : b + "," + a); return set; };

  // ---- Delaunay (Bowyer-Watson) sobre un supertriángulo ----
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const [x, y] of P) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
  const big = 20 * Math.max(xmax - xmin, ymax - ymin, 1), cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
  const s0 = P.length, s1 = s0 + 1, s2 = s0 + 2;
  P.push([cx - big, cy - big], [cx + big, cy - big], [cx, cy + big]);
  let T: Tri[] = [{ a: s0, b: s1, c: s2 }];
  const circ = (t: Tri) => {
    const [ax, ay] = P[t.a], [bx, by] = P[t.b], [cx2, cy2] = P[t.c];
    const d = 2 * (ax * (by - cy2) + bx * (cy2 - ay) + cx2 * (ay - by));
    const ux = ((ax * ax + ay * ay) * (by - cy2) + (bx * bx + by * by) * (cy2 - ay) + (cx2 * cx2 + cy2 * cy2) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx2 - bx) + (bx * bx + by * by) * (ax - cx2) + (cx2 * cx2 + cy2 * cy2) * (bx - ax)) / d;
    return { x: ux, y: uy, r2: (ax - ux) * (ax - ux) + (ay - uy) * (ay - uy) };
  };
  const insert = (pi: number) => {
    const [px, py] = P[pi];
    const bad: Tri[] = [];
    for (const t of T) { if (t.dead) continue; const c = circ(t); if ((px - c.x) * (px - c.x) + (py - c.y) * (py - c.y) < c.r2 * (1 + 1e-12)) bad.push(t); }
    const edgeCount = new Map<string, [number, number]>();
    for (const t of bad) for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as [number, number][]) {
      const k = u < v ? u + "," + v : v + "," + u;
      if (edgeCount.has(k)) edgeCount.delete(k); else edgeCount.set(k, [u, v]);
    }
    for (const t of bad) t.dead = true;
    for (const [u, v] of edgeCount.values()) T.push({ a: u, b: v, c: pi });
    if (T.length > 4000 && T.filter((t) => t.dead).length > T.length / 2) T = T.filter((t) => !t.dead);
  };
  for (let i = 0; i < s0; i++) insert(i);

  // ---- recuperar segmentos restringidos por volteo de aristas ----
  const segCross = (a: number, b: number, u: number, v: number) => {   // ¿se cruzan ab y uv propiamente?
    const d = (p: number, q: number, r: number) => cross(P[q][0] - P[p][0], P[q][1] - P[p][1], P[r][0] - P[p][0], P[r][1] - P[p][1]);
    return d(a, b, u) * d(a, b, v) < -EPS && d(u, v, a) * d(u, v, b) < -EPS;
  };
  const enforce = () => {
    for (let pass = 0; pass < 50; pass++) {
      let changed = false;
      const live = T.filter((t) => !t.dead);
      const edges = new Set<string>(); for (const t of live) for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) edges.add(u < v ? u + "," + v : v + "," + u);
      for (const [a, b] of S) {
        if (edges.has(a < b ? a + "," + b : b + "," + a)) continue;
        // arista (u,v) que cruza ab: voltear (u,v) por (p,q) si el cuadrilátero es convexo
        for (const t of live) {
          if (t.dead) continue;
          for (const [u, v, w] of [[t.a, t.b, t.c], [t.b, t.c, t.a], [t.c, t.a, t.b]]) {
            if (!segCross(a, b, u, v)) continue;
            const t2 = live.find((s) => !s.dead && s !== t && [s.a, s.b, s.c].includes(u) && [s.a, s.b, s.c].includes(v));
            if (!t2) continue;
            const q = [t2.a, t2.b, t2.c].find((n) => n !== u && n !== v)!;
            if (!segCross(w, q, u, v)) continue;                      // no convexo: no se puede voltear
            t.dead = true; t2.dead = true;
            T.push({ a: w, b: u, c: q }, { a: w, b: q, c: v });
            changed = true; break;
          }
          if (changed) break;
        }
        if (changed) break;
      }
      if (!changed) return;
    }
  };
  const inDomain = (t: Tri) => { const x = (P[t.a][0] + P[t.b][0] + P[t.c][0]) / 3, y = (P[t.a][1] + P[t.b][1] + P[t.c][1]) / 3; return pointInPoly(x, y, outline); };
  const notSuper = (i: number) => i !== s0 && i !== s1 && i !== s2;   // los Steiner van DESPUÉS del supertriángulo
  const interior = () => T.filter((t) => !t.dead && notSuper(t.a) && notSuper(t.b) && notSuper(t.c) && inDomain(t));
  meshDebug(`delaunay: ${P.length} puntos (${s0} de contorno/interfaz), ${T.filter((t) => !t.dead).length} tri vivos, ${T.filter((t) => !t.dead && notSuper(t.a) && notSuper(t.b) && notSuper(t.c)).length} sin supertri`);
  const angles = (t: Tri) => {
    const L = (p: number, q: number) => Math.hypot(P[p][0] - P[q][0], P[p][1] - P[q][1]);
    const la = L(t.b, t.c), lb = L(t.c, t.a), lc = L(t.a, t.b);
    const ang = (o: number, x: number, y: number) => Math.acos(Math.max(-1, Math.min(1, (x * x + y * y - o * o) / (2 * x * y))));
    return [ang(la, lb, lc), ang(lb, lc, la), ang(lc, la, lb)].map((r) => (r * 180) / Math.PI);
  };
  const triArea = (t: Tri) => Math.abs(cross(P[t.b][0] - P[t.a][0], P[t.b][1] - P[t.a][1], P[t.c][0] - P[t.a][0], P[t.c][1] - P[t.a][1])) / 2;

  // ---- refinamiento de Ruppert: ángulo mínimo 25° y área ≤ 1.4·(√3/4)h² ----
  const amax = 1.4 * (Math.sqrt(3) / 4) * h * h;
  let steiner = 0;
  const tStart = performance.now();          // tope de tiempo: una geometría degenerada (dos interfaces que se
  enforce();                                 // tocan) no puede colgar el navegador: se entrega lo que haya
  meshDebug(`tras enforce: interiores ${interior().length}, área ${interior().reduce((a, t) => a + triArea(t), 0).toFixed(2)} de ${domArea.toFixed(2)}`);
  for (let iter = 0; iter < 5000; iter++) {
    const live = interior();
    let worst: Tri | null = null, score = 0;
    if (performance.now() - tStart > 2500) { meshDebug("refinamiento cortado por tiempo (2.5 s): geometría degenerada"); break; }
    for (const t of live) {
      const ar = triArea(t);
      if (ar < 2e-3 * amax) continue;          // astillas junto a interfaces que se tocan: no se refinan más
      const mn = Math.min(...angles(t));
      const sc = (mn < 25 ? (25 - mn) / 25 : 0) + (ar > amax ? ar / amax - 1 : 0);
      if (sc > score) { score = sc; worst = t; }
    }
    if (!worst) break;
    const c = circ(worst);
    // ¿el circuncentro invade (encroach) un segmento restringido? → partir ese segmento
    let split = -1;
    for (let k = 0; k < S.length; k++) {
      const [a, b] = S[k]; const mx = (P[a][0] + P[b][0]) / 2, my = (P[a][1] + P[b][1]) / 2;
      const r2 = ((P[a][0] - P[b][0]) ** 2 + (P[a][1] - P[b][1]) ** 2) / 4;
      if ((c.x - mx) ** 2 + (c.y - my) ** 2 < r2 * (1 - 1e-9)) { split = k; break; }
    }
    if (split < 0 && !pointInPoly(c.x, c.y, outline)) {          // fuera del dominio: partir su arista más larga del contorno
      const segs = isSeg();
      let best = -1, bl = 0;
      for (const [u, v] of [[worst.a, worst.b], [worst.b, worst.c], [worst.c, worst.a]]) {
        const k = u < v ? u + "," + v : v + "," + u; if (!segs.has(k)) continue;
        const L = Math.hypot(P[u][0] - P[v][0], P[u][1] - P[v][1]); if (L > bl) { bl = L; best = S.findIndex(([p, q]) => (p === u && q === v) || (p === v && q === u)); }
      }
      if (best < 0) break;   // no debería pasar: triángulo interior con circuncentro fuera y sin arista de contorno
      split = best;
    }
    if (split >= 0) {
      const [a, b] = S[split]; const m = addPt([(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2]);
      S.splice(split, 1, [a, m], [m, b]); insert(m);
    } else { P.push([c.x, c.y]); insert(P.length - 1); steiner++; }
    enforce();
  }
  const tris = interior().map((t) => (cross(P[t.b][0] - P[t.a][0], P[t.b][1] - P[t.a][1], P[t.c][0] - P[t.a][0], P[t.c][1] - P[t.a][1]) > 0 ? t : { a: t.a, b: t.c, c: t.b }));

  // ---- T6: nudos de lado medio únicos ----
  const X: number[] = P.slice(0, s0).map((p) => p[0]).concat(P.slice(s0 + 3).map((p) => p[0]));
  const Y: number[] = P.slice(0, s0).map((p) => p[1]).concat(P.slice(s0 + 3).map((p) => p[1]));
  const ren = (i: number) => (i < s0 ? i : i - 3);                    // salta los 3 del supertriángulo
  const midOf = new Map<string, number>();
  const mid = (u: number, v: number) => { const k = u < v ? u + "," + v : v + "," + u; let m = midOf.get(k); if (m === undefined) { m = X.length; X.push((X[u] + X[v]) / 2); Y.push((Y[u] + Y[v]) / 2); midOf.set(k, m); } return m; };
  const ELE: number[][] = [], EMAT: number[] = [], avisos: string[] = [];
  for (const t of tris) {
    const a = ren(t.a), b = ren(t.b), c = ren(t.c);
    ELE.push([a, b, c, mid(a, b), mid(b, c), mid(c, a)]);
    const gx = (X[a] + X[b] + X[c]) / 3, gy = (Y[a] + Y[b] + Y[c]) / 3;
    let m = spans.length ? (regionSoil.get(regionOf(gx, gy)) ?? 1) : 1;
    for (const L of def.layers) { const yl = polyY(L.poly, gx); if ((L.side === "bajo" && gy < yl) || (L.side === "sobre" && gy > yl)) m = soilIdx.get(L.soil) ?? m; }
    EMAT.push(m);
  }
  if (freeChains.length) {   // regiones = componentes de triángulos que no cruzan ninguna línea (contorno, interfaces, líneas libres)
    const onSeg = (x: number, y: number, a: Pt, b: Pt) => { const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2; if (L2 < 1e-18) return false; const t = ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / L2; if (t < -1e-6 || t > 1 + 1e-6) return false; return Math.hypot(x - a[0] - t * (b[0] - a[0]), y - a[1] - t * (b[1] - a[1])) < 1e-6; };
    const onChains = (x: number, y: number, cs: Pt[][]) => { for (const ch of cs) for (let i = 0; i + 1 < ch.length; i++) if (onSeg(x, y, ch[i], ch[i + 1])) return true; return false; };
    const key = (u: number, v: number) => (u < v ? u + "," + v : v + "," + u);
    const byEdge = new Map<string, number[]>();
    tris.forEach((t, i) => { for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) { const k = key(u, v); const l = byEdge.get(k) ?? []; l.push(i); byEdge.set(k, l); } });
    const comp = new Array<number>(tris.length).fill(-1); let nc = 0;
    for (let s0i = 0; s0i < tris.length; s0i++) {
      if (comp[s0i] >= 0) continue; const stack = [s0i]; comp[s0i] = nc;
      while (stack.length) { const i = stack.pop()!; const t = tris[i]; for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) { if (onChains((P[u][0] + P[v][0]) / 2, (P[u][1] + P[v][1]) / 2, chains)) continue; for (const j of byEdge.get(key(u, v)) ?? []) if (comp[j] < 0) { comp[j] = nc; stack.push(j); } } }
      nc++;
    }
    const inTri = (i: number, x: number, y: number) => { const t = tris[i]; const d1 = cross(P[t.b][0] - P[t.a][0], P[t.b][1] - P[t.a][1], x - P[t.a][0], y - P[t.a][1]), d2 = cross(P[t.c][0] - P[t.b][0], P[t.c][1] - P[t.b][1], x - P[t.b][0], y - P[t.b][1]), d3 = cross(P[t.a][0] - P[t.c][0], P[t.a][1] - P[t.c][1], x - P[t.c][0], y - P[t.c][1]); return d1 >= -1e-9 && d2 >= -1e-9 && d3 >= -1e-9; };
    const compSoil = new Map<number, number>();
    for (const a of def.assign) { const si = soilIdx.get(a.soil); if (!si) continue; const i = tris.findIndex((_, k) => inTri(k, a.p[0], a.p[1])); if (i >= 0) compSoil.set(comp[i], si); }
    // componentes que tocan una línea libre y no tienen punto de asignación → siguiente suelo libre (y queda escrito en el .hgeo)
    const usados = new Set(def.assign.map((a) => a.soil)); usados.add(def.soils[0]?.name ?? ""); const libres = def.soils.map((s1) => s1.name).filter((n) => !usados.has(n));
    const tocaLibre = new Set<number>();
    tris.forEach((t, i) => { for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) if (onChains((P[u][0] + P[v][0]) / 2, (P[u][1] + P[v][1]) / 2, freeChains)) tocaLibre.add(comp[i]); });
    const sizes = new Map<number, number>(); comp.forEach((c) => sizes.set(c, (sizes.get(c) ?? 0) + 1));
    const candidatas = [...tocaLibre].filter((c) => !compSoil.has(c)).sort((a, b) => (sizes.get(a) ?? 0) - (sizes.get(b) ?? 0));   // la más pequeña primero (la región cerrada)
    for (const c of candidatas) {
      if (candidatas.length > 1 && c === candidatas[candidatas.length - 1]) break;   // la mayor conserva su suelo de interfaz
      const soil = libres.shift(); if (!soil) break;
      let bi = -1, ba = 0; tris.forEach((t, i) => { if (comp[i] !== c) return; const ar = Math.abs(cross(P[t.b][0] - P[t.a][0], P[t.b][1] - P[t.a][1], P[t.c][0] - P[t.a][0], P[t.c][1] - P[t.a][1])); if (ar > ba) { ba = ar; bi = i; } });
      const t = tris[bi]; const px = Math.round((P[t.a][0] + P[t.b][0] + P[t.c][0]) / 3 * 100) / 100, py = Math.round((P[t.a][1] + P[t.b][1] + P[t.c][1]) / 3 * 100) / 100;
      def.assign.push({ soil, p: [px, py] }); compSoil.set(c, soilIdx.get(soil)!); avisos.push(`${soil} asignado a la región de la línea libre (en ${px},${py}; cámbialo en Asignar)`);
    }
    tris.forEach((_, i) => { const si = compSoil.get(comp[i]); if (si) EMAT[i] = si; });
  }
  const nn = X.length, ndof = 2 * nn;
  // ---- apoyos (GEO5): base MX+MY, laterales MX ----
  const FIXED: number[] = [];
  for (let i = 0; i < nn; i++) {
    if (Math.abs(Y[i] - ymin) < 1e-6) { FIXED.push(2 * i, 2 * i + 1); }
    else if (Math.abs(X[i] - xmin) < 1e-6 || Math.abs(X[i] - xmax) < 1e-6) FIXED.push(2 * i);
  }
  // ---- cargas por etapa (acumuladas) ----
  const bEdges = boundaryEdges(ELE);
  const loads: Record<string, number[]> = {};
  const stages: GeoModel["stages"] = [];
  let acc: string[] = ["Fg"];
  def.stages.forEach((st, si) => {
    const F = new Float64Array(ndof);
    for (const sc of st.surcharges) surchargeLoad(F, sc.q, sc.a, sc.b, X, Y, bEdges);
    for (const an of st.anchors) anchorLoad(F, an.F, an.p, an.ang, X, Y, ELE, outline);
    const name = `L${si + 1}`; loads[name] = Array.from(F);
    if (st.surcharges.length || st.anchors.length) acc = acc.concat([name]);
    stages.push({ name: st.name, loads: acc.slice() as GeoModel["stages"][number]["loads"], geo5: st.geo5 });
  });
  const model: GeoModel = {
    name: "hgeo", X, Y, ELE, EMAT, FIXED, Fg: new Array(ndof).fill(0), Fs: new Array(ndof).fill(0), Fa: new Array(ndof).fill(0),
    MAT: def.soils.map((s) => [s.E, s.nu, s.phi, s.c, s.gamma, s.psi]), recomputeGravity: true, loads, stages,
  };
  // estadísticas
  let mn = 180, sumL = 0, nL = 0, ar = 0;
  for (const t of tris) { mn = Math.min(mn, ...angles(t)); ar += triArea(t); for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) { sumL += Math.hypot(P[u][0] - P[v][0], P[u][1] - P[v][1]); nL++; } }
  void domArea; void nBoundary;
  return { model, stats: { nodes: nn, corners: s0 + steiner, elements: ELE.length, minAngle: mn, meanEdge: sumL / nL, area: ar, steiner , avisos } };
}

/** Tramos de la capa estrictamente por DEBAJO del terreno (polilíneas x-monótonas). Devuelve una o varias cadenas;
 *  los extremos que tocan el terreno son el cruce exacto (sobre el terreno). Lo que coincide o sube se descarta. */
function belowTerrain(layer: Pt[], terr: Pt[]): Pt[][] {
  if (layer.length < 2) return [];
  const x0 = layer[0][0], x1 = layer[layer.length - 1][0];
  const xs = new Set<number>(); for (const p of layer) xs.add(p[0]); for (const p of terr) if (p[0] > x0 + 1e-9 && p[0] < x1 - 1e-9) xs.add(p[0]);
  const X = [...xs].sort((a, b) => a - b);
  const f = (x: number) => interfaceY(layer, x) - interfaceY(terr, x);   // <0: la capa está debajo
  const pts: { x: number; y: number; below: boolean }[] = [];
  const push = (x: number) => { const d = f(x); pts.push({ x, y: d < 0 ? interfaceY(layer, x) : interfaceY(terr, x), below: d < -1e-6 }); };
  for (let i = 0; i < X.length; i++) {
    push(X[i]);
    if (i + 1 < X.length) { const a = f(X[i]), b = f(X[i + 1]); if ((a < 0 && b > 0) || (a > 0 && b < 0)) push(X[i] + (X[i + 1] - X[i]) * a / (a - b)); }   // cruce (f lineal a trozos entre X)
  }
  const out: Pt[][] = []; let cur: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], prev = pts[i - 1], next = pts[i + 1];
    const useful = p.below || (prev?.below ?? false) || (next?.below ?? false);   // un punto "en el terreno" solo vale como extremo de un tramo por debajo
    if (useful) cur.push([p.x, p.y]);
    if (!p.below && cur.length && !(next?.below ?? false)) { if (cur.length >= 2) out.push(cur); cur = []; }
  }
  if (cur.length >= 2) out.push(cur);
  return out;
}
/** Inserta p como vértice del contorno si cae sobre una de sus aristas (y aún no es vértice). */
function insertOnOutline(outline: Pt[], p: Pt, tol = 1e-6) {
  for (const q of outline) if (Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.max(tol, 1e-6)) { p[0] = q[0]; p[1] = q[1]; return; }
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-9) continue;
    const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (L * L);
    const dist = Math.abs(cross(b[0] - a[0], b[1] - a[1], p[0] - a[0], p[1] - a[1])) / L;
    if (t > 1e-6 && t < 1 - 1e-6 && dist < tol) { p[0] = a[0] + t * (b[0] - a[0]); p[1] = a[1] + t * (b[1] - a[1]); outline.splice(i + 1, 0, [p[0], p[1]]); return; }   // proyectado exacto sobre la arista
  }
}
function clipPolyline(poly: Pt[], outline: Pt[]): Pt[] {
  // recorta la polilínea al dominio: se queda con los tramos cuyo punto medio está dentro y proyecta los
  // extremos exteriores al cruce con el contorno (búsqueda por bisección sobre el tramo)
  const out: Pt[] = [];
  for (let i = 0; i + 1 < poly.length; i++) {
    let a = poly[i], b = poly[i + 1];
    const ina = pointInPoly(a[0], a[1], outline) || onOutline(a, outline), inb = pointInPoly(b[0], b[1], outline) || onOutline(b, outline);
    if (!ina && !inb) continue;
    if (!ina) a = bisect(b, a, outline); if (!inb) b = bisect(a, b, outline);
    if (!out.length || Math.hypot(out[out.length - 1][0] - a[0], out[out.length - 1][1] - a[1]) > 1e-7) out.push(a);
    out.push(b);
  }
  return out;
}
function onOutline(p: Pt, outline: Pt[]): boolean {
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-12) continue;
    const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (L * L);
    if (t < -1e-9 || t > 1 + 1e-9) continue;
    const d = Math.abs(cross(b[0] - a[0], b[1] - a[1], p[0] - a[0], p[1] - a[1])) / L;
    if (d < 1e-6) return true;
  }
  return false;
}
function bisect(inside: Pt, outside: Pt, outline: Pt[]): Pt {
  let lo = 0, hi = 1;
  for (let k = 0; k < 50; k++) { const t = (lo + hi) / 2; const p: Pt = [inside[0] + t * (outside[0] - inside[0]), inside[1] + t * (outside[1] - inside[1])]; if (pointInPoly(p[0], p[1], outline)) lo = t; else hi = t; }
  return [inside[0] + lo * (outside[0] - inside[0]), inside[1] + lo * (outside[1] - inside[1])];
}
function boundaryEdges(ELE: number[][]): { a: number; b: number; m: number }[] {
  const cnt = new Map<string, { a: number; b: number; m: number; n: number }>();
  for (const el of ELE) for (const [p, q, mm] of [[0, 1, 3], [1, 2, 4], [2, 0, 5]]) {
    const u = el[p], v = el[q], k = u < v ? u + "," + v : v + "," + u;
    const e = cnt.get(k); if (e) e.n++; else cnt.set(k, { a: u, b: v, m: el[mm], n: 1 });
  }
  return Array.from(cnt.values()).filter((e) => e.n === 1);
}
/** Sobrecarga vertical q [kPa] sobre el tramo a→b del contorno: integra q·N_i·L en cada arista cuadrática. */
function surchargeLoad(F: Float64Array, q: number, a: Pt, b: Pt, X: number[], Y: number[], bE: { a: number; b: number; m: number }[]) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  const G = [[-Math.sqrt(3 / 5), 5 / 9], [0, 8 / 9], [Math.sqrt(3 / 5), 5 / 9]];
  for (const e of bE) {
    const pa: Pt = [X[e.a], Y[e.a]], pb: Pt = [X[e.b], Y[e.b]];
    // ¿arista colineal con a→b?
    const d = (p: Pt) => Math.abs(cross(ux, uy, p[0] - a[0], p[1] - a[1]));
    if (d(pa) > 1e-6 || d(pb) > 1e-6) continue;
    const s = (p: Pt) => (p[0] - a[0]) * ux + (p[1] - a[1]) * uy;         // abscisa a lo largo de a→b
    const sa = s(pa), sb = s(pb); const lo = Math.max(Math.min(sa, sb), 0), hi = Math.min(Math.max(sa, sb), L);
    if (hi - lo <= 1e-9) continue;
    const Le = Math.abs(sb - sa);
    const t0 = (lo - sa) / (sb - sa), t1 = (hi - sa) / (sb - sa);                  // param. de la arista (0 en a-nodo, 1 en b-nodo)
    const tA = Math.min(t0, t1), tB = Math.max(t0, t1);
    // REGLA DE GEO5 (medida en la fixture Demo04 a 0.0002 kN, 2026-09-06): arista COMPLETA → consistente
    // (1/6, 2/3, 1/6); arista PARCIAL → resultante del trozo en su punto medio repartida con N(t_medio).
    const R = q * (hi - lo);
    let Na: number, Nb: number, Nm: number;
    if (tA < 1e-9 && tB > 1 - 1e-9) { Na = 1 / 6; Nb = 1 / 6; Nm = 2 / 3; }
    else { const t = (tA + tB) / 2; Na = (1 - t) * (1 - 2 * t); Nb = t * (2 * t - 1); Nm = 4 * t * (1 - t); }
    F[2 * e.a + 1] += -R * Na; F[2 * e.b + 1] += -R * Nb; F[2 * e.m + 1] += -R * Nm;
    void Le; void G;
  }
}
/** Ancla: fuerza F [kN] en p con ángulo ang [°] desde +x (antihorario), repartida con las N del T6 que contiene p. */
function anchorLoad(F: Float64Array, Fk: number, p: Pt, ang: number, X: number[], Y: number[], ELE: number[][], outline: Pt[]) {
  const fx = Fk * Math.cos((ang * Math.PI) / 180), fy = Fk * Math.sin((ang * Math.PI) / 180);
  // el punto suele estar EN la cara del talud: se empuja 1e-3 hacia adentro para elegir elemento, pero las N se evalúan en p
  let best = -1, bestD = Infinity, L1 = 0, L2 = 0;
  for (let e = 0; e < ELE.length; e++) {
    const [n0, n1, n2] = ELE[e];
    const ax = X[n0], ay = Y[n0], bx = X[n1], by = Y[n1], cx = X[n2], cy = Y[n2];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    const l1 = ((by - cy) * (p[0] - cx) + (cx - bx) * (p[1] - cy)) / det, l2 = ((cy - ay) * (p[0] - cx) + (ax - cx) * (p[1] - cy)) / det, l3 = 1 - l1 - l2;
    const dist = Math.max(-l1, -l2, -l3, 0);           // 0 si está dentro
    if (dist < bestD) { bestD = dist; best = e; L1 = l1; L2 = l2; }
  }
  if (best < 0) return;
  if (bestD > 1e-6) {
    // el punto cae FUERA del dominio (p. ej. ancla escrita en el aire): se proyecta al punto más cercano del contorno y
    // se recalculan las baricéntricas; con N extrapoladas (negativas) el Newton divergía ya en SRF=1 (2026-09-06)
    let q: Pt = p, dq = Infinity;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], L2s = dx * dx + dy * dy || 1;
      const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2s));
      const c: Pt = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(c[0] - p[0], c[1] - p[1]);
      if (d < dq) { dq = d; q = c; }
    }
    const [n0, n1, n2] = ELE[best];
    const ax = X[n0], ay = Y[n0], bx = X[n1], by = Y[n1], cx = X[n2], cy = Y[n2];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    L1 = ((by - cy) * (q[0] - cx) + (cx - bx) * (q[1] - cy)) / det; L2 = ((cy - ay) * (q[0] - cx) + (ax - cx) * (q[1] - cy)) / det;
    meshDebug(`ancla en (${p[0]},${p[1]}) fuera del dominio: llevada al contorno en (${q[0].toFixed(2)},${q[1].toFixed(2)})`);
  }
  const L3 = 1 - L1 - L2;
  const N = [L1 * (2 * L1 - 1), L2 * (2 * L2 - 1), L3 * (2 * L3 - 1), 4 * L1 * L2, 4 * L2 * L3, 4 * L3 * L1];
  ELE[best].forEach((n, k) => { F[2 * n] += fx * N[k]; F[2 * n + 1] += fy * N[k]; });
}
