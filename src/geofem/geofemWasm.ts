// Motor WASM (C++ compilado con emscripten, src/geofem/cpp/geofem.cpp). Misma interfaz de resultados
// que GeoFem (solver.ts); el log llega línea a línea por Module.geoLog.
import type { GeoModel, StageResult, Log } from "./solver";
// @ts-ignore — módulo generado por emcc (build_wasm.sh)
import createModule from "./built/geofem.js";

type Mod = {
  HEAPF64: Float64Array; HEAP32: Int32Array;
  geoLog?: (s: string) => void;
  _geofem_create: (nn: number, ne: number, X: number, Y: number, ELE: number, EMAT: number, nfixed: number, FIXED: number, nmat: number, MAT: number) => number;
  _geofem_set_mat: (h: number, MAT: number) => void;
  _geofem_band: (h: number) => number; _geofem_nfree: (h: number) => number;
  _geofem_gravity: (h: number) => number; _geofem_nsteps: (h: number) => number;
  _geofem_ngp: (h: number) => number; _geofem_state1: (h: number, sig: number, epl: number, eps: number, u1: number) => void;
  _geofem_run_stage: (h: number, F: number, u: number, uel: number, srf: number, stepsU: number, maxSteps: number) => number;
  _geofem_destroy: (h: number) => void;
  _geofem_alloc: (n: number) => number; _geofem_alloc_i: (n: number) => number; _geofem_free: (p: number) => void;
};

let modPromise: Promise<Mod> | null = null;
export function loadWasm(): Promise<Mod> { return (modPromise ??= createModule() as Promise<Mod>); }

const f4 = (x: number) => x.toFixed(4);

export class GeoFemWasm {
  readonly band: number; readonly nfree: number; readonly ndof: number; readonly nn: number;
  readonly Fg2: Float64Array;
  private constructor(private mod: Mod, private h: number, private m: GeoModel, public log: Log) {
    this.nn = m.X.length; this.ndof = 2 * this.nn;
    this.band = mod._geofem_band(h); this.nfree = mod._geofem_nfree(h);
    const g = mod._geofem_gravity(h) >> 3;
    this.Fg2 = Float64Array.from(mod.HEAPF64.subarray(g, g + this.ndof));
    // comprobación de la fixture (misma línea que solver.ts)
    let sFg = 0, sFg2 = 0, sFs = 0, sFax = 0, sFay = 0, dmax = 0;
    for (let i = 0; i < this.nn; i++) {
      sFg += m.Fg[2 * i + 1]; sFg2 += this.Fg2[2 * i + 1]; sFs += m.Fs[2 * i + 1]; sFax += m.Fa[2 * i]; sFay += m.Fa[2 * i + 1];
      dmax = Math.max(dmax, Math.abs(this.Fg2[2 * i] - m.Fg[2 * i]), Math.abs(this.Fg2[2 * i + 1] - m.Fg[2 * i + 1]));
    }
    log(`cargas: gravedad Fy=${sFg.toFixed(3)} (recalculada ${sFg2.toFixed(3)}, dif max ${dmax.toExponential(2)}) | sobrecarga Fy=${sFs.toFixed(3)} | ancla Fx=${sFax.toFixed(3)} Fy=${sFay.toFixed(3)} kN`);
  }

  static async create(m: GeoModel, log: Log = () => {}): Promise<GeoFemWasm> {
    const mod = await loadWasm();
    mod.geoLog = log;
    const nn = m.X.length, ne = m.ELE.length, nmat = m.MAT.length;
    const pX = mod._geofem_alloc(nn), pY = mod._geofem_alloc(nn), pE = mod._geofem_alloc_i(6 * ne), pM = mod._geofem_alloc_i(ne);
    const pF = mod._geofem_alloc_i(m.FIXED.length), pMat = mod._geofem_alloc(6 * nmat);
    mod.HEAPF64.set(m.X, pX >> 3); mod.HEAPF64.set(m.Y, pY >> 3);
    mod.HEAP32.set(m.ELE.flat(), pE >> 2); mod.HEAP32.set(m.EMAT, pM >> 2); mod.HEAP32.set(m.FIXED, pF >> 2);
    mod.HEAPF64.set(m.MAT.flat(), pMat >> 3);
    const h = mod._geofem_create(nn, ne, pX, pY, pE, pM, m.FIXED.length, pF, nmat, pMat);
    for (const p of [pX, pY, pE, pM, pF, pMat]) mod._geofem_free(p);
    return new GeoFemWasm(mod, h, m, log);
  }

  setLog(log: Log): void { this.log = log; this.mod.geoLog = log; }

  run(m: GeoModel, stageIdx: number[] = m.stages.map((_, i) => i), onStage?: (r: StageResult, index: number) => void): StageResult[] {
    const mod = this.mod, ndof = this.ndof, MAXS = 12;
    mod.geoLog = this.log;
    const pMat = mod._geofem_alloc(6 * m.MAT.length); mod.HEAPF64.set(m.MAT.flat(), pMat >> 3); mod._geofem_set_mat(this.h, pMat); mod._geofem_free(pMat);
    const pF = mod._geofem_alloc(ndof), pU = mod._geofem_alloc(ndof), pUel = mod._geofem_alloc(ndof), pSrf = mod._geofem_alloc(MAXS), pSU = mod._geofem_alloc(MAXS * ndof);
    const LOADS: Record<string, number[] | Float64Array> = { ...(m.loads || {}), Fg: m.recomputeGravity ? this.Fg2 : m.Fg, Fs: m.Fs, Fa: m.Fa };
    const t0 = performance.now();
    const results: StageResult[] = [];
    for (const si of stageIdx) {
      const st = m.stages[si];
      const F = new Float64Array(ndof);
      for (const nm of st.loads) { const v = LOADS[nm]; if (!v) throw new Error(`carga desconocida ${nm}`); for (let d = 0; d < ndof; d++) F[d] += v[d]; }
      mod.HEAPF64.set(F, pF >> 3);
      const ts = performance.now();
      this.log(""); this.log(`### ${st.name} ###`);
      const fs = mod._geofem_run_stage(this.h, pF, pU, pUel, pSrf, pSU, MAXS);
      const sec = (performance.now() - ts) / 1000;
      const u = Float64Array.from(mod.HEAPF64.subarray(pU >> 3, (pU >> 3) + ndof));
      const uel = Float64Array.from(mod.HEAPF64.subarray(pUel >> 3, (pUel >> 3) + ndof));
      const ns = mod._geofem_nsteps(this.h);
      const steps = Array.from({ length: ns }, (_, k) => ({ srf: mod.HEAPF64[(pSrf >> 3) + k], u: Float64Array.from(mod.HEAPF64.subarray((pSU >> 3) + k * ndof, (pSU >> 3) + (k + 1) * ndof)) }));
      // estado de tensión (SRF=1): σ, ε_pl, ε por punto de Gauss y u1
      const ngp = mod._geofem_ngp(this.h), pS = mod._geofem_alloc(ngp * 4), pP = mod._geofem_alloc(ngp * 4), pE = mod._geofem_alloc(ngp * 4), pU1 = mod._geofem_alloc(ndof);
      mod._geofem_state1(this.h, pS, pP, pE, pU1);
      const sig1 = Float64Array.from(mod.HEAPF64.subarray(pS >> 3, (pS >> 3) + ngp * 4)), epl1 = Float64Array.from(mod.HEAPF64.subarray(pP >> 3, (pP >> 3) + ngp * 4));
      const eps1 = Float64Array.from(mod.HEAPF64.subarray(pE >> 3, (pE >> 3) + ngp * 4)), u1 = Float64Array.from(mod.HEAPF64.subarray(pU1 >> 3, (pU1 >> 3) + ndof));
      for (const p of [pS, pP, pE, pU1]) mod._geofem_free(p);
      this.log(`  ${st.name.padEnd(22)} >>> FS=${f4(fs)}  ${st.geo5 ? `(GEO5=${st.geo5.toFixed(2)})` : "(sin referencia GEO5)"}  [${sec.toFixed(1)} s]`);
      const res: StageResult = { name: st.name, fs, geo5: st.geo5, u, uel, steps, prog: "", seconds: sec, u1, sig1, epl1, eps1, ngp };
      results.push(res); onStage?.(res, si);
    }
    for (const p of [pF, pU, pUel, pSrf, pSU]) mod._geofem_free(p);
    this.log(""); this.log("================ RESUMEN (Hekatan Geotechnic · WASM) ================");
    for (const r of results) this.log(`  ${r.name.padEnd(22)} FS=${f4(r.fs)}  ${r.geo5 ? `(GEO5 ${r.geo5.toFixed(2)})  dif=${(100 * (r.fs / r.geo5 - 1)) >= 0 ? "+" : ""}${(100 * (r.fs / r.geo5 - 1)).toFixed(1)}%` : "(sin referencia GEO5)"}  t=${r.seconds.toFixed(1)} s`);
    this.log(`TOTAL ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    return results;
  }
}
