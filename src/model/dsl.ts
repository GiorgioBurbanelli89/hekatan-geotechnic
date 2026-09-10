// DSL de Hekatan Geotechnic (.hgeo): texto plano, una orden por línea, como el .heks de Struct.
// Sigue el PARADIGMA DE GEO5 (leído en las cadenas de GeoFEM_5.dll: Interfaces/margins, Assignment
// "point out of areas", Surcharges Point1/Point2, Anchors position/force, Grid.Snap):
//
//   margenes xmin=0 xmax=40 fondo=-21.5      rango del modelo (izquierda, derecha, fondo)
//   interfaz x,y x,y ...                     polilínea de borde a borde; la PRIMERA es el terreno
//   talud xpie=11 zpie=-9 H=6.5 beta=33 corona=8.5 zfin=-4 [beta2=28.6]   terreno PARAMÉTRICO (sliders):
//       pie plano → cara a beta° hasta H → corona → bajada a beta2° hasta zfin → plano hasta el margen
//   suelo NOMBRE E=130347 nu=0.3 phi=22.7 c=9 gamma=18 [psi=0]
//   asignar NOMBRE en x,y                    la región que contiene el punto es de ese suelo
//   muro NOMBRE x=20 H=4 [fuste=0.4 zapata=0.4 talon=1.5 dedo=0.6 emp=0.9]   MURO CANTILEVER = RIGID BODY de GEO5:
//       región de hormigón que NO se reduce en la SRM (elástica). El terreno pasa por su cara vista y
//       detrás queda el relleno retenido hasta la coronación. Sin `fuste=…` se predimensiona con H.
//   malla 2.3                                tamaño de arista objetivo [m]
//   etapa NOMBRE [geo5=1.69] [q=35 en x1,y1 -> x2,y2] [F=72 en x,y ang=-17]
//       cada etapa AÑADE sus cargas a las de la etapa anterior (peso propio siempre está)
//   # comentario
//
// Compatibilidad: también se aceptan `contorno x,y …` + `capa NOMBRE bajo|sobre x,y …` (forma vieja).
export type Pt = [number, number];
export type Soil = { name: string; E: number; nu: number; phi: number; c: number; gamma: number; psi: number; rigido?: boolean };
/** Muro cantilever (GEO5 «Rigid body»): x = cara delantera del fuste, H = altura vista sobre el terreno de delante,
 *  fuste/zapata = espesores, talon/dedo = voladizos de la zapata, emp = profundidad de la BASE bajo el terreno. */
export type WallParam = { x: number; H: number; fuste: number; zapata: number; talon: number; dedo: number; emp: number };
export type Wall = { soil: string; pm: WallParam };
export type Layer = { soil: string; side: "bajo" | "sobre"; poly: Pt[] };
export type Surcharge = { q: number; a: Pt; b: Pt };
export type Anchor = { F: number; p: Pt; ang: number };
export type StageDef = { name: string; geo5?: number; surcharges: Surcharge[]; anchors: Anchor[] };
export type SlopeDef = {
  outline: Pt[]; soils: Soil[]; layers: Layer[]; h: number; stages: StageDef[];
  margins?: { xmin: number; xmax: number; bottom: number };
  interfaces: Pt[][];                       // GEO5: de margen a margen, la primera = terreno
  lines: Pt[][];                            // GEO5 "Free line": polilínea cualquiera que toca el borde/otra línea en sus dos extremos y CIERRA una región
  assign: { soil: string; p: Pt }[];        // GEO5: punto dentro de la región
  walls: Wall[];                            // GEO5 «Rigid body»: muros de hormigón (región elástica, la SRM no los reduce)
  comments: string[];
  param?: TaludParam;                       // terreno paramétrico (sliders); si se dibuja a mano, se pierde
};
export type TaludParam = { xpie: number; zpie: number; H: number; beta: number; corona: number; zfin: number; beta2: number };

/** Terreno a partir de los parámetros (la 1ª interfaz). */
export function terrainFromParam(pm: TaludParam, xmin: number, xmax: number): Pt[] {
  const tb = Math.tan((pm.beta * Math.PI) / 180), tb2 = Math.tan((pm.beta2 * Math.PI) / 180);
  const xc = pm.xpie + pm.H / Math.max(tb, 1e-6), zc = pm.zpie + pm.H;
  const x2 = xc + pm.corona, drop = zc - pm.zfin;
  const pts: Pt[] = [[xmin, pm.zpie], [pm.xpie, pm.zpie], [xc, zc], [x2, zc]];
  if (Math.abs(drop) > 1e-9) pts.push([x2 + Math.abs(drop) / Math.max(tb2, 1e-6), pm.zfin]);
  pts.push([xmax, pts[pts.length - 1][1]]);
  return pts.filter((q, i, a) => i === 0 || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) > 1e-9);
}

// ---------------------------------------------------------------------------------------------------
// MURO CANTILEVER = «Rigid body» de GEO5 (región elástica de hormigón: la reducción de resistencia NO
// le toca, empuja el suelo y cambia los desplazamientos y la superficie de falla; los esfuerzos M/V/N
// del fuste son el otro modelo de GEO5, «Beam», y no salen de aquí).
//
//        xb              El terreno pasa por la CARA VISTA del fuste y por su coronación; detrás queda
//   ztop ┌──┐            el relleno retenido hasta ztop. La cara vista lleva un talud mínimo de 6 cm
//        │  │ ← fuste    (MURO_BAT) porque una interfaz de GEO5 es una función de x: vertical exacta no
//      z ┴  │            se puede (es la misma razón por la que GEO5 rechaza una capa que sigue al terreno).
//   ztf ┌───┴───┐
//    zb └───────┘  ← dedo | zapata | talon,  base a `emp` bajo el terreno de delante
// ---------------------------------------------------------------------------------------------------
export const MURO_BAT = 0.06;   // talud de la cara vista [m]: una interfaz de GEO5 es y(x), no admite vertical exacta

/** Predimensionado de un muro cantilever de altura H (reglas de oficina: B ≈ 0.6H, fuste y zapata ≈ H/12,
 *  dedo ≈ B/4, 0.5 m de suelo sobre la zapata). Son el punto de partida de los sliders, no un cálculo. */
export function wallDims(H: number): WallParam {
  const r = (v: number, p = 0.05) => Math.round(v / p) * p;
  const fuste = Math.max(0.3, r(H / 12)), zapata = Math.max(0.3, r(H / 12)), B = r(0.6 * H, 0.1);
  const dedo = Math.max(0.2, r(B / 4, 0.1)), talon = Math.max(0.3, r(B - dedo - fuste, 0.1));
  return { x: 0, H, fuste, zapata, talon, dedo, emp: r(zapata + 0.5, 0.1) };
}
/** Cotas del muro sobre el terreno natural (z = terreno en la cara delantera). */
export function wallLevels(pm: WallParam, z: number) {
  const emp = Math.max(pm.emp, pm.zapata + 0.2);         // la zapata siempre enterrada (al menos 20 cm de suelo encima)
  return { z, zb: z - emp, ztf: z - emp + pm.zapata, ztop: z + pm.H, xb: pm.x + MURO_BAT };
}
/** Polígono cerrado del muro (antihorario), para pintarlo y para asignar el hormigón por punto interior. */
export function wallPolygon(pm: WallParam, z: number): Pt[] {
  const { zb, ztf, ztop, xb } = wallLevels(pm, z), x = pm.x, xf = x + pm.fuste;
  return [[x - pm.dedo, zb], [xf + pm.talon, zb], [xf + pm.talon, ztf], [xf, ztf], [xf, ztop], [xb, ztop], [x, z], [x, ztf], [x - pm.dedo, ztf]];
}
/** Contorno ENTERRADO del muro: la polilínea que va de un punto del terreno al otro por dentro del suelo
 *  (trasdós → talón → base → dedo → intradós). Es la restricción que entra en la malla: los triángulos no
 *  la cruzan, así que la cara del hormigón queda conforme. El resto del muro (coronación y cara vista) YA
 *  es borde del dominio. */
export function wallChain(pm: WallParam, z: number): Pt[] {
  const { zb, ztf, ztop } = wallLevels(pm, z), x = pm.x, xf = x + pm.fuste;
  return [[xf, ztop], [xf, ztf], [xf + pm.talon, ztf], [xf + pm.talon, zb], [x - pm.dedo, zb], [x - pm.dedo, ztf], [x, ztf], [x, z]];
}
/** Quita puntos repetidos y colineales de una polilínea (para no ensuciar el terreno con vértices de más). */
function simplify(P: Pt[], tol = 1e-4): Pt[] {
  const out: Pt[] = [];
  for (const p of P) {
    const q = out[out.length - 1]; if (q && Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6) continue;
    if (out.length >= 2) { const o = out[out.length - 2]; if (Math.abs((q![0] - o[0]) * (p[1] - o[1]) - (q![1] - o[1]) * (p[0] - o[0])) < tol) out.pop(); }
    out.push([p[0], p[1]]);
  }
  return out;
}
/** TERRENO EFECTIVO = terreno natural + el perfil visto de cada muro y su relleno retenido.
 *  El terreno sube por la cara del fuste, cruza la coronación y sigue horizontal hasta donde ese nivel
 *  corta el terreno natural (ahí acaba el relleno y vuelve el talud original). El .hgeo guarda el terreno
 *  NATURAL y la orden `muro`: mover el muro no deja rastro en el terreno. */
export function effectiveTerrain(def: SlopeDef): Pt[] {
  const m = def.margins;
  if (!m || !def.interfaces[0]?.length) return def.interfaces[0] ?? [];
  let terr = spanInterface(def.interfaces[0], m.xmin, m.xmax);
  for (const w of (def.walls ?? []).slice().sort((a, b) => a.pm.x - b.pm.x)) {
    const pm = w.pm; if (!(pm.H > 0) || pm.x <= m.xmin || pm.x >= m.xmax) continue;
    const z = interfaceY(terr, pm.x), { ztop, xb } = wallLevels(pm, z), xf = pm.x + pm.fuste;
    const out: Pt[] = terr.filter((p) => p[0] < pm.x - 1e-9);
    out.push([pm.x, z], [xb, ztop], [xf, ztop]);
    // relleno retenido: horizontal a ztop hasta que el terreno natural alcanza ese nivel
    let corte = -1;
    for (let i = 0; i + 1 < terr.length; i++) {
      const a = terr[i], b = terr[i + 1]; if (b[0] <= xf + 1e-9) continue;
      const xa = Math.max(a[0], xf), za = interfaceY(terr, xa), zbb = b[1];
      if (za >= ztop - 1e-9) { corte = xa; break; }
      if (zbb >= ztop - 1e-9) { corte = xa + (b[0] - xa) * (ztop - za) / (zbb - za || 1); break; }
    }
    if (corte >= 0) { out.push([corte, ztop]); for (const p of terr) if (p[0] > corte + 1e-9) out.push([p[0], p[1]]); }
    else out.push([m.xmax, ztop]);
    terr = simplify(out);
  }
  return terr;
}
/** Punto dentro del muro (centro del fuste): sirve de punto de asignación del hormigón. */
export function wallInnerPoint(pm: WallParam, z: number): Pt {
  const { ztf, ztop } = wallLevels(pm, z);
  return [pm.x + pm.fuste / 2, (Math.max(ztf, z) + ztop) / 2];
}
export function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Terreno natural en la cara delantera de un muro (los muros anteriores ya modificaron el terreno). */
export function wallGround(def: SlopeDef, w: Wall): number {
  const m = def.margins!;
  const antes = (def.walls ?? []).filter((o) => o.pm.x < w.pm.x);       // un muro sobre el relleno de otro se apoya en ese relleno
  const terr = antes.length ? effectiveTerrain({ ...def, walls: antes }) : spanInterface(def.interfaces[0], m.xmin, m.xmax);
  return interfaceY(terr, w.pm.x);
}

const num = (s: string) => { const v = parseFloat(s.replace(",", ".")); if (!Number.isFinite(v)) throw new Error(`número inválido: "${s}"`); return v; };
const pts = (toks: string[]): Pt[] => toks.map((t) => { const m = t.match(/^(-?[\d.]+),(-?[\d.]+)$/); if (!m) throw new Error(`punto inválido: "${t}" (usa x,y)`); return [num(m[1]), num(m[2])]; });
const kv = (toks: string[]): Record<string, string> => { const o: Record<string, string> = {}; for (const t of toks) { const m = t.match(/^([A-Za-z_]+)=(.+)$/); if (m) o[m[1].toLowerCase()] = m[2]; } return o; };

export function parseHgeo(text: string, opts: { draft?: boolean } = {}): SlopeDef {   // draft: borrador sin terreno/suelo (hoja en blanco para dibujar)
  const def: SlopeDef = { outline: [], soils: [], layers: [], h: 2.5, stages: [], interfaces: [], lines: [], assign: [], walls: [], comments: [] };
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, k) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) { const c = raw.trim(); if (c.startsWith("#") && k === 0) def.comments.push(c); return; }
    const toks = line.split(/\s+/);
    const cmd = toks[0].toLowerCase();
    const ln = `línea ${k + 1}`;
    try {
      if (cmd === "contorno") def.outline = pts(toks.slice(1));
      else if (cmd === "margenes" || cmd === "márgenes") { const o = kv(toks.slice(1)); def.margins = { xmin: num(o.xmin ?? "0"), xmax: num(o.xmax ?? "40"), bottom: num(o.fondo ?? o.bottom ?? "-20") }; }
      else if (cmd === "interfaz" || cmd === "interface") def.interfaces.push(pts(toks.slice(1)));
      else if (cmd === "linea" || cmd === "línea" || cmd === "line" || cmd === "libre") def.lines.push(pts(toks.slice(1)));
      else if (cmd === "talud") { const o = kv(toks.slice(1)); def.param = { xpie: num(o.xpie ?? "10"), zpie: num(o.zpie ?? "-10"), H: num(o.h ?? "6"), beta: num(o.beta ?? "33"), corona: num(o.corona ?? "8"), zfin: num(o.zfin ?? String(num(o.zpie ?? "-10") + num(o.h ?? "6"))), beta2: num(o.beta2 ?? "28.6") }; def.interfaces.unshift([]); }
      else if (cmd === "suelo") {
        const o = kv(toks.slice(2));
        def.soils.push({ name: toks[1], E: num(o.e ?? "0"), nu: num(o.nu ?? "0.3"), phi: num(o.phi ?? "0"), c: num(o.c ?? "0"), gamma: num(o.gamma ?? "0"), psi: num(o.psi ?? "0"), rigido: /^(1|si|sí|true|yes)$/i.test(o.rigido ?? o.rigid ?? "") || undefined });
      } else if (cmd === "asignar") { const en = toks.indexOf("en"); def.assign.push({ soil: toks[1], p: pts([toks[en + 1]])[0] }); }
      else if (cmd === "capa") {
        const side = toks[2].toLowerCase();
        def.layers.push({ soil: toks[1], side: side === "sobre" || side === "encima" ? "sobre" : "bajo", poly: pts(toks.slice(3)) });
      } else if (cmd === "muro" || cmd === "wall") {
        const o = kv(toks.slice(2)), H = num(o.h ?? "4"), d = wallDims(H);
        def.walls.push({ soil: toks[1], pm: { x: num(o.x ?? o.xpie ?? "10"), H, fuste: num(o.fuste ?? String(d.fuste)), zapata: num(o.zapata ?? String(d.zapata)), talon: num(o.talon ?? o["talón"] ?? String(d.talon)), dedo: num(o.dedo ?? String(d.dedo)), emp: num(o.emp ?? String(d.emp)) } });
      } else if (cmd === "malla") def.h = num(toks[1]);
      else if (cmd === "etapa") {
        let i = 1; const nm: string[] = [];
        while (i < toks.length && !toks[i].includes("=")) nm.push(toks[i++]);
        const st: StageDef = { name: nm.join(" ") || `etapa${def.stages.length + 1}`, surcharges: [], anchors: [] };
        const rest = toks.slice(i);
        for (let j = 0; j < rest.length; j++) {
          const m = rest[j].match(/^([A-Za-z_0-9]+)=(.+)$/); if (!m) continue;
          const key = m[1].toLowerCase(), val = m[2];
          if (key === "geo5") st.geo5 = num(val);
          else if (key === "q") { const en = rest.indexOf("en", j); const p = pts([rest[en + 1], rest[en + 3]]); st.surcharges.push({ q: num(val), a: p[0], b: p[1] }); j = en + 3; }
          else if (key === "f") { const en = rest.indexOf("en", j); const p = pts([rest[en + 1]])[0]; const o = kv(rest.slice(en + 2, en + 4)); st.anchors.push({ F: num(val), p, ang: num(o.ang ?? "0") }); j = en + 2; }
        }
        def.stages.push(st);
      } else throw new Error(`orden desconocida "${toks[0]}"`);
    } catch (e) { throw new Error(`${ln}: ${(e as Error).message}`); }
  });
  if (def.param) { const m = def.margins ?? { xmin: 0, xmax: 40, bottom: def.param.zpie - 12 }; def.margins = m; def.interfaces[0] = terrainFromParam(def.param, m.xmin, m.xmax); }
  for (const w of def.walls) { const s0 = def.soils.find((q) => q.name === w.soil); if (s0) s0.rigido = true; }   // Rigid body de GEO5 = región elástica: el hormigón del muro no se reduce en la SRM
  if (def.interfaces.length) {
    if (!def.margins) { const xs = def.interfaces.flat().map((p) => p[0]), ys = def.interfaces.flat().map((p) => p[1]); def.margins = { xmin: Math.min(...xs), xmax: Math.max(...xs), bottom: Math.min(...ys) - 10 }; }
    def.outline = outlineFromInterfaces(def);
  }
  if (!opts.draft) {
    if (def.outline.length < 3) throw new Error("falta el terreno: `interfaz x,y …` (o un `contorno`)");
    if (!def.soils.length) throw new Error("falta al menos un suelo");
  }
  if (!def.stages.length) def.stages.push({ name: "peso propio", surcharges: [], anchors: [] });
  else if (def.stages[0].name.startsWith("+")) def.stages.unshift({ name: "peso propio", surcharges: [], anchors: [] });   // `etapa +sobrecarga` escrita a mano sin `etapa peso propio` antes: la etapa 1 (peso propio) siempre está
  return def;
}

/** Polilínea de una interfaz estirada de margen a margen (GEO5 extiende el primer/último tramo en horizontal). */
export function spanInterface(poly: Pt[], xmin: number, xmax: number): Pt[] {
  const P = poly.slice().sort((a, b) => a[0] - b[0]);
  const out: Pt[] = [];
  if (P[0][0] > xmin + 1e-9) out.push([xmin, P[0][1]]);
  for (const p of P) if (p[0] >= xmin - 1e-9 && p[0] <= xmax + 1e-9) out.push([Math.min(Math.max(p[0], xmin), xmax), p[1]]);
  if (P[P.length - 1][0] < xmax - 1e-9) out.push([xmax, P[P.length - 1][1]]);
  return out;
}
export function interfaceY(poly: Pt[], x: number): number {
  const P = poly.slice().sort((a, b) => a[0] - b[0]);
  if (x <= P[0][0]) return P[0][1];
  for (let i = 0; i + 1 < P.length; i++) if (x <= P[i + 1][0]) { const t = (x - P[i][0]) / (P[i + 1][0] - P[i][0] || 1); return P[i][1] + t * (P[i + 1][1] - P[i][1]); }
  return P[P.length - 1][1];
}
export function outlineFromInterfaces(def: SlopeDef): Pt[] {
  const m = def.margins!;
  const terr = effectiveTerrain(def);   // el terreno pasa por la cara vista del muro y por su relleno
  return [[m.xmin, m.bottom], [m.xmax, m.bottom], ...terr.slice().reverse()];   // fondo → derecha → terreno de derecha a izquierda
}

/** Texto .hgeo a partir de la definición (para que las herramientas de dibujo escriban el DSL). */
export function serializeHgeo(def: SlopeDef): string {
  const r = (v: number) => (Math.round(v * 1000) / 1000).toString();
  const p = (q: Pt) => `${r(q[0])},${r(q[1])}`;
  const L: string[] = [...def.comments];
  if (def.margins) L.push(`margenes xmin=${r(def.margins.xmin)} xmax=${r(def.margins.xmax)} fondo=${r(def.margins.bottom)}`);
  def.interfaces.forEach((it, k) => { if (k === 0 && def.param) { const q = def.param; L.push(`talud xpie=${r(q.xpie)} zpie=${r(q.zpie)} H=${r(q.H)} beta=${r(q.beta)} corona=${r(q.corona)} zfin=${r(q.zfin)} beta2=${r(q.beta2)}`); } else L.push(`interfaz ${it.map(p).join(" ")}`); });
  if (!def.interfaces.length && def.outline.length) L.push(`contorno ${def.outline.map(p).join(" ")}`);
  for (const s of def.soils) L.push(`suelo ${s.name} E=${r(s.E)} nu=${r(s.nu)} phi=${r(s.phi)} c=${r(s.c)} gamma=${r(s.gamma)}${s.psi ? ` psi=${r(s.psi)}` : ""}${s.rigido && !(def.walls ?? []).some((w) => w.soil === s.name) ? " rigido=1" : ""}`);
  for (const w of def.walls ?? []) L.push(`muro ${w.soil} x=${r(w.pm.x)} H=${r(w.pm.H)} fuste=${r(w.pm.fuste)} zapata=${r(w.pm.zapata)} talon=${r(w.pm.talon)} dedo=${r(w.pm.dedo)} emp=${r(w.pm.emp)}`);
  for (const ln of def.lines ?? []) L.push(`linea ${ln.map(p).join(" ")}`);   // GEO5 Free line
  for (const a of def.assign) L.push(`asignar ${a.soil} en ${p(a.p)}`);
  for (const c of def.layers) L.push(`capa ${c.soil} ${c.side} ${c.poly.map(p).join(" ")}`);
  L.push(`malla ${r(def.h)}`);
  for (const st of def.stages) {
    let s = `etapa ${st.name}`;
    if (st.geo5) s += ` geo5=${st.geo5}`;
    for (const q of st.surcharges) s += ` q=${r(q.q)} en ${p(q.a)} -> ${p(q.b)}`;
    for (const a of st.anchors) s += ` F=${r(a.F)} en ${p(a.p)} ang=${r(a.ang)}`;
    L.push(s);
  }
  return L.join("\n") + "\n";
}

/** Demo04 de GEO5 escrita en el DSL (paradigma GEO5: márgenes + interfaces + asignación por punto). */
export const DEMO04_HGEO = `# Talud Demo04 de GEO5 (GeoFEM) — 2 suelos, 3 etapas
margenes xmin=0 xmax=40 fondo=-21.5
talud xpie=11 zpie=-9 H=6.5 beta=33.024 corona=8.5 zfin=-4 beta2=28.61     # = interfaz 0,-9 11,-9 21,-2.5 29.5,-2.5 32.25,-4 40,-4
interfaz 0,-11.5 14,-11 21,-9.25 40,-9
suelo SOIL_1 E=130347 nu=0.3 phi=22.7 c=9   gamma=18
suelo SOIL_2 E=130347 nu=0.2 phi=38   c=120 gamma=20
asignar SOIL_1 en 20,-6
asignar SOIL_2 en 20,-16
malla 2.3
etapa peso propio   geo5=1.69
etapa +sobrecarga   geo5=1.48  q=35 en 22,-2.5 -> 29,-2.5    # 7 m: medido en la fixture (ΣFy = 245 kN)
etapa +ancla        geo5=1.69  F=72 en 16,-5.75 ang=-17   # cabeza del ancla en la cara (medido en la fixture: N del T6)
`;

/** GEO5: una interfaz no puede estar por encima del terreno. Donde una capa sube sobre el terreno, la capa pasa a SEGUIR
 *  el terreno (vértice a vértice, con el cruce exacto), no solo se bajan sus vértices (eso dejaba una cuña falsa por debajo).
 *  Queda escrito así en el .hgeo y así se dibuja. Devuelve cuántas capas corrigió. */
export function clampLayersToTerrain(def: SlopeDef): number {
  if (!def.margins || !def.interfaces[0]?.length) return 0;
  const terr = spanInterface(def.interfaces[0], def.margins.xmin, def.margins.xmax); let n = 0;
  for (let k = 1; k < def.interfaces.length; k++) {
    const lay = def.interfaces[k]; if (lay.length < 2) continue;
    if (!lay.some((p) => p[1] > interfaceY(terr, p[0]) + 1e-9)) continue;   // toda por debajo: se respeta tal cual
    const x0 = lay[0][0], x1 = lay[lay.length - 1][0];
    const xs = new Set<number>(); for (const p of lay) xs.add(p[0]); for (const p of terr) if (p[0] > x0 + 1e-9 && p[0] < x1 - 1e-9) xs.add(p[0]);
    const X = [...xs].sort((a, b) => a - b), f = (x: number) => interfaceY(lay, x) - interfaceY(terr, x);
    const out: Pt[] = []; const put = (x: number) => { const y = Math.min(interfaceY(lay, x), interfaceY(terr, x)); out.push([Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]); };
    for (let i = 0; i < X.length; i++) { put(X[i]); if (i + 1 < X.length) { const a = f(X[i]), b = f(X[i + 1]); if ((a < 0 && b > 0) || (a > 0 && b < 0)) put(X[i] + (X[i + 1] - X[i]) * a / (a - b)); } }
    // quitar puntos colineales (y repetidos) para no ensuciar el .hgeo
    const simp: Pt[] = [];
    for (const p of out) { const q = simp[simp.length - 1]; if (q && Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6) continue; if (simp.length >= 2) { const o = simp[simp.length - 2]; if (Math.abs((q[0] - o[0]) * (p[1] - o[1]) - (q[1] - o[1]) * (p[0] - o[0])) < 0.02) simp.pop(); } simp.push(p); }
    def.interfaces[k] = simp; n++;
  }
  return n;
}

/** Región de GEO5 de un punto = nº de interfaces por encima (el terreno cuenta): 1 = bajo el terreno, 2 = bajo la capa 1… */
export function regionAt(def: SlopeDef, x: number, y: number): number {
  const m = def.margins!;
  return def.interfaces.reduce((n, it, k) => n + (interfaceY(k === 0 ? effectiveTerrain(def) : spanInterface(it, m.xmin, m.xmax), x) > y + 1e-9 ? 1 : 0), 0);
}
/** Al cerrar una capa: la región nueva sin suelo recibe el siguiente suelo aún no usado (en el punto de MÁXIMO espesor de la
 *  región), como haría uno a mano en el frame Assign de GEO5. Devuelve los avisos ("ARCILLA asignada bajo la capa 1"). */
export function autoAssign(def: SlopeDef): string[] {
  const out: string[] = []; const m = def.margins; if (!m || def.interfaces.length < 2 || !def.soils.length) return out;
  const spans = def.interfaces.map((it) => spanInterface(it, m.xmin, m.xmax));
  const usados = new Set(def.assign.map((a) => a.soil)); usados.add(def.soils[0].name);   // el primer suelo ya es el de la región 1
  const libres = def.soils.map((s) => s.name).filter((n) => !usados.has(n));
  for (let k = 1; k < def.interfaces.length && libres.length; k++) {
    const region = k + 1; if (def.assign.some((a) => regionAt(def, a.p[0], a.p[1]) === region)) continue;
    let best: { x: number; y: number; t: number } | null = null;
    for (let i = 1; i < 100; i++) {   // x de mayor espesor entre la capa k y la de abajo (o el fondo)
      const x = m.xmin + (m.xmax - m.xmin) * i / 100, top = interfaceY(spans[k], x), bot = k + 1 < spans.length ? interfaceY(spans[k + 1], x) : m.bottom;
      const t = top - bot; if (t > 0.2 && (!best || t > best.t)) best = { x, y: (top + bot) / 2, t };
    }
    if (!best) continue;
    const soil = libres.shift()!; def.assign.push({ soil, p: [Math.round(best.x * 100) / 100, Math.round(best.y * 100) / 100] });
    out.push(`${soil} asignado bajo la capa ${k} (en ${def.assign[def.assign.length - 1].p.join(",")}; cámbialo en Asignar)`);
  }
  return out;
}
