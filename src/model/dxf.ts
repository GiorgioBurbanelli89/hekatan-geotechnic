// Exportar la GEOMETRÍA del .hgeo a DXF (R12/AC1009, POLYLINE por capa) para importarla en GEO5:
// frame Interfaces → "Import DXF" (GEO5 lee líneas/polilíneas y las convierte en interfaces/líneas). Luego en GEO5 quedan
// a mano: Suelos (E ν φ c γ), Asignar (punto por región), Malla y cargas por etapa — el .hgeo los lista para copiarlos.
// El .gmk NO se puede escribir (checksum sobre un bit-stream propio de Fine, sin reversar). Jorge 8-sep-2026.
import type { SlopeDef, Pt } from "./dsl";
import { spanInterface, effectiveTerrain, wallChain, wallPolygon, wallGround, wallInnerPoint } from "./dsl";

const f = (v: number) => (Math.round(v * 1000) / 1000).toString();
function polyline(layer: string, pts: Pt[], closed = false): string {
  const v = pts.map((p) => `0\nVERTEX\n8\n${layer}\n10\n${f(p[0])}\n20\n${f(p[1])}\n30\n0\n`).join("");
  return `0\nPOLYLINE\n8\n${layer}\n66\n1\n70\n${closed ? 1 : 0}\n${v}0\nSEQEND\n8\n${layer}\n`;
}
export function hgeoToDxf(def: SlopeDef): string {
  const m = def.margins ?? { xmin: 0, xmax: 40, bottom: -20 };
  const layers: string[] = ["MARGENES", "TERRENO"];
  for (let i = 1; i < def.interfaces.length; i++) layers.push(`INTERFAZ_${i}`);
  (def.lines ?? []).forEach((_, i) => layers.push(`LINEA_LIBRE_${i + 1}`));
  def.assign.forEach((a) => layers.push(`ASIGNAR_${a.soil}`));
  (def.walls ?? []).forEach((_, i) => layers.push(`MURO_${i + 1}`, `ASIGNAR_MURO_${i + 1}`));
  const tab = layers.map((l, i) => `0\nLAYER\n2\n${l}\n70\n0\n62\n${(i % 7) + 1}\n6\nCONTINUOUS\n`).join("");
  let ents = "";
  const top = Math.max(...(def.interfaces[0]?.length ? effectiveTerrain(def) : [[0, 0] as Pt]).map((p) => p[1])) + 5;
  ents += polyline("MARGENES", [[m.xmin, m.bottom], [m.xmax, m.bottom], [m.xmax, top], [m.xmin, top]], true);
  def.interfaces.forEach((it, i) => { ents += polyline(i === 0 ? "TERRENO" : `INTERFAZ_${i}`, i === 0 ? effectiveTerrain(def) : spanInterface(it, m.xmin, m.xmax)); });   // el terreno que se manda a GEO5 ya sube por la cara del muro y sigue por su relleno
  // MURO = «Rigid body» de GEO5: el contorno enterrado va como línea libre (Free line) y cierra la región del hormigón
  (def.walls ?? []).forEach((w, i) => { const z = wallGround(def, w); ents += polyline(`MURO_${i + 1}`, wallChain(w.pm, z)); const q = wallInnerPoint(w.pm, z); ents += `0
POINT
8
ASIGNAR_MURO_${i + 1}
10
${f(q[0])}
20
${f(q[1])}
30
0
`; });
  (def.lines ?? []).forEach((ln, i) => { ents += polyline(`LINEA_LIBRE_${i + 1}`, ln); });
  def.assign.forEach((a) => { ents += `0\nPOINT\n8\nASIGNAR_${a.soil}\n10\n${f(a.p[0])}\n20\n${f(a.p[1])}\n30\n0\n`; });
  return `999\nHekatan Geotechnic → GEO5 (Interfaces: Import DXF). Suelos/asignacion/cargas: ver el .hgeo\n0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${layers.length}\n${tab}0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${ents}0\nENDSEC\n0\nEOF\n`;
}
/** Lo que hay que teclear en GEO5 después de importar el DXF (frames Soils, Assign, Mesh generation, Surcharge, Anchors). */
export function recetaGeo5(def: SlopeDef): string {
  const L: string[] = ["GEO5 FEM · pasos tras «Interfaces → Import DXF»:", ""];
  L.push("SOILS (Drucker-Prager, ψ=0):"); def.soils.forEach((s) => L.push(`  ${s.name}: E=${s.E} kPa  ν=${s.nu}  φ=${s.phi}°  c=${s.c} kPa  γ=${s.gamma} kN/m³`));
  L.push("ASSIGN (punto dentro de la región):"); L.push(`  región 1 (bajo el terreno): ${def.soils[0]?.name ?? "?"}`); def.assign.forEach((a) => L.push(`  ${a.soil} en (${a.p[0]}, ${a.p[1]})`));
  (def.walls ?? []).forEach((w, i) => {
    const z = wallGround(def, w), poly = wallPolygon(w.pm, z), q = wallInnerPoint(w.pm, z);
    L.push(`MURO ${i + 1} — «RIGID BODY» (GEO5 GeoFEM: región que no se reduce en la SRM):`);
    L.push(`  la capa MURO_${i + 1} del DXF es su contorno enterrado (Free lines → Import DXF): cierra la región del hormigón`);
    L.push(`  polígono: ${poly.map((p) => `(${p[0].toFixed(2)}, ${p[1].toFixed(2)})`).join(" ")}`);
    L.push(`  ASSIGN: en (${q[0].toFixed(2)}, ${q[1].toFixed(2)}) → «Rigid body» (o el suelo ${w.soil} con modelo ELÁSTICO: E=${def.soils.find((s0) => s0.name === w.soil)?.E ?? 3e7} kPa, ν=${def.soils.find((s0) => s0.name === w.soil)?.nu ?? 0.2}, γ=${def.soils.find((s0) => s0.name === w.soil)?.gamma ?? 24} kN/m³)`);
    L.push(`  OJO: el terreno del DXF ya pasa por la cara vista del muro (talud mínimo de 6 cm: una interfaz de GEO5 es y(x) y no admite vertical exacta)`);
  });
  L.push(`MESH GENERATION: edge length ${def.h} m`);
  def.stages.forEach((st, i) => { L.push(`STAGE ${i + 1} «${st.name}»:`); st.surcharges.forEach((s) => L.push(`  Surcharge q=${s.q} kPa de (${s.a[0]}, ${s.a[1]}) a (${s.b[0]}, ${s.b[1]})`)); st.anchors.forEach((a) => L.push(`  Anchor F=${a.F} kN en (${a.p[0]}, ${a.p[1]}) ángulo ${a.ang}°`)); if (!st.surcharges.length && !st.anchors.length) L.push("  (solo peso propio)"); L.push("  Analysis → Slope stability (reduction of c, φ)"); });
  return L.join("\n");
}
