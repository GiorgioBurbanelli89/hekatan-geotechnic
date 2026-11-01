// Lector del DXF que EXPORTA GeoFEM de GEO5 (File → Export → «Data into CAD file…», 1-nov-2026).
//
// Lo que GEO5 escribe (medido con el muro de Manabí, etapa 7, DXF 2000, 1.5 MB):
//   · capa GEOFEM_ACTIVE_MESH   : una LINE por LADO de elemento (4215 líneas, los lados rectos entre ESQUINAS; los nudos
//                                 medios del T6 no se dibujan). 1387 vértices distintos = los nudos esquina del modelo.
//   · capa GEOFEM_ACTIVE_AREAS  : LWPOLYLINE cerrada por cada región activa (contornos de suelo / cuerpo rígido).
// NO exporta resultados ni colores: solo la MALLA y las áreas ACTIVAS DE LA ETAPA en pantalla. Sirve para fijar nudo a nudo
// la misma malla de GEO5 y comparar lo demás (Output_File_Geo.bin, monitores) sin depender del mallador propio.
export interface MallaGeo5Dxf {
  lados: [number, number, number, number][];     // x1 y1 x2 y2 (m)
  nudos: { x: number; y: number }[];             // vértices distintos (esquinas), orden de aparición
  lados_idx: [number, number][];                 // los mismos lados como pares de índices en `nudos`
  areas: { x: number; y: number }[][];           // contornos cerrados de las regiones activas
  bbox: [number, number, number, number];
}

const r = (v: number) => Math.round(v * 1e6) / 1e6;

export function leerDxfGeo5(texto: string): MallaGeo5Dxf {
  const t = texto.replace(/\r/g, "").split("\n");
  const pares: [string, string][] = [];
  for (let k = 0; k + 1 < t.length; k += 2) pares.push([t[k].trim(), t[k + 1].trim()]);
  let ini = pares.findIndex(([g, v]) => g === "2" && v === "ENTITIES");
  if (ini < 0) throw new Error("El DXF no tiene sección ENTITIES");
  const lados: [number, number, number, number][] = [];
  const areas: { x: number; y: number }[][] = [];
  let cur = "", capa = "", d: Record<string, number> = {}, vs: { x: number; y: number }[] = [];
  const cierra = () => {
    if (cur === "LINE" && capa === "GEOFEM_ACTIVE_MESH") lados.push([d["10"], d["20"], d["11"], d["21"]]);
    if (cur === "LWPOLYLINE" && capa === "GEOFEM_ACTIVE_AREAS") areas.push(vs);
  };
  for (let k = ini + 1; k < pares.length; k++) {
    const [g, v] = pares[k];
    if (g === "0") {
      cierra();
      if (v === "ENDSEC") { cur = ""; break; }
      cur = v; capa = ""; d = {}; vs = [];
      continue;
    }
    if (g === "8") capa = v;
    else if (cur === "LINE" && (g === "10" || g === "20" || g === "11" || g === "21")) d[g] = parseFloat(v);
    else if (cur === "LWPOLYLINE") {
      if (g === "10") vs.push({ x: parseFloat(v), y: NaN });
      else if (g === "20" && vs.length) vs[vs.length - 1].y = parseFloat(v);
    }
  }
  const idx = new Map<string, number>(); const nudos: { x: number; y: number }[] = [];
  const id = (x: number, y: number) => { const key = r(x) + "," + r(y); let i = idx.get(key); if (i === undefined) { i = nudos.length; idx.set(key, i); nudos.push({ x, y }); } return i; };
  const lados_idx: [number, number][] = lados.map(([a, b, c, e]) => [id(a, b), id(c, e)]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nudos) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
  return { lados, nudos, lados_idx, areas, bbox: [x0, y0, x1, y1] };
}

/** Empareja los nudos esquina del DXF con los de un modelo (X, Y) por coordenada, a `tol` metros. Devuelve índice de modelo o −1. */
export function emparejarConModelo(m: MallaGeo5Dxf, X: number[], Y: number[], tol = 2e-4): Int32Array {
  const celda = Math.max(tol * 4, 1e-3); const g = new Map<string, number[]>();
  for (let i = 0; i < X.length; i++) { const k = Math.round(X[i] / celda) + "," + Math.round(Y[i] / celda); (g.get(k) ?? g.set(k, []).get(k)!).push(i); }
  const out = new Int32Array(m.nudos.length).fill(-1);
  m.nudos.forEach((n, j) => {
    const cx = Math.round(n.x / celda), cy = Math.round(n.y / celda); let mejor = -1, dm = tol;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const i of g.get((cx + a) + "," + (cy + b)) ?? []) {
      const dd = Math.max(Math.abs(X[i] - n.x), Math.abs(Y[i] - n.y)); if (dd <= dm) { dm = dd; mejor = i; }
    }
    out[j] = mejor;
  });
  return out;
}
