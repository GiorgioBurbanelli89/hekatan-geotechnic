// GeoFEM de Hekatan Geotechnic: talud por REDUCCIÓN DE RESISTENCIA (SRM) con T6 en deformación plana
// y Drucker-Prager. PORT FIEL de talud_geo5_hek.py (Hekatan Python), que es GEO5 a 12 cifras por
// punto de Gauss en las 124 iteraciones de la Demo04 (2026-09-04). Nada de aquí es de libro: todo
// está EXTRAÍDO del solver de GEO5 (FRGeoFEM) o MEDIDO en su "course of analysis":
//   - 7 puntos de Gauss (Hammer grado 5), σ0 = 0, cada peldaño arranca de cero con la carga total;
//   - D-P ajuste de EXTENSIÓN (α = 2 sinφ / (√3(3+sinφ))), return-map radial + tangente algorítmica
//     NO simétrica, vértice → De;
//   - φ_red = atan(tanφ / SRF), c_red = c / SRF;
//   - Newton completo (tangente del ÚLTIMO retorno de cada punto de Gauss) + line-search secante
//     (‖R(η)‖/‖R(0)‖ ≥ 0.8, η ∈ [0.1, 1]); σ se ACUMULA iteración a iteración;
//   - 3 normas num/max(den,1) (desplazamiento ABSOLUTO en m, fuerza, energía con el residuo NUEVO);
//   - divergencia tras DOS subidas seguidas de |gi| o ‖R‖/‖F‖ > 250;
//   - escalera SRM: paso 0.90, relajación /2 (máx 3), tope 0.99, SRF EXACTO (sin round).
import { BandMatrix, bandAdd, bandClear, bandCreate, bandFactor, bandSolve, reverseCuthillMcKee } from "./band";

export type GeoModel = {
  name?: string;
  X: number[]; Y: number[];
  ELE: number[][];          // T6: 3 esquinas CCW + 3 medios (0-based)
  EMAT: number[];           // 1-based
  FIXED: number[];          // gdl fijos (2*nudo, 2*nudo+1)
  Fg: number[]; Fs: number[]; Fa: number[];
  MAT: number[][];          // [E nu phi c gamma psi]
  recomputeGravity?: boolean;   // true = Fg = gravedad recalculada de MAT[:,4] (sliders de γ)
  loads?: Record<string, number[]>;   // vectores de carga con nombre (del mallador: L1, L2, …)
  MATNAMES?: string[];       // nombres de los suelos (rótulos del visor)
  stages: { name: string; loads: string[]; geo5?: number }[];
};

export type StageResult = {
  name: string;
  fs: number;
  geo5?: number;
  u: Float64Array;          // último peldaño convergido
  uel: Float64Array;        // u ELÁSTICA (la referencia que resta GEO5: u(FS) − u_el)
  steps: { srf: number; u: Float64Array }[];
  prog: string;
  seconds: number;
  // estado de TENSIÓN (SRF=1, la «stress analysis» de GEO5): u, σ por punto de Gauss (xx yy zz xy), ε total, ε plástica acumulada
  u1?: Float64Array; sig1?: Float64Array; eps1?: Float64Array; epl1?: Float64Array; ngp?: number;
};

export type Log = (line: string) => void;

// ---- cuadratura de 7 puntos (Hammer grado 5) ----
const c7 = 0.1012865073235, C7 = 0.7974269853531, e7 = 0.4701420641051, E7 = 0.0597158717898;
const GP = [[1 / 3, 1 / 3], [c7, c7], [C7, c7], [c7, C7], [e7, e7], [E7, e7], [e7, E7]];
const GW = [0.225 / 2, 0.1259391805448 / 2, 0.1259391805448 / 2, 0.1259391805448 / 2, 0.1323941527885 / 2, 0.1323941527885 / 2, 0.1323941527885 / 2];
const NG = 7;

function t6(L1: number, L2: number): [number[], number[], number[]] {
  const L3 = 1 - L1 - L2;
  return [
    [L1 * (2 * L1 - 1), L2 * (2 * L2 - 1), L3 * (2 * L3 - 1), 4 * L1 * L2, 4 * L2 * L3, 4 * L3 * L1],
    [4 * L1 - 1, 0, -(4 * L3 - 1), 4 * L2, -4 * L2, 4 * L3 - 4 * L1],
    [0, 4 * L2 - 1, -(4 * L3 - 1), 4 * L1, 4 * L3 - 4 * L2, -4 * L1],
  ];
}

const ONE = [1, 1, 1, 0];

function norm(v: Float64Array): number { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; return Math.sqrt(s); }
function dot(a: Float64Array, b: Float64Array): number { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
const f4 = (x: number) => x.toFixed(4);
const e5 = (x: number) => x.toExponential(5);
const e4 = (x: number) => x.toExponential(4);
const pad2 = (n: number) => (n < 10 ? " " + n : "" + n);
const pad02 = (n: number) => (n < 10 ? "0" + n : "" + n);

export class GeoFem {
  readonly nn: number; readonly ne: number; readonly ndof: number;
  readonly X: number[]; readonly Y: number[]; readonly ELE: number[][]; readonly EMAT: number[]; MAT: number[][];
  readonly free: Int32Array; readonly nfree: number; readonly map: Int32Array;   // gdl -> índice libre (banda) o -1
  readonly D4: Float64Array[] = [];        // por material (índice 1..): 4x4 plano
  readonly Bc: Float64Array;               // (e*NG+q)*36 : B 3x12
  readonly dJw: Float64Array;              // e*NG+q
  readonly edof: Int32Array;               // e*12
  readonly band: number;
  readonly Kel: BandMatrix;                // elástica factorizada (respaldo)
  readonly Kt: BandMatrix;
  // estado por punto de Gauss
  readonly SIG: Float64Array;              // (e*NG+q)*4
  readonly DEP: Float64Array;              // (e*NG+q)*16
  readonly hasDep: Uint8Array;
  log: Log;
  readonly Fg2check: { sFg: number; sFg2: number; dmax: number };
  readonly Fg2: Float64Array;              // gravedad recalculada (N·ρ·detJ·w)

  constructor(m: GeoModel, log: Log = () => {}) {
    this.log = log;
    this.X = m.X; this.Y = m.Y; this.ELE = m.ELE; this.EMAT = m.EMAT; this.MAT = m.MAT;
    const nn = (this.nn = m.X.length), ne = (this.ne = m.ELE.length), ndof = (this.ndof = 2 * nn);
    const fixed = new Uint8Array(ndof); for (const d of m.FIXED) fixed[d] = 1;
    // renumeración RCM para la banda
    const perm = reverseCuthillMcKee(nn, m.ELE);
    const order: number[] = [];                       // gdl libres en orden RCM
    const byPos = new Int32Array(nn); for (let i = 0; i < nn; i++) byPos[perm[i]] = i;
    for (let p = 0; p < nn; p++) { const i = byPos[p]; if (!fixed[2 * i]) order.push(2 * i); if (!fixed[2 * i + 1]) order.push(2 * i + 1); }
    this.free = Int32Array.from(order); this.nfree = order.length;
    this.map = new Int32Array(ndof).fill(-1); for (let k = 0; k < order.length; k++) this.map[order[k]] = k;
    let n1 = 0, n2 = 0; for (let e = 0; e < ne; e++) if (m.EMAT[e] === 1) n1++; else n2++;
    log(`MALLA GEO5: ${nn} nodos, ${ne} T6 (SOIL_1=${n1}, SOIL_2=${n2}), ${m.FIXED.length} gdl fijos`);
    for (let mm = 0; mm < 2; mm++) {
      const M = m.MAT[mm];
      log(`MAT SOIL_${mm + 1}: E=${M[0].toFixed(0)} nu=${M[1].toFixed(2)} phi=${M[2].toFixed(2)} c=${M[3].toFixed(2)} gamma=${M[4].toFixed(1)} psi=${M[5].toFixed(1)}`);
    }
    // constitutivo elástico (4 comp: xx yy zz xy)
    for (let mm = 0; mm < m.MAT.length; mm++) {
      const E = m.MAT[mm][0], nu = m.MAT[mm][1], f = E / ((1 + nu) * (1 - 2 * nu));
      const D = new Float64Array(16);
      D[0] = f * (1 - nu); D[1] = f * nu; D[2] = f * nu;
      D[4] = f * nu; D[5] = f * (1 - nu); D[6] = f * nu;
      D[8] = f * nu; D[9] = f * nu; D[10] = f * (1 - nu);
      D[15] = f * (1 - 2 * nu) / 2;
      this.D4[mm + 1] = D;
    }
    // B, det(J)·w, gdl por elemento y gravedad recalculada (comprobación de la fixture)
    this.Bc = new Float64Array(ne * NG * 36); this.dJw = new Float64Array(ne * NG); this.edof = new Int32Array(ne * 12);
    const Fg2 = new Float64Array(ndof);
    let band = 0;
    for (let e = 0; e < ne; e++) {
      const nd = m.ELE[e];
      const xs = nd.map((i) => m.X[i]), ys = nd.map((i) => m.Y[i]);
      for (let a = 0; a < 6; a++) { this.edof[e * 12 + 2 * a] = 2 * nd[a]; this.edof[e * 12 + 2 * a + 1] = 2 * nd[a] + 1; }
      for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) {
        const ia = this.map[this.edof[e * 12 + a]], ib = this.map[this.edof[e * 12 + b]];
        if (ia >= 0 && ib >= 0 && Math.abs(ia - ib) > band) band = Math.abs(ia - ib);
      }
      const rho = -m.MAT[m.EMAT[e] - 1][4];
      for (let q = 0; q < NG; q++) {
        const [N, dL1, dL2] = t6(GP[q][0], GP[q][1]);
        let j11 = 0, j12 = 0, j21 = 0, j22 = 0;
        for (let a = 0; a < 6; a++) { j11 += dL1[a] * xs[a]; j12 += dL1[a] * ys[a]; j21 += dL2[a] * xs[a]; j22 += dL2[a] * ys[a]; }
        const dJ = j11 * j22 - j12 * j21;
        const B = this.Bc.subarray((e * NG + q) * 36, (e * NG + q) * 36 + 36);
        for (let a = 0; a < 6; a++) {
          const dNx = (j22 * dL1[a] - j12 * dL2[a]) / dJ, dNy = (-j21 * dL1[a] + j11 * dL2[a]) / dJ;
          B[0 * 12 + 2 * a] = dNx; B[1 * 12 + 2 * a + 1] = dNy; B[2 * 12 + 2 * a] = dNy; B[2 * 12 + 2 * a + 1] = dNx;
        }
        this.dJw[e * NG + q] = dJ * GW[q];
        for (let a = 0; a < 6; a++) Fg2[2 * nd[a] + 1] += N[a] * rho * dJ * GW[q];
      }
    }
    this.band = band;
    let sFg = 0, sFg2 = 0, sFs = 0, sFax = 0, sFay = 0, dmax = 0;
    for (let i = 0; i < nn; i++) {
      sFg += m.Fg[2 * i + 1]; sFg2 += Fg2[2 * i + 1]; sFs += m.Fs[2 * i + 1]; sFax += m.Fa[2 * i]; sFay += m.Fa[2 * i + 1];
      dmax = Math.max(dmax, Math.abs(Fg2[2 * i] - m.Fg[2 * i]), Math.abs(Fg2[2 * i + 1] - m.Fg[2 * i + 1]));
    }
    this.Fg2check = { sFg, sFg2, dmax };
    this.Fg2 = Fg2;
    log(`cargas: gravedad Fy=${sFg.toFixed(3)} (recalculada ${sFg2.toFixed(3)}, dif max ${dmax.toExponential(2)}) | sobrecarga Fy=${sFs.toFixed(3)} | ancla Fx=${sFax.toFixed(3)} Fy=${sFay.toFixed(3)} kN`);
    // estado
    this.SIG = new Float64Array(ne * NG * 4); this.DEP = new Float64Array(ne * NG * 16); this.hasDep = new Uint8Array(ne * NG);
    this.EPL = new Float64Array(ne * NG * 4);
    this.Dinv = this.D4.map((D) => (D ? inv4(D) : D));
    // K elástica (respaldo si la tangente sale singular)
    this.Kel = bandCreate(this.nfree, band); this.Kt = bandCreate(this.nfree, band);
    this.assembleK(this.Kel, true);
    if (!bandFactor(this.Kel)) throw new Error("K elástica singular");
  }

  /** K en banda: elástica (De) o tangente (DEP del último retorno; De donde no hubo retorno). */
  private assembleK(K: BandMatrix, elastic: boolean): void {
    bandClear(K);
    const Ke = new Float64Array(144);
    const DB = new Float64Array(36);   // 3x12 = Dm·B
    for (let e = 0; e < this.ne; e++) {
      const De = this.D4[this.EMAT[e]];
      Ke.fill(0);
      for (let q = 0; q < NG; q++) {
        const kk = e * NG + q;
        const B = this.Bc.subarray(kk * 36, kk * 36 + 36);
        const D = !elastic && this.hasDep[kk] ? this.DEP.subarray(kk * 16, kk * 16 + 16) : De;
        // Dm = D[[0,1,3],[0,1,3]]
        const d00 = D[0], d01 = D[1], d03 = D[3], d10 = D[4], d11 = D[5], d13 = D[7], d30 = D[12], d31 = D[13], d33 = D[15];
        const w = this.dJw[kk];
        for (let c = 0; c < 12; c++) {
          const b0 = B[c], b1 = B[12 + c], b2 = B[24 + c];
          DB[c] = (d00 * b0 + d01 * b1 + d03 * b2) * w;
          DB[12 + c] = (d10 * b0 + d11 * b1 + d13 * b2) * w;
          DB[24 + c] = (d30 * b0 + d31 * b1 + d33 * b2) * w;
        }
        for (let r = 0; r < 12; r++) {
          const br0 = B[r], br1 = B[12 + r], br2 = B[24 + r];
          for (let c = 0; c < 12; c++) Ke[r * 12 + c] += br0 * DB[c] + br1 * DB[12 + c] + br2 * DB[24 + c];
        }
      }
      for (let r = 0; r < 12; r++) {
        const ir = this.map[this.edof[e * 12 + r]]; if (ir < 0) continue;
        for (let c = 0; c < 12; c++) { const ic = this.map[this.edof[e * 12 + c]]; if (ic >= 0) bandAdd(K, ir, ic, Ke[r * 12 + c]); }
      }
    }
  }

  private dpAb(phi: number, c: number): [number, number] {
    const s = Math.sin(phi), co = Math.cos(phi), r3 = Math.sqrt(3);
    return [2 * s / (r3 * (3 + s)), 6 * c * co / (r3 * (3 + s))];
  }

  /** Return-map D-P de GEO5 desde sigN + De·deps, y tangente algorítmica (en outDep, 16) si wantK.
   *  Devuelve true si escribió una tangente distinta de De. */
  private dpReturn(deps: Float64Array, al: number, k: number, De: Float64Array, wantK: boolean, sigN: Float64Array | null, sig: Float64Array, outDep: Float64Array): boolean {
    const G = De[15], K = (De[0] + 2 * De[1]) / 3;
    for (let i = 0; i < 4; i++) { let s = 0; for (let j = 0; j < 4; j++) s += De[i * 4 + j] * deps[j]; sig[i] = s + (sigN ? sigN[i] : 0); }
    const I1 = sig[0] + sig[1] + sig[2], sm = I1 / 3;
    const s0 = sig[0] - sm, s1 = sig[1] - sm, s2 = sig[2] - sm, s3 = sig[3];
    const J = Math.sqrt(Math.max(0.5 * (s0 * s0 + s1 * s1 + s2 * s2) + s3 * s3, 0));
    const f = J + al * I1 - k;
    if (f <= 1e-12) return false;
    const apexP = al > 1e-12 ? k / (3 * al) : 1e300;
    if (sm < apexP && J > 1e-12) {
      const lam = f / G, Jn = J - G * lam;
      if (Jn >= 1e-12) {
        const beta = Jn / J;
        sig[0] = sm + beta * s0; sig[1] = sm + beta * s1; sig[2] = sm + beta * s2; sig[3] = beta * s3;
        if (!wantK) return false;
        const p = (sig[0] + sig[1] + sig[2]) / 3;
        const dv = [sig[0] - p, sig[1] - p, sig[2] - p, sig[3]];
        const sj = Math.sqrt(Math.max(0.5 * (dv[0] * dv[0] + dv[1] * dv[1] + dv[2] * dv[2]) + dv[3] * dv[3], 0));
        if (sj < 1e-12) { for (let i = 0; i < 16; i++) outDep[i] = 1e-3 * De[i]; return true; }
        const w = [dv[0] / (2 * sj), dv[1] / (2 * sj), dv[2] / (2 * sj), 2 * dv[3] / (2 * sj)];
        const n = [w[0] + al, w[1] + al, w[2] + al, w[3]];
        const mv = w;
        // Xi = K·1⊗1 + beta·2G·Pdev ; Xi[3,3] = beta·G  (Pdev = I − 1⊗1/3)
        const Xi = new Float64Array(16);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
          const one = ONE[i] * ONE[j];
          const pdev = (i === j ? 1 : 0) - one / 3;
          Xi[i * 4 + j] = K * one + beta * 2 * G * pdev;
        }
        Xi[15] = beta * G;
        const Xm = [0, 0, 0, 0], nXi = [0, 0, 0, 0];
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { Xm[i] += Xi[i * 4 + j] * mv[j]; nXi[j] += n[i] * Xi[i * 4 + j]; }
        let den = 0; for (let i = 0; i < 4; i++) den += n[i] * Xm[i];
        if (Math.abs(den) > 1e-30) for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) outDep[i * 4 + j] = Xi[i * 4 + j] - Xm[i] * nXi[j] / den;
        else outDep.set(Xi);
        return true;
      }
    }
    sig[0] = apexP; sig[1] = apexP; sig[2] = apexP; sig[3] = 0;
    return false;
  }

  private resetState(): void { this.SIG.fill(0); this.hasDep.fill(0); this.EPL.fill(0); }
  private EPL!: Float64Array; private Dinv!: Float64Array[];

  /** Fuerzas internas con σ = retorno(SIG + De·B·du). Si commit: guarda σ y la tangente del retorno. */
  private assembleInc(du: Float64Array, ab: [number, number][], commit: boolean, Fi: Float64Array): void {
    Fi.fill(0);
    const ue = new Float64Array(12), deps = new Float64Array(4), sig = new Float64Array(4), Dep = new Float64Array(16);
    for (let e = 0; e < this.ne; e++) {
      const mm = this.EMAT[e], De = this.D4[mm], al = ab[mm][0], k = ab[mm][1];
      for (let a = 0; a < 12; a++) ue[a] = du[this.edof[e * 12 + a]];
      for (let q = 0; q < NG; q++) {
        const kk = e * NG + q;
        const B = this.Bc.subarray(kk * 36, kk * 36 + 36);
        let e0 = 0, e1 = 0, e2 = 0;
        for (let c = 0; c < 12; c++) { e0 += B[c] * ue[c]; e1 += B[12 + c] * ue[c]; e2 += B[24 + c] * ue[c]; }
        deps[0] = e0; deps[1] = e1; deps[2] = 0; deps[3] = e2;
        const sigN = this.SIG.subarray(kk * 4, kk * 4 + 4);
        const got = this.dpReturn(deps, al, k, De, commit, sigN, sig, Dep);
        const w = this.dJw[kk];
        const t0 = sig[0] * w, t1 = sig[1] * w, t3 = sig[3] * w;
        for (let c = 0; c < 12; c++) Fi[this.edof[e * 12 + c]] += B[c] * t0 + B[12 + c] * t1 + B[24 + c] * t3;
        if (commit) {
          if (got) {   // deformación plástica acumulada: Δε_pl = Δε − Dinv·Δσ
            const Di = this.Dinv[mm]; const ds = [sig[0] - sigN[0], sig[1] - sigN[1], sig[2] - sigN[2], sig[3] - sigN[3]];
            for (let i = 0; i < 4; i++) { let eel = 0; for (let j = 0; j < 4; j++) eel += Di[i * 4 + j] * ds[j]; this.EPL[kk * 4 + i] += deps[i] - eel; }
          }
          sigN.set(sig);
          if (got) { this.DEP.set(Dep, kk * 16); this.hasDep[kk] = 1; } else this.hasDep[kk] = 0;
        }
      }
    }
  }

  /** Un peldaño de la escalera (Newton completo con line-search). Devuelve [conv, u, it]. */
  private nrstep(SRF: number, Fext: Float64Array, rstep: number, trace?: { u: Float64Array }[]): [boolean, Float64Array, number] {
    const maxit = 100;
    const ab: [number, number][] = [];
    for (let mm = 0; mm < this.MAT.length; mm++) {   // TODOS los suelos (antes tope 2: con 3+ suelos leía fuera del arreglo)
      const phi = Math.atan(Math.tan(this.MAT[mm][2] * Math.PI / 180) / SRF), c = this.MAT[mm][3] / SRF;
      ab[mm + 1] = this.dpAb(phi, c);
    }
    const ndof = this.ndof, nf = this.nfree, free = this.free;
    const u = new Float64Array(ndof), du = new Float64Array(ndof), Fi = new Float64Array(ndof), F1 = new Float64Array(ndof);
    const Rf = new Float64Array(nf), R1 = new Float64Array(nf), duf = new Float64Array(nf), drf = new Float64Array(nf);
    const ADDisp = new Float64Array(nf), DForce = new Float64Array(nf);
    let conv = false, it = 0;
    this.resetState();
    this.assembleInc(du, ab, false, Fi);
    for (let k = 0; k < nf; k++) Rf[k] = Fext[free[k]] - Fi[free[k]];
    DForce.set(Rf);
    let rPrev = 1e300, ndiv = 0;
    for (it = 1; it <= maxit; it++) {
      if (!Number.isFinite(norm(Rf))) break;
      this.assembleK(this.Kt, false);
      let ok = bandFactor(this.Kt);
      if (ok) { bandSolve(this.Kt, Rf, duf); if (!Number.isFinite(norm(duf))) ok = false; }
      if (!ok) bandSolve(this.Kel, Rf, duf);
      du.fill(0); for (let k = 0; k < nf; k++) du[free[k]] = duf[k];
      const s0 = dot(duf, Rf), n0 = norm(Rf);
      let al = 1.0;
      this.assembleInc(du, ab, false, F1);                       // retorno de PRUEBA desde el estado
      for (let k = 0; k < nf; k++) R1[k] = Fext[free[k]] - F1[free[k]];
      const s1 = dot(duf, R1), n1 = norm(R1), den = s0 - s1;
      if (n0 > 1e-10 && n1 > 1e-10 && Math.abs(den) > 1e-10 && n1 / n0 >= 0.8) al = al * s0 / den;
      if (al < 0.1) al = 0.1; else if (al >= 1.0) al = 1.0;
      for (let k = 0; k < nf; k++) drf[k] = al * duf[k];
      for (let d = 0; d < ndof; d++) { du[d] *= al; u[d] += du[d]; }
      this.assembleInc(du, ab, true, Fi);                        // COMMIT: σ_i y tangente
      for (let k = 0; k < nf; k++) Rf[k] = Fext[free[k]] - Fi[free[k]];
      if (trace) trace.push({ u: Float64Array.from(u) });
      for (let k = 0; k < nf; k++) ADDisp[k] += drf[k];
      const nDD = norm(drf), dA = norm(ADDisp), nDL = norm(Rf), dF = norm(DForce);
      const nEN = Math.sqrt(Math.abs(dot(drf, Rf))), dE = Math.sqrt(Math.abs(dot(ADDisp, DForce)));
      const eu = dA > 1 ? nDD / dA : nDD, ef = dF > 1 ? nDL / dF : nDL, ee = dE > 1 ? nEN / dE : nEN;
      let dxmax = 0; for (let i = 0; i < this.nn; i++) dxmax = Math.max(dxmax, Math.abs(u[2 * i]));
      this.log(`  RS=${rstep} SRF=${f4(SRF)} it=${pad2(it)} eta=${f4(al)} DNorm=${e5(eu)} OBFNorm=${e5(ef)} ENorm=${e5(ee)} |gi|=${e4(nDL)} dx=${(dxmax * 1e3).toFixed(1)}`);
      if (ef < 1e-2 && ee < 1e-2 && eu < 1e-2) { conv = true; break; }
      if (ef > 250) break;
      if (nDL <= rPrev || ef <= 1e-2) ndiv = 0; else ndiv++;
      rPrev = nDL;
      if (ndiv >= 2) break;
    }
    return [conv, u, it];
  }

  /** Escalera SRM de GEO5 para una etapa (carga total Ftot). */
  private srm(Ftot: Float64Array): { fs: number; prog: string; ulo: Float64Array; uel: Float64Array; steps: { srf: number; u: Float64Array }[]; u1: Float64Array; sig1: Float64Array; epl1: Float64Array; eps1: Float64Array } {
    const RED0 = 0.9, RELAX = 2, MINSTEP = 0.99, MAXRELAX = 3;
    let Racc = 1, fs = 1, nrelax = 0, rs = 0, prog = "";
    let ulo: Float64Array = new Float64Array(this.ndof);
    const steps: { srf: number; u: Float64Array }[] = [];
    const [c0, u1, n0] = this.nrstep(1.0, Ftot, 0);
    // instantánea del estado de tensión (SRF=1) para los campos del visor
    const sig1 = Float64Array.from(this.SIG), epl1 = Float64Array.from(this.EPL), eps1 = new Float64Array(this.ne * NG * 4);
    for (let e = 0; e < this.ne; e++) for (let q = 0; q < NG; q++) {
      const kk = e * NG + q, B = this.Bc.subarray(kk * 36, kk * 36 + 36); let e0 = 0, e1 = 0, e2 = 0;
      for (let c = 0; c < 12; c++) { const v = u1[this.edof[e * 12 + c]]; e0 += B[c] * v; e1 += B[12 + c] * v; e2 += B[24 + c] * v; }
      eps1[kk * 4] = e0; eps1[kk * 4 + 1] = e1; eps1[kk * 4 + 3] = e2;
    }
    // u ELÁSTICA = K_el⁻¹ F: la referencia que GEO5 resta (u(FS) − u_el), MEDIDO 2026-09-03
    const rhs = new Float64Array(this.nfree), x = new Float64Array(this.nfree);
    for (let k = 0; k < this.nfree; k++) rhs[k] = Ftot[this.free[k]];
    bandSolve(this.Kel, rhs, x);
    const uel = new Float64Array(this.ndof); for (let k = 0; k < this.nfree; k++) uel[this.free[k]] = x[k];
    this.log(`    SRM rs00 paso=1.0000 SRF=1.0000 ${c0 ? "CONVERGE" : "DIVERGE"} it=${n0}`);
    for (;;) {
      const s = 1 - (1 - RED0) / Math.pow(RELAX, nrelax);
      if (s > MINSTEP) break;
      const trial = 1 / (Racc * s);                            // SRF EXACTO (GEO5 no redondea)
      if (trial > 3) break;
      rs++;
      const [conv, u, nit] = this.nrstep(trial, Ftot, rs);
      if (conv && Number.isFinite(norm(u))) {
        Racc *= s; fs = trial; ulo = u; steps.push({ srf: trial, u });
        let dxmax = 0; for (let i = 0; i < this.nn; i++) dxmax = Math.max(dxmax, Math.abs(u[2 * i]));
        prog += ` ${trial.toFixed(3)}:${(dxmax * 1e3).toFixed(0)}`;
        this.log(`    SRM rs${pad02(rs)} paso=${f4(s)} SRF=${f4(trial)} CONVERGE it=${nit}`);
      } else {
        nrelax++;
        this.log(`    SRM rs${pad02(rs)} paso=${f4(s)} SRF=${f4(trial)} DIVERGE relax=${nrelax}`);
        if (nrelax > MAXRELAX) break;
      }
    }
    return { fs, prog, ulo, uel, steps, u1, sig1, epl1, eps1 };
  }

  setLog(log: Log): void { this.log = log; }

  /** Corre las etapas pedidas del modelo (cada una independiente: cargas según `stages[i].loads`).
   *  φ y c se leen de m.MAT en cada corrida (sliders); E, ν y γ requieren un GeoFem nuevo. */
  run(m: GeoModel, stageIdx: number[] = m.stages.map((_, i) => i), onStage?: (r: StageResult, index: number) => void): StageResult[] {
    const t0 = performance.now();
    this.MAT = m.MAT;
    const results: StageResult[] = [];
    // Con sliders de γ la gravedad de la fixture ya no vale: se usa la recalculada (N·ρ·detJ·w por
    // punto de Gauss, la misma cuenta que comprueba la fixture en el constructor).
    const LOADS: Record<string, number[] | Float64Array> = { ...(m.loads || {}), Fg: m.recomputeGravity ? this.Fg2 : m.Fg, Fs: m.Fs, Fa: m.Fa };
    for (const si of stageIdx) {
      const st = m.stages[si];
      const F = new Float64Array(this.ndof);
      for (const nm of st.loads) { const v = LOADS[nm]; if (!v) throw new Error(`carga desconocida ${nm}`); for (let d = 0; d < this.ndof; d++) F[d] += v[d]; }
      const ts = performance.now();
      this.log(""); this.log(`### ${st.name} ###`);
      const r = this.srm(F);
      const sec = (performance.now() - ts) / 1000;
      this.log(`    progresion dx(mm) por SRF:${r.prog}`);
      this.log(`  ${st.name.padEnd(22)} >>> FS=${f4(r.fs)}  ${st.geo5 ? `(GEO5=${st.geo5.toFixed(2)})` : "(sin referencia GEO5)"}  [${sec.toFixed(1)} s]`);
      const res: StageResult = { name: st.name, fs: r.fs, geo5: st.geo5, u: r.ulo, uel: r.uel, steps: r.steps, prog: r.prog, seconds: sec, u1: r.u1, sig1: r.sig1, epl1: r.epl1, eps1: r.eps1, ngp: this.ne * NG };
      results.push(res); onStage?.(res, si);
    }
    this.log(""); this.log("================ RESUMEN (Hekatan Geotechnic · TS) ================");
    for (const r of results) this.log(`  ${r.name.padEnd(22)} FS=${f4(r.fs)}  ${r.geo5 ? `(GEO5 ${r.geo5.toFixed(2)})  dif=${(100 * (r.fs / r.geo5 - 1)) >= 0 ? "+" : ""}${(100 * (r.fs / r.geo5 - 1)).toFixed(1)}%` : "(sin referencia GEO5)"}  t=${r.seconds.toFixed(1)} s`);
    this.log(`TOTAL ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    return results;
  }
}

/** inversa 4x4 (Gauss-Jordan con pivote parcial), para Dinv = De⁻¹ */
function inv4(D: Float64Array): Float64Array {
  const A = Array.from({ length: 4 }, (_, i) => Array.from({ length: 8 }, (_, j) => (j < 4 ? D[i * 4 + j] : i === j - 4 ? 1 : 0)));
  for (let c = 0; c < 4; c++) {
    let piv = c; for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c]; for (let j = 0; j < 8; j++) A[c][j] /= d;
    for (let r = 0; r < 4; r++) if (r !== c) { const f = A[r][c]; for (let j = 0; j < 8; j++) A[r][j] -= f * A[c][j]; }
  }
  const out = new Float64Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out[i * 4 + j] = A[i][4 + j];
  return out;
}
