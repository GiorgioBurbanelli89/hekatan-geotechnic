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
//   malla 2.3                                tamaño de arista objetivo [m]
//   etapa NOMBRE [geo5=1.69] [q=35 en x1,y1 -> x2,y2] [F=72 en x,y ang=-17]
//       cada etapa AÑADE sus cargas a las de la etapa anterior (peso propio siempre está)
//   # comentario
//
// Compatibilidad: también se aceptan `contorno x,y …` + `capa NOMBRE bajo|sobre x,y …` (forma vieja).
export type Pt = [number, number];
export type Soil = { name: string; E: number; nu: number; phi: number; c: number; gamma: number; psi: number };
export type Layer = { soil: string; side: "bajo" | "sobre"; poly: Pt[] };
export type Surcharge = { q: number; a: Pt; b: Pt };
export type Anchor = { F: number; p: Pt; ang: number };
export type StageDef = { name: string; geo5?: number; surcharges: Surcharge[]; anchors: Anchor[] };
export type SlopeDef = {
  outline: Pt[]; soils: Soil[]; layers: Layer[]; h: number; stages: StageDef[];
  margins?: { xmin: number; xmax: number; bottom: number };
  interfaces: Pt[][];                       // GEO5: de margen a margen, la primera = terreno
  assign: { soil: string; p: Pt }[];        // GEO5: punto dentro de la región
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

const num = (s: string) => { const v = parseFloat(s.replace(",", ".")); if (!Number.isFinite(v)) throw new Error(`número inválido: "${s}"`); return v; };
const pts = (toks: string[]): Pt[] => toks.map((t) => { const m = t.match(/^(-?[\d.]+),(-?[\d.]+)$/); if (!m) throw new Error(`punto inválido: "${t}" (usa x,y)`); return [num(m[1]), num(m[2])]; });
const kv = (toks: string[]): Record<string, string> => { const o: Record<string, string> = {}; for (const t of toks) { const m = t.match(/^([A-Za-z_]+)=(.+)$/); if (m) o[m[1].toLowerCase()] = m[2]; } return o; };

export function parseHgeo(text: string): SlopeDef {
  const def: SlopeDef = { outline: [], soils: [], layers: [], h: 2.5, stages: [], interfaces: [], assign: [], comments: [] };
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
      else if (cmd === "talud") { const o = kv(toks.slice(1)); def.param = { xpie: num(o.xpie ?? "10"), zpie: num(o.zpie ?? "-10"), H: num(o.h ?? "6"), beta: num(o.beta ?? "33"), corona: num(o.corona ?? "8"), zfin: num(o.zfin ?? String(num(o.zpie ?? "-10") + num(o.h ?? "6"))), beta2: num(o.beta2 ?? "28.6") }; def.interfaces.unshift([]); }
      else if (cmd === "suelo") {
        const o = kv(toks.slice(2));
        def.soils.push({ name: toks[1], E: num(o.e ?? "0"), nu: num(o.nu ?? "0.3"), phi: num(o.phi ?? "0"), c: num(o.c ?? "0"), gamma: num(o.gamma ?? "0"), psi: num(o.psi ?? "0") });
      } else if (cmd === "asignar") { const en = toks.indexOf("en"); def.assign.push({ soil: toks[1], p: pts([toks[en + 1]])[0] }); }
      else if (cmd === "capa") {
        const side = toks[2].toLowerCase();
        def.layers.push({ soil: toks[1], side: side === "sobre" || side === "encima" ? "sobre" : "bajo", poly: pts(toks.slice(3)) });
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
  if (def.interfaces.length) {
    if (!def.margins) { const xs = def.interfaces.flat().map((p) => p[0]), ys = def.interfaces.flat().map((p) => p[1]); def.margins = { xmin: Math.min(...xs), xmax: Math.max(...xs), bottom: Math.min(...ys) - 10 }; }
    def.outline = outlineFromInterfaces(def);
  }
  if (def.outline.length < 3) throw new Error("falta el terreno: `interfaz x,y …` (o un `contorno`)");
  if (!def.soils.length) throw new Error("falta al menos un suelo");
  if (!def.stages.length) def.stages.push({ name: "peso propio", surcharges: [], anchors: [] });
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
function outlineFromInterfaces(def: SlopeDef): Pt[] {
  const m = def.margins!;
  const terr = spanInterface(def.interfaces[0], m.xmin, m.xmax);
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
  for (const s of def.soils) L.push(`suelo ${s.name} E=${r(s.E)} nu=${r(s.nu)} phi=${r(s.phi)} c=${r(s.c)} gamma=${r(s.gamma)}${s.psi ? ` psi=${r(s.psi)}` : ""}`);
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
