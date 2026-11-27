// SRM de una etapa de un modelo POR ETAPAS (`etapa … srm=1`) en el motor WASM (C++), que es ~3-4 veces más rápido que el TS.
// El WASM no conoce la actividad ni el cambio de material por etapa en la SRM, así que se le da un modelo NORMAL (no por etapas)
// con SOLO los elementos activos de esa etapa, sus materiales (`emat`) y los nudos que usan (renumerados). Los apoyos son los
// del modelo completo (base MX+MY, laterales MX). Es el mismo problema que GeoFem.srmEnEtapa (TS) resuelve con los gdl dormidos
// (muelle 1e12 en nudos sin elemento activo, que no tocan a los demás): tests/excavacion_muro.ts compara los dos motores.
import type { GeoModel, StageResult } from "./solver";

export type SubModelo = { model: GeoModel; nodos: Int32Array };   // nodos[i_sub] = nudo del modelo completo

export function subModeloSrm(m: GeoModel, si: number): SubModelo {
  const st = m.stages[si], ne = m.ELE.length, act = st.active ?? new Array(ne).fill(1), emat = st.emat ?? m.EMAT;
  const nuevo = new Int32Array(m.X.length).fill(-1), nodos: number[] = [];
  const ELE: number[][] = [], EMAT: number[] = [];
  for (let e = 0; e < ne; e++) {
    if (!act[e]) continue;
    ELE.push(m.ELE[e].map((i) => { if (nuevo[i] < 0) { nuevo[i] = nodos.length; nodos.push(i); } return nuevo[i]; }));
    EMAT.push(emat[e]);
  }
  const X = nodos.map((i) => m.X[i]), Y = nodos.map((i) => m.Y[i]), nd = 2 * nodos.length;
  const fijo = new Set(m.FIXED), FIXED: number[] = [];
  nodos.forEach((i, k) => { if (fijo.has(2 * i)) FIXED.push(2 * k); if (fijo.has(2 * i + 1)) FIXED.push(2 * k + 1); });
  const sub = (v: ArrayLike<number>) => { const o = new Array<number>(nd); nodos.forEach((i, k) => { o[2 * k] = v[2 * i]; o[2 * k + 1] = v[2 * i + 1]; }); return o; };
  const loads: Record<string, number[]> = {}; for (const [k, v] of Object.entries(m.loads ?? {})) loads[k] = sub(v);
  const model: GeoModel = {
    name: (m.name ?? "hgeo") + " · SRM de la etapa", X, Y, ELE, EMAT, FIXED, Fg: new Array(nd).fill(0), Fs: sub(m.Fs), Fa: sub(m.Fa),
    MAT: m.MAT, recomputeGravity: true, loads, MATNAMES: m.MATNAMES, RIGID: m.RIGID, ...(m.MODEL ? { MODEL: m.MODEL } : {}),
    ...(m.srmContinua ? { srmContinua: m.srmContinua } : {}),
    stages: [{ name: st.name, loads: st.loads, geo5: st.geo5 }],
  };
  return { model, nodos: Int32Array.from(nodos) };
}

/** Lleva un vector de gdl del submodelo al modelo completo (0 en los nudos que no están). */
export function aCompleto(v: ArrayLike<number>, nodos: Int32Array, ndof: number): Float64Array {
  const o = new Float64Array(ndof); nodos.forEach((i, k) => { o[2 * i] = v[2 * k]; o[2 * i + 1] = v[2 * k + 1]; }); return o;
}

/** Resultado del submodelo expresado en el modelo completo (u, uel, peldaños; σ por punto de Gauss reordenada). */
export function resultadoCompleto(r: StageResult, s: SubModelo, m: GeoModel, si: number): StageResult {
  const ndof = 2 * m.X.length, ne = m.ELE.length, act = m.stages[si].active ?? new Array(ne).fill(1);
  let na = 0; for (let e = 0; e < ne; e++) if (act[e]) na++;
  const NG = Math.round((r.ngp ?? 7 * na) / na);
  const gp = (a?: Float64Array) => { if (!a) return a; const o = new Float64Array(ne * NG * 4); let k = 0; for (let e = 0; e < ne; e++) if (act[e]) { o.set(a.subarray(k * NG * 4, (k + 1) * NG * 4), e * NG * 4); k++; } return o; };
  return { ...r, u: aCompleto(r.u, s.nodos, ndof), uel: aCompleto(r.uel, s.nodos, ndof), steps: r.steps.map((q) => ({ srf: q.srf, u: aCompleto(q.u, s.nodos, ndof) })),
    u1: r.u1 ? aCompleto(r.u1, s.nodos, ndof) : r.u1, sig1: gp(r.sig1), epl1: gp(r.epl1), eps1: gp(r.eps1), ngp: ne * NG };
}
