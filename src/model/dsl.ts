// DSL de Hekatan Geotechnic (.hgeo): texto plano, una orden por línea, como el .heks de Struct.
//
//   contorno x,y x,y x,y ...            polígono del dominio (cualquier sentido)
//   suelo NOMBRE E=130347 nu=0.3 phi=22.7 c=9 gamma=18 [psi=0]
//   capa NOMBRE bajo x,y x,y ...        los elementos cuyo centroide queda DEBAJO de esta polilínea son NOMBRE
//   capa NOMBRE sobre x,y x,y ...       (o encima)
//   malla 2.3                            tamaño de arista objetivo [m]
//   etapa NOMBRE [geo5=1.69] [q=35 en x1,y1 -> x2,y2] [F=72 en x,y ang=-17]
//       cada etapa AÑADE sus cargas a las de la etapa anterior (peso propio siempre está)
//   # comentario
export type Pt = [number, number];
export type Soil = { name: string; E: number; nu: number; phi: number; c: number; gamma: number; psi: number };
export type Layer = { soil: string; side: "bajo" | "sobre"; poly: Pt[] };
export type Surcharge = { q: number; a: Pt; b: Pt };
export type Anchor = { F: number; p: Pt; ang: number };
export type StageDef = { name: string; geo5?: number; surcharges: Surcharge[]; anchors: Anchor[] };
export type SlopeDef = { outline: Pt[]; soils: Soil[]; layers: Layer[]; h: number; stages: StageDef[] };

const num = (s: string) => { const v = parseFloat(s.replace(",", ".")); if (!Number.isFinite(v)) throw new Error(`número inválido: "${s}"`); return v; };
const pts = (toks: string[]): Pt[] => toks.map((t) => { const m = t.match(/^(-?[\d.]+),(-?[\d.]+)$/); if (!m) throw new Error(`punto inválido: "${t}" (usa x,y)`); return [num(m[1]), num(m[2])]; });
const kv = (toks: string[]): Record<string, string> => { const o: Record<string, string> = {}; for (const t of toks) { const m = t.match(/^([A-Za-z_]+)=(.+)$/); if (m) o[m[1].toLowerCase()] = m[2]; } return o; };

export function parseHgeo(text: string): SlopeDef {
  const def: SlopeDef = { outline: [], soils: [], layers: [], h: 2.5, stages: [] };
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, k) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    const toks = line.split(/\s+/);
    const cmd = toks[0].toLowerCase();
    const ln = `línea ${k + 1}`;
    try {
      if (cmd === "contorno") def.outline = pts(toks.slice(1));
      else if (cmd === "suelo") {
        const o = kv(toks.slice(2));
        def.soils.push({ name: toks[1], E: num(o.e ?? "0"), nu: num(o.nu ?? "0.3"), phi: num(o.phi ?? "0"), c: num(o.c ?? "0"), gamma: num(o.gamma ?? "0"), psi: num(o.psi ?? "0") });
      } else if (cmd === "capa") {
        const side = toks[2].toLowerCase();
        def.layers.push({ soil: toks[1], side: side === "sobre" || side === "encima" ? "sobre" : "bajo", poly: pts(toks.slice(3)) });
      } else if (cmd === "malla") def.h = num(toks[1]);
      else if (cmd === "etapa") {
        // nombre = tokens hasta el primero que lleve '='
        let i = 1; const nm: string[] = [];
        while (i < toks.length && !toks[i].includes("=")) nm.push(toks[i++]);
        const st: StageDef = { name: nm.join(" ") || `etapa${def.stages.length + 1}`, surcharges: [], anchors: [] };
        const rest = toks.slice(i);
        for (let j = 0; j < rest.length; j++) {
          const m = rest[j].match(/^([A-Za-z_0-9]+)=(.+)$/); if (!m) continue;
          const key = m[1].toLowerCase(), val = m[2];
          if (key === "geo5") st.geo5 = num(val);
          else if (key === "q") {       // q=35 en x1,y1 -> x2,y2
            const en = rest.indexOf("en", j); const p = pts([rest[en + 1], rest[en + 3]]);
            st.surcharges.push({ q: num(val), a: p[0], b: p[1] }); j = en + 3;
          } else if (key === "f") {     // F=72 en x,y ang=-17
            const en = rest.indexOf("en", j); const p = pts([rest[en + 1]])[0];
            const o = kv(rest.slice(en + 2, en + 4));
            st.anchors.push({ F: num(val), p, ang: num(o.ang ?? "0") }); j = en + 2;
          }
        }
        def.stages.push(st);
      } else throw new Error(`orden desconocida "${toks[0]}"`);
    } catch (e) { throw new Error(`${ln}: ${(e as Error).message}`); }
  });
  if (def.outline.length < 3) throw new Error("falta el contorno (mínimo 3 puntos)");
  if (!def.soils.length) throw new Error("falta al menos un suelo");
  if (!def.stages.length) def.stages.push({ name: "peso propio", surcharges: [], anchors: [] });
  return def;
}

/** Demo04 de GEO5 escrita en el DSL (geometría y cargas extraídas del InputFile). */
export const DEMO04_HGEO = `# Talud Demo04 de GEO5 (GeoFEM) — 2 suelos, 3 etapas
contorno 0,-21.5 40,-21.5 40,-4 32.25,-4 29.5,-2.5 21,-2.5 11,-9 0,-9
suelo SOIL_1 E=130347 nu=0.3 phi=22.7 c=9   gamma=18
suelo SOIL_2 E=130347 nu=0.2 phi=38   c=120 gamma=20
capa  SOIL_2 bajo 0,-11.5 14,-11 21,-9.25 40,-9
malla 2.3
etapa peso propio   geo5=1.69
etapa +sobrecarga   geo5=1.48  q=35 en 22,-2.5 -> 29,-2.5    # 7 m: medido en la fixture (ΣFy = 245 kN)
etapa +ancla        geo5=1.69  F=72 en 16,-5.75 ang=-17   # cabeza del ancla en la cara (medido en la fixture: N del T6)
`;
