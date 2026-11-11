// Motor WASM (C++ compilado con emscripten, src/geofem/cpp/geofem.cpp). Misma interfaz de resultados
// que GeoFem (solver.ts); el log llega línea a línea por Module.geoLog.
import { fgConAgua, extraAguaEtapa } from "./agua";
import type { GeoModel, StageResult, Log, DynNLOptions, DynNLResult } from "./solver";
import { GEO5_SRM, RIGID_E, RIGID_NU, srmBits, historyFn } from "./solver";
// @ts-ignore — módulo generado por emcc (build_wasm.sh)
import createModule from "./built/geofem.js";

type Mod = {
  HEAPF64: Float64Array; HEAP32: Int32Array;
  geoLog?: (s: string) => void;
  _geofem_create: (nn: number, ne: number, X: number, Y: number, ELE: number, EMAT: number, nfixed: number, FIXED: number, nmat: number, MAT: number) => number;
  _geofem_set_mat: (h: number, MAT: number) => void;
  _geofem_set_rigid: (h: number, rigid: number, n: number) => void;
  _geofem_set_model: (h: number, model: number, n: number) => void;
  _geofem_set_srm: (h: number, continua: number) => void;
  _geofem_band: (h: number) => number; _geofem_nfree: (h: number) => number;
  _geofem_gravity: (h: number) => number; _geofem_nsteps: (h: number) => number;
  _geofem_ngp: (h: number) => number; _geofem_state1: (h: number, sig: number, epl: number, eps: number, u1: number) => void;
  _geofem_run_stage: (h: number, F: number, u: number, uel: number, srf: number, stepsU: number, maxSteps: number) => number;
  _geofem_run_staged: (h: number, act: number, F: number, first: number, u: number) => number;
  _geofem_alcanzada: (h: number) => number;
  _geofem_dynamic_nl: (h: number, par: number, edyn: number, rho: number, rayMat: number, times: number, acc: number, nst: number, sig0: number, watchDof: number, nwatch: number, outHist: number, outU: number, outIters: number, outEtaMin: number) => number;
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
    // RIGID BODY de GEO5 = elástico E = Eur = 1e9 kPa, ν = 0.2 (binario: Geo5Solver_decomp.c:73262, material tipo 1). Tanda 12:
    // con el E del hormigón (2.1e7) el Δu del 1.1111 salía 12 % mayor que el del solver real; con 1e9, a 1e-10.
    // SOLO en el modo GEO5 del muro (bit 32): los demás casos (otros oráculos: Abaqus, SAP) siguen con el E del material.
    const rigM = m.RIGID ?? (m.MATNAMES ?? []).map((n) => /muro|hormig|concret|wall/i.test(n));
    const g5 = (srmBits(m.srmContinua) & 32) !== 0;
    mod.HEAPF64.set(m.MAT.flatMap((M, i) => (g5 && rigM[i] ? [RIGID_E, RIGID_NU, ...M.slice(2)] : M)), pMat >> 3);
    const h = mod._geofem_create(nn, ne, pX, pY, pE, pM, m.FIXED.length, pF, nmat, pMat);
    // materiales RÍGIDOS (muro = «Rigid body» de GEO5: región elástica que la SRM no reduce)
    if (m.RIGID?.some((r) => r)) { const pR = mod._geofem_alloc_i(nmat); mod.HEAP32.set(m.RIGID.map((r) => (r ? 1 : 0)), pR >> 2); mod._geofem_set_rigid(h, pR, nmat); mod._geofem_free(pR); }
    if (m.srmContinua) mod._geofem_set_srm(h, srmBits(m.srmContinua));   // modo GEO5 (bits: ver geofem.cpp)
    if (m.MODEL?.some((v) => v)) { const pD = mod._geofem_alloc_i(nmat); mod.HEAP32.set(m.MODEL, pD >> 2); mod._geofem_set_model(h, pD, nmat); mod._geofem_free(pD); }   // Mohr-Coulomb por material
    for (const p of [pX, pY, pE, pM, pF, pMat]) mod._geofem_free(p);
    return new GeoFemWasm(mod, h, m, log);
  }

  setLog(log: Log): void { this.log = log; this.mod.geoLog = log; }

  /** Dinámico NO LINEAL (Mohr-Coulomb de GEO5) en el motor C++: mismas opciones y resultado que GeoFem.dynamicNL (solver.ts);
   *  validado contra FRGeoFEM 2024 (tests/dinamico_nl_geo5.ts). Las historias de aceleración `ax`/`ay` no se calculan (0). */
  dynamicNL(o: DynNLOptions): DynNLResult {
    const mod = this.mod, ndof = this.ndof, nmat = this.m.MAT.length, nst = Math.round(o.tEnd / o.dt);
    const alpha = o.alpha ?? 0, beta = o.beta ?? (1 - alpha) ** 2 / 4, gamma = o.gamma ?? 0.5 - alpha;
    const ag = typeof o.accel === "function" ? o.accel : historyFn(o.accel);
    const times = new Float64Array(nst + 1), acc = new Float64Array(nst + 1);
    times[0] = o.t0 ?? 0; for (let k = 1; k <= nst; k++) { times[k] = k * o.dt; acc[k] = ag(times[k]); }
    const par = [alpha, beta, gamma, o.tolN ?? 1e-11, o.maxit ?? 100, (o.ls?.on ?? true) ? 1 : 0, o.ls?.tol ?? 0.8, o.ls?.etaMin ?? 0.1, o.ls?.etaMax ?? 1, o.dir === "y" ? 1 : 0, o.g ?? 9.80665];
    const ray = o.rayleighMat ?? (o.rayleigh ? this.m.MAT.map(() => o.rayleigh as [number, number]) : null);
    const watch = o.watch ?? [], wd = watch.flatMap((nd) => [2 * nd, 2 * nd + 1]), nw = wd.length;
    const put = (a: ArrayLike<number> | null): number => { if (!a) return 0; const p = mod._geofem_alloc(a.length); mod.HEAPF64.set(a, p >> 3); return p; };
    const pMat = put(this.m.MAT.flat()); mod._geofem_set_mat(this.h, pMat);
    const pPar = put(par), pEd = put(o.edyn ?? null), pRho = put(o.rho ?? null), pRay = put(ray ? ray.flat() : null), pT = put(times), pA = put(acc), pS = put(o.sig0 ?? null);
    const pW = mod._geofem_alloc_i(Math.max(nw, 1)); if (nw) mod.HEAP32.set(wd, pW >> 2);
    const pH = mod._geofem_alloc(Math.max((nst + 1) * nw, 1)), pU = mod._geofem_alloc(ndof), pI = mod._geofem_alloc_i(nst + 1), pE = mod._geofem_alloc(nst + 1);
    const t0 = performance.now();
    mod.geoLog = this.log;
    const ok = mod._geofem_dynamic_nl(this.h, pPar, pEd, pRho, pRay, pT, pA, nst, pS, pW, nw, pH, pU, pI, pE);
    const sec = (performance.now() - t0) / 1000;
    const H = mod.HEAPF64, hist = watch.map((node, j) => {
      const ux = new Float64Array(nst + 1), uy = new Float64Array(nst + 1);
      for (let k = 0; k <= nst; k++) { ux[k] = H[(pH >> 3) + k * nw + 2 * j]; uy[k] = H[(pH >> 3) + k * nw + 2 * j + 1]; }
      return { node, ux, uy, ax: new Float64Array(nst + 1), ay: new Float64Array(nst + 1) };
    });
    const u = Float64Array.from(H.subarray(pU >> 3, (pU >> 3) + ndof)), iters = Array.from(mod.HEAP32.subarray(pI >> 2, (pI >> 2) + nst + 1)), etaMin = Float64Array.from(H.subarray(pE >> 3, (pE >> 3) + nst + 1));
    for (const p of [pMat, pPar, pEd, pRho, pRay, pT, pA, pS, pW, pH, pU, pI, pE]) if (p) mod._geofem_free(p);
    if (!ok) this.log("  dynamicNL (WASM): algún paso no convergió");
    const umaxAbs = new Float64Array(ndof);
    return { t: times, coef: { b1: 1 / (beta * o.dt * o.dt), b2: 1 / (beta * o.dt), b3: 0, b4: gamma / (beta * o.dt), b5: 0, b6: 0, beta, gamma, alpha }, hist, u, umaxAbs, seconds: sec, iters,
      etas: Array.from(etaMin, (e) => (e < 1 ? [e] : [])), etaMin, sig: new Float64Array(0) };
  }

  /** CONSTRUCCIÓN POR ETAPAS (Activity de GEO5): TODAS las etapas en orden, cada una desde el estado de la anterior.
   *  Análisis de tensiones (SRF = 1): no hay factor de seguridad (fs = NaN). El peso lo pone el motor (solo elementos activos). */
  runStaged(m: GeoModel, onStage?: (r: StageResult, index: number) => void): StageResult[] {
    const mod = this.mod, ndof = this.ndof, ne = m.ELE.length;
    const pMat = mod._geofem_alloc(6 * m.MAT.length); mod.HEAPF64.set(m.MAT.flat(), pMat >> 3); mod._geofem_set_mat(this.h, pMat); mod._geofem_free(pMat);
    const pF = mod._geofem_alloc(ndof), pU = mod._geofem_alloc(ndof), pA = mod._geofem_alloc_i(ne);
    const LOADS: Record<string, number[] | Float64Array> = { ...(m.loads || {}), Fs: m.Fs, Fa: m.Fa };
    const results: StageResult[] = [];
    m.stages.forEach((st, si) => {
      const F = new Float64Array(ndof);
      for (const nm of st.loads) { if (nm === "Fg") continue; const v = LOADS[nm]; if (!v) throw new Error(`carga desconocida ${nm}`); for (let d = 0; d < ndof; d++) F[d] += v[d]; }
      if (m.agua) { const ex = extraAguaEtapa(m, st.active ?? new Array(ne).fill(1)); for (let d = 0; d < ndof; d++) F[d] += ex[d]; }
      mod.HEAPF64.set(F, pF >> 3); mod.HEAP32.set(st.active ?? new Array(ne).fill(1), pA >> 2);
      const ts = performance.now();
      this.log(""); this.log(`### ${st.name} ###`);
      const conv = mod._geofem_run_staged(this.h, pA, pF, si === 0 ? 1 : 0, pU);
      const sec = (performance.now() - ts) / 1000;
      const u = Float64Array.from(mod.HEAPF64.subarray(pU >> 3, (pU >> 3) + ndof));
      const ngp = mod._geofem_ngp(this.h), pS = mod._geofem_alloc(ngp * 4), pP = mod._geofem_alloc(ngp * 4), pE = mod._geofem_alloc(ngp * 4), pU1 = mod._geofem_alloc(ndof);
      mod._geofem_state1(this.h, pS, pP, pE, pU1);
      const sig1 = Float64Array.from(mod.HEAPF64.subarray(pS >> 3, (pS >> 3) + ngp * 4)), epl1 = Float64Array.from(mod.HEAPF64.subarray(pP >> 3, (pP >> 3) + ngp * 4));
      const eps1 = Float64Array.from(mod.HEAPF64.subarray(pE >> 3, (pE >> 3) + ngp * 4));
      for (const p of [pS, pP, pE, pU1]) mod._geofem_free(p);
      this.log(`  ${st.name.padEnd(22)} >>> ${conv ? "equilibrio" : "NO CONVERGE"}  [${sec.toFixed(1)} s]`);
      const res: StageResult = { name: st.name, fs: NaN, alcanzada: mod._geofem_alcanzada(this.h), geo5: st.geo5, u, uel: new Float64Array(ndof), steps: [], prog: "", seconds: sec, u1: u, sig1, epl1, eps1, ngp };
      results.push(res); onStage?.(res, si);
    });
    for (const p of [pF, pU, pA]) mod._geofem_free(p);
    return results;
  }

  run(m: GeoModel, stageIdx: number[] = m.stages.map((_, i) => i), onStage?: (r: StageResult, index: number) => void): StageResult[] {
    if (m.staged) return this.runStaged(m, onStage);
    const mod = this.mod, ndof = this.ndof, MAXS = 12;
    mod.geoLog = this.log;
    const pMat = mod._geofem_alloc(6 * m.MAT.length); mod.HEAPF64.set(m.MAT.flat(), pMat >> 3); mod._geofem_set_mat(this.h, pMat); mod._geofem_free(pMat);
    const pF = mod._geofem_alloc(ndof), pU = mod._geofem_alloc(ndof), pUel = mod._geofem_alloc(ndof), pSrf = mod._geofem_alloc(MAXS), pSU = mod._geofem_alloc(MAXS * ndof);
    const LOADS: Record<string, number[] | Float64Array> = { ...(m.loads || {}), Fg: m.agua ? fgConAgua(m) : m.recomputeGravity ? this.Fg2 : m.Fg, Fs: m.Fs, Fa: m.Fa };
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
