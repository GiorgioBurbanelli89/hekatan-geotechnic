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
import { BandMatrix, bandAdd, bandClear, bandCreate, bandFactor, bandMul, bandSolve, reverseCuthillMcKee } from "./band";

import { fgConAgua, extraAguaEtapa } from "./agua";
export type GeoModel = {
  agua?: import("./agua").AguaGWT;   // freático GWT: el peso usa γsat bajo la línea y se suma la presión de poros (ver agua.ts)
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
  MODEL?: number[];          // modelo de suelo por material: 0 = Drucker-Prager (por defecto), 1 = Mohr-Coulomb (Clausen 2007)
  RIGID?: boolean[];         // material RÍGIDO (muro de hormigón = «Rigid body» de GEO5): región elástica, la SRM no lo reduce
  // ATADURAS [gdl esclavo, gdl maestro]: u_esclavo = u_maestro, por ELIMINACIÓN (el esclavo comparte la fila del maestro).
  // Las respetan modes(), dynamic() y la SRM (nrstep/srm: gather/scatter por `map`).
  TIES?: number[][];
  stages: { name: string; loads: string[]; geo5?: number; active?: number[] }[];   // active: 1/0 por elemento (construcción por etapas)
  srmContinua?: boolean | number;   // modo GEO5 (true = 1; número = bits de geofem_set_srm). SRM de GEO5: cada peldaño desde el estado convergido del anterior (no desde cero)
  staged?: boolean;          // true = CONSTRUCCIÓN POR ETAPAS: análisis de tensiones encadenado (sin SRM); motores TS y WASM
  REGK?: number[];           // región de cada elemento (la que señala `activa/inactiva`)
};

/** Opciones del análisis dinámico LINEAL (Newmark / HHT-α de FRGeoFEM). Unidades kN, m, t, s. */
export type DynOptions = {
  dt: number;                // paso fijo (s)
  tEnd: number;              // duración (s)
  accel: ((t: number) => number) | number[];   // a_g(t) en m/s² (función, o pares [t0,a0,t1,a1,…] como el `history` de GEO5, interpolación lineal)
  dir?: "x" | "y";           // dirección de la aceleración de la base (por defecto x)
  beta?: number; gamma?: number;   // Newmark (por defecto ¼ y ½, aceleración media); con alpha≠0 y sin β,γ: β=(1−α)²/4, γ=(1−2α)/2 (manual GEO5 17.105-17.106)
  // HHT-α ∈ [−⅓, 0] (0 = Newmark). MISMA convención de signo que GEO5 (FRGeoFEM: α = problem+0x448, entra como (1+α),
  // part_002.c:934,1318; manual 17.105-17.106) y que Abaqus (*DYNAMIC, ALPHA=−0.05 → β = 0.275625, γ = 0.55, leído del .dat):
  // M·a₁ + (1+α)(C·v₁ + K·u₁ − F₁) − α(C·v₀ + K·u₀ − F₀) = 0. Validado contra Abaqus con α = −0.05 (tests/dinamico_columna.ts).
  alpha?: number;
  rayleigh?: [number, number];   // C = a·M + b·K elástica (apagado por defecto); actúa sobre la velocidad RELATIVA a la base, como Abaqus con GRAV y base fija
  g?: number;                // ρ = γ/g (por defecto 9.80665)
  watch?: number[];          // nudos cuya historia u_x, u_y se guarda
  // TENSIONES (misma recuperación σ = De·B·u por punto de Gauss que el estático: elasticStress). u es el RELATIVO a la base,
  // así que son las tensiones del INCREMENTO sísmico; las de peso propio se suman aparte (estático lineal).
  stressAt?: number[];       // pasos (0…nst) en los que se guarda σ en todos los puntos de Gauss
  stressEnvelope?: boolean;  // máximo |σ| por componente y punto de Gauss en toda la historia
  onStep?: (s: number, t: number, u: Float64Array, v: Float64Array) => void;   // u y v (velocidad relativa) en gdl COMPLETOS en cada paso
};

export type DynResult = {
  t: Float64Array;
  coef: { b1: number; b2: number; b3: number; b4: number; b5: number; b6: number; beta: number; gamma: number; alpha: number };
  hist: { node: number; ux: Float64Array; uy: Float64Array; ax: Float64Array; ay: Float64Array }[];   // a RELATIVA a la base (la absoluta suma a_g)
  u: Float64Array;           // u relativo (a la base) al final
  umaxAbs: Float64Array;     // envolvente |u| por gdl
  seconds: number;
  stress?: Map<number, Float64Array>;   // paso → σ (ngp·4: xx yy zz xy), de `stressAt`
  stressMax?: Float64Array;             // envolvente max|σ| (ngp·4), de `stressEnvelope`
};

/** Dinámico NO LINEAL con Mohr-Coulomb, réplica de FRGeoFEM 2024 (T6sD). Cada regla está verificada contra el solver de GEO5
 *  corriendo (malla de 8 T6, 2 materiales, 16 pasos a 6 Hz: error relativo 3.9e-7 en u). Ver registros/2026-10-28_geo5_dinamico_captura_inputfile.md. */
export type DynNLOptions = DynOptions & {
  edyn?: number[];          // E dinámico por material (kPa): K, M, retorno y tangente del dinámico lo usan (el estático usa E). Por defecto E
  rho?: number[];           // densidad por material (t/m³); por defecto γ/g
  rayleighMat?: [number, number][];   // [alpha_c, beta_c] por material (como el InputFile de GEO5); si falta se usa `rayleigh` para todos
  sig0?: Float64Array;      // σ inicial por punto de Gauss (ngp·4: xx yy zz xy). Por defecto: gravedad elástica con E estático
  t0?: number;              // tiempo del estado inicial. GEO5 arranca en 1e-6 (su paso 1 es trivial); 0 = uniforme
  tolN?: number; maxit?: number;
  ls?: { tol?: number; etaMin?: number; etaMax?: number; on?: boolean };   // ls_tolerance 0.8, eta_min 0.1, eta_max 1 (InputFile de GEO5)
};
export type DynNLResult = DynResult & { iters: number[]; etas: number[][]; etaMin: Float64Array; sig: Float64Array };   // etaMin[k] = η mínimo del paso k (1 = la búsqueda lineal no actuó)

export type ModesResult = {
  f: number[]; omega: number[];
  phi: Float64Array[];       // formas (gdl completos), normalizadas a M (φᵀMφ = 1)
  mefx: number[]; mefy: number[];   // masa efectiva con la fila COMPLETA de M·1 (incluye el acoplamiento con los apoyos, como Abaqus)
  massTotal: number;         // Σ ρ·área (todos los nudos, también los fijos)
  iterations: number;
};

export type StageResult = {
  name: string;
  fs: number;
  alcanzada?: number;       // construcción por etapas: fracción de la carga nueva que llegó al equilibrio (1 = toda)
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
export const GP = [[1 / 3, 1 / 3], [c7, c7], [C7, c7], [c7, C7], [e7, e7], [E7, e7], [e7, E7]];
export const GW = [0.225 / 2, 0.1259391805448 / 2, 0.1259391805448 / 2, 0.1259391805448 / 2, 0.1323941527885 / 2, 0.1323941527885 / 2, 0.1323941527885 / 2];
const NG = 7;
export const RIGID_E = 1e9, RIGID_NU = 0.2;   // «rigidbody» de GEO5: elástico E = Eur = 1e9 kPa, ν = 0.2 (Geo5Solver_decomp.c:73262)
/** Bits del modo SRM a partir de srmContinua (true = GEO5_SRM). */
export function srmBits(f: boolean | number | undefined): number { return f === true ? GEO5_SRM : typeof f === "number" ? f : 0; }
export const GEO5_SRM = 3;    // bits de la SRM en modo GEO5 (ver setSrm / geofem_set_srm). Antes 19: el bit 16 (porPaso) NO es lo que hace GEO5 (Tanda 4-5)

export function t6(L1: number, L2: number): [number[], number[], number[]] {
  const L3 = 1 - L1 - L2;
  return [
    [L1 * (2 * L1 - 1), L2 * (2 * L2 - 1), L3 * (2 * L3 - 1), 4 * L1 * L2, 4 * L2 * L3, 4 * L3 * L1],
    [4 * L1 - 1, 0, -(4 * L3 - 1), 4 * L2, -4 * L2, 4 * L3 - 4 * L1],
    [0, 4 * L2 - 1, -(4 * L3 - 1), 4 * L1, 4 * L3 - 4 * L2, -4 * L1],
  ];
}

const ONE = [1, 1, 1, 0];
const NSH = GP.map(([a, b]) => t6(a, b)[0]);     // funciones de forma en los 7 puntos (masa consistente)

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
  // CONSTRUCCIÓN POR ETAPAS (Activity de GEO5), igual que geofem.cpp: elemento activo o no; los gdl de nudos sin
  // ningún elemento activo quedan «dormidos» (muelle 1e12). Utot: u desde la etapa 1; EPSacc: ε solo mientras activo.
  private act: Uint8Array; private dormido: Uint8Array; private prevAct: Uint8Array | null = null;
  private Utot!: Float64Array; private EPSacc!: Float64Array; private Flast!: Float64Array;
  alcanzada = 1;   // fracción de la carga NUEVA de la etapa que llegó al equilibrio (GEO5: «Attained loading»)

  constructor(m: GeoModel, log: Log = () => {}) {
    this.log = log;
    this.X = m.X; this.Y = m.Y; this.ELE = m.ELE; this.EMAT = m.EMAT; this.MAT = m.MAT;
    this.model = m.MODEL ?? []; this.setSrm(m.srmContinua);
    this.rigid = m.RIGID ?? (m.MATNAMES ?? []).map((n) => /muro|hormig|concret|wall/i.test(n));   // Rigid body: región elástica que la SRM no reduce
    const nn = (this.nn = m.X.length), ne = (this.ne = m.ELE.length), ndof = (this.ndof = 2 * nn);
    const fixed = new Uint8Array(ndof); for (const d of m.FIXED) fixed[d] = 1;
    const slave = new Uint8Array(ndof); for (const [s] of m.TIES ?? []) slave[s] = 1;   // atadura: el esclavo no tiene fila propia
    // renumeración RCM para la banda
    const perm = reverseCuthillMcKee(nn, m.ELE);
    const order: number[] = [];                       // gdl libres en orden RCM
    const byPos = new Int32Array(nn); for (let i = 0; i < nn; i++) byPos[perm[i]] = i;
    for (let p = 0; p < nn; p++) { const i = byPos[p]; for (const d of [2 * i, 2 * i + 1]) if (!fixed[d] && !slave[d]) order.push(d); }
    this.free = Int32Array.from(order); this.nfree = order.length;
    this.map = new Int32Array(ndof).fill(-1); for (let k = 0; k < order.length; k++) this.map[order[k]] = k;
    for (const [s, ms] of m.TIES ?? []) {
      if (fixed[s] || this.map[ms] < 0) throw new Error(`atadura ${s}→${ms}: el esclavo no puede estar fijo y el maestro tiene que ser libre`);
      this.map[s] = this.map[ms];
    }
    let n1 = 0, n2 = 0; for (let e = 0; e < ne; e++) if (m.EMAT[e] === 1) n1++; else n2++;
    log(`MALLA GEO5: ${nn} nodos, ${ne} T6 (SOIL_1=${n1}, SOIL_2=${n2}), ${m.FIXED.length} gdl fijos`);
    for (let mm = 0; mm < m.MAT.length; mm++) {
      const M = m.MAT[mm], nm = m.MATNAMES?.[mm] ?? `SOIL_${mm + 1}`;
      log(`MAT ${nm}: E=${M[0].toFixed(0)} nu=${M[1].toFixed(2)} phi=${M[2].toFixed(2)} c=${M[3].toFixed(2)} gamma=${M[4].toFixed(1)} psi=${M[5].toFixed(1)}${this.rigid[mm] ? "  [RÍGIDO: región elástica, sin reducción SRM]" : ""}`);
    }
    // constitutivo elástico (4 comp: xx yy zz xy)
    for (let mm = 0; mm < m.MAT.length; mm++) {
      const rg = this.modoG5 && this.rigid[mm];   // rigidbody de GEO5 (E 1e9, ν 0.2) SOLO en el modo GEO5 del muro (bit 32), como geofemWasm.ts
      const E = rg ? RIGID_E : m.MAT[mm][0], nu = rg ? RIGID_NU : m.MAT[mm][1], f = E / ((1 + nu) * (1 - 2 * nu));
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
    this.act = new Uint8Array(ne).fill(1); this.dormido = new Uint8Array(ndof);
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
      if (!this.act[e]) continue;
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
    for (let d = 0; d < this.ndof; d++) if (this.dormido[d] && this.map[d] >= 0) bandAdd(K, this.map[d], this.map[d], 1e12);
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
  private rigid: boolean[] = [];   // material rígido (muro): la SRM no le reduce c ni φ
  private model: number[] = [];    // 1 = Mohr-Coulomb en ese material
  private srmContinua = false;      // SRM de GEO5: peldaños encadenados + tensiones en pasos de 0.1
  private lsMax = 1;                // pasadas de la búsqueda lineal (GEO5 max_ls_iterations)
  private soloTangente = false; private tangIni = false; private energiaPrev = false; private porPaso = false;
  // MODO GEO5 DEL MURO (bit 32, como geofem.cpp; Tanda 12): ALoad = F_int de SRF 1 y u0 = η·Δu de la última it del último peldaño convergido
  private depFase: Float64Array | null = null; private hasFase: Uint8Array | null = null;   // tangente al acabar la fase anterior (modo GEO5)
  private modoG5 = false; private soloFint = false; private lastRaw: Float64Array | null = null; private lastEta = 1; private u0ext: Float64Array | null = null; private ALoadV: Float64Array | null = null;
  private desempateZ = false;   // bit 64: principal del plano = σz (|Δ| ≤ 1e-14·max|σ|) → σz delante (medido, no del binario)
  private static gDesempateZ = false;
  private static empateZ(v: number[], ix: number[]): void {
    const m = Math.max(Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])), tol = 1e-14 * m;
    for (let k = 0; k < 2; k++) if (ix[k + 1] === 2 && Math.abs(v[ix[k]] - v[ix[k + 1]]) <= tol) { const t = ix[k]; ix[k] = ix[k + 1]; ix[k + 1] = t; }
  }
  /** Modo GEO5 de la SRM, los mismos bits que geofem_set_srm: 1 peldaños encadenados, 2 tangente del SRF nuevo al
   *  empezar el peldaño, 4 line search de 3 pasadas, 8 energía con el residuo previo, 16 retorno desde el inicio del paso.
   *  true = GEO5_SRM = 3 (antes 19; el bit 16 no es lo que hace GEO5: Tanda 4-5 de registros/2026-11-01_geo5_mapas_vs_geotechnic.md). */
  private setSrm(f: boolean | number | undefined): void {
    const b = srmBits(f);
    this.srmContinua = (b & 1) !== 0; this.tangIni = (b & 2) !== 0; this.lsMax = b & 4 ? 3 : 1; this.energiaPrev = (b & 8) !== 0; this.porPaso = (b & 16) !== 0;
    this.modoG5 = (b & 32) !== 0; this.desempateZ = (b & 64) !== 0;
  }
  private mcp: [number, number, number][] = [];   // (φ, c, ψ) reducidos por la SRF del peldaño (índice 1..)

  // ---- MOHR-COULOMB: el mismo retorno de Clausen que geofem.cpp (portado de mc_stress.m). Tracción positiva.
  private static fmc(s: number[], sp: number, cc: number): number { return 0.5 * (s[0] - s[2]) + 0.5 * (s[0] + s[2]) * sp - cc; }
  // admisibilidad de GEO5 (FUN_005a67e0): F1, F2, F3 <= tol sobre los valores SIN reordenar; no se exige σ1 >= σ2 >= σ3 (ver geofem.cpp)
  private static mcValido(s: number[], sp: number, cc: number, tol: number): boolean {
    const f2 = 0.5 * (s[1] - s[2]) + 0.5 * (s[1] + s[2]) * sp - cc, f3 = 0.5 * (s[0] - s[1]) + 0.5 * (s[0] + s[1]) * sp - cc;
    return GeoFem.fmc(s, sp, cc) <= tol && f2 <= tol && f3 <= tol;
  }
  static ysTol = 0.001;   // ys_tolerance de GEO5 (kPa, ABSOLUTA)
  // tangente con las principales de la σ DEVUELTA (FUN_005a8680), no de la de prueba
  private static mcPrincDevuelta(sig: ArrayLike<number>, inf: { t2: number; ix: number[]; reg: number }): void {
    if (GeoFem.gEmpateXY) { GeoFem.princInvariantG5(sig, inf); return; }
    const c_ = (sig[0] + sig[1]) / 2, R_ = Math.sqrt((sig[0] - sig[1]) * (sig[0] - sig[1]) / 4 + sig[3] * sig[3]);
    const pv = [c_ + R_, c_ - R_, sig[2]], ix = [0, 1, 2]; ix.sort((a, b) => (pv[a] > pv[b] ? -1 : pv[a] < pv[b] ? 1 : 0));
    if (GeoFem.gDesempateZ) GeoFem.empateZ(pv, ix);
    inf.t2 = Math.atan2(2 * sig[3], sig[0] - sig[1]); inf.ix = ix;
  }
  /** MODO GEO5: principales del plano como invariant.cpp de FRGeoFEM 2024 (FUN_005c4750, la llama la tangente MC
   *  FUN_00561b60 con la σ guardada). θ = ½·atan(2τ/(σx−σy)); |τ| < 1e-10 → θ = 0; |σx−σy| < 1e-10 → θ = π/2 (sin ½);
   *  σ1 = σx c² + σy s² + 2cs·τ, σ2 = c²σy + σx s² − 2cs·τ, σ3 = σz con ejes (c,s), (−s,c), z; orden por SELECCIÓN con
   *  intercambio si v[j] > v[i] (no estable). En el empate σx = σy < σz deja z, y, x = los «90°» medidos en la fase 4
   *  (registros/2026-11-02_geo5_residuo_iter1.md). Constantes 1e-10, π/2, ½ leídas en 0x613ea8, 0x6140e8, 0x613ff8. */
  private static princInvariantG5(sig: ArrayLike<number>, inf: { t2: number; ix: number[]; reg: number }): void {
    const sx = sig[0], sy = sig[1], txy = sig[3];
    let th = 0;
    if (Math.abs(txy) >= 1e-10) th = Math.abs(sx - sy) >= 1e-10 ? Math.atan((txy + txy) / (sx - sy)) * 0.5 : Math.PI / 2;
    const c = Math.cos(th), s = Math.sin(th), cc = c * c, ss = s * s, d = (c + c) * s * txy;
    const v0 = [sx * cc + sy * ss + d, cc * sy + sx * ss - d, sig[2]], v = v0.slice(), ix = [0, 1, 2];
    for (let i = 0; i < 3; i++) for (let j = i; j < 3; j++) if (v[j] > v[i]) { const t = v[i]; v[i] = v[j]; v[j] = t; const k = ix[i]; ix[i] = ix[j]; ix[j] = k; }
    if (GeoFem.gDesempateZ) GeoFem.empateZ(v0, ix);
    inf.t2 = 2 * th; inf.ix = ix;
  }
  private static gEmpateXY = false;
  private static mcArista(ss: number[], D: number[][], n1: number[], g1: number[], n2: number[], g2: number[], ccos: number): number[] {
    const Dg1 = [0, 1, 2].map((i) => D[i][0] * g1[0] + D[i][1] * g1[1] + D[i][2] * g1[2]), Dg2 = [0, 1, 2].map((i) => D[i][0] * g2[0] + D[i][1] * g2[1] + D[i][2] * g2[2]);
    const L11 = n1[0] * Dg1[0] + n1[1] * Dg1[1] + n1[2] * Dg1[2], L22 = n2[0] * Dg2[0] + n2[1] * Dg2[1] + n2[2] * Dg2[2];
    const L12 = n1[0] * Dg2[0] + n1[1] * Dg2[1] + n1[2] * Dg2[2], L21 = n2[0] * Dg1[0] + n2[1] * Dg1[1] + n2[2] * Dg1[2];
    const q1 = n1[0] * ss[0] + n1[1] * ss[1] + n1[2] * ss[2] - ccos, q2 = n2[0] * ss[0] + n2[1] * ss[1] + n2[2] * ss[2] - ccos, Om = L11 * L22 - L12 * L21;
    const d1 = (L22 * q1 - L12 * q2) / Om, d2 = (L11 * q2 - L21 * q1) / Om;
    return [0, 1, 2].map((i) => ss[i] - d1 * Dg1[i] - d2 * Dg2[i]);
  }
  private static mcReturn(st: ArrayLike<number>, De: Float64Array, phi: number, psi: number, c: number, out: Float64Array, info?: { t2: number; ix: number[]; reg: number }): number {   // región: 0 elástico, 1 cara, 2 arista, 3 ápice
    const sxx = st[0], syy = st[1], szz = st[2], sxy = st[3];
    const cen = (sxx + syy) / 2, R = Math.sqrt(((sxx - syy) / 2) * ((sxx - syy) / 2) + sxy * sxy), t2 = Math.atan2(2 * sxy, sxx - syy);
    const str = [cen + R, cen - R, szz];
    const ix = [0, 1, 2]; ix.sort((a, b) => (str[a] > str[b] ? -1 : str[a] < str[b] ? 1 : 0));   // mismo orden que std::sort con «>»
    if (GeoFem.gDesempateZ) GeoFem.empateZ(str, ix);
    const ss = [str[ix[0]], str[ix[1]], str[ix[2]]];
    const tol = GeoFem.ysTol;   // antes 1e-7·|σ|máx (relativa)
    const sp = Math.sin(phi), sg = Math.sin(psi), ccos = c * Math.cos(phi);
    for (let i = 0; i < 4; i++) out[i] = st[i];
    if (info) { info.t2 = t2; info.ix = ix.slice(); info.reg = 0; }
    if (GeoFem.fmc(ss, sp, ccos) <= tol) return 0;
    let reg = 1;
    const D = [0, 1, 2].map((i) => [De[i * 4], De[i * 4 + 1], De[i * 4 + 2]]);
    const n1 = [0.5 * (1 + sp), 0, -0.5 * (1 - sp)], g1 = [0.5 * (1 + sg), 0, -0.5 * (1 - sg)];
    const Dg1 = [0, 1, 2].map((i) => D[i][0] * g1[0] + D[i][1] * g1[1] + D[i][2] * g1[2]);
    const den = n1[0] * Dg1[0] + n1[1] * Dg1[1] + n1[2] * Dg1[2], dl = GeoFem.fmc(ss, sp, ccos) / den;
    let r = [ss[0] - dl * Dg1[0], ss[1] - dl * Dg1[1], ss[2] - dl * Dg1[2]];
    if (!GeoFem.mcValido(r, sp, ccos, tol)) {
      // GEO5 (FUN_005a67e0): la arista se elige por σ2_new > σ1_new (→ σ1 = σ2, caras (σ1,σ3)+(σ2,σ3)); si no, σ2 = σ3.
      // Si la arista no vale, ápice. (Probar las dos en orden elegía a veces la equivocada: ver geofem.cpp)
      if (r[1] > r[0]) { r = GeoFem.mcArista(ss, D, n1, g1, [0, 0.5 * (1 + sp), -0.5 * (1 - sp)], [0, 0.5 * (1 + sg), -0.5 * (1 - sg)], ccos); reg = 4; }
      else { r = GeoFem.mcArista(ss, D, n1, g1, [0.5 * (1 + sp), -0.5 * (1 - sp), 0], [0.5 * (1 + sg), -0.5 * (1 - sg), 0], ccos); reg = 2; }
      if (!GeoFem.mcValido(r, sp, ccos, tol)) { const a = Math.tan(phi) > 1e-12 ? c / Math.tan(phi) : 0; r = [a, a, a]; reg = 3; }
    }
    const pr = [0, 0, 0]; for (let k = 0; k < 3; k++) pr[ix[k]] = r[k];
    const cen2 = (pr[0] + pr[1]) / 2, R2 = (pr[0] - pr[1]) / 2;
    out[0] = cen2 + R2 * Math.cos(t2); out[1] = cen2 - R2 * Math.cos(t2); out[2] = pr[2]; out[3] = R2 * Math.sin(t2);
    if (info) info.reg = reg;
    return reg;
  }
  /** Tangente de Mohr-Coulomb de GEO5 (la misma que geofem.cpp: bloque normal De − (De·M)L⁻¹(Nᵀ·De), corte principal
   *  elástico G, vértice → 0; rotación Rᵀ·D·R). EXTRAIDO_GeoFEM_MC_multisuperficie.md §4. */
  static gApex = 0;   // rigidez del ápice como fracción de De: solo en el REINTENTO de una etapa (ver geofem.cpp)
  private static mcTangenteGeo5(inf: { t2: number; ix: number[]; reg: number }, De: Float64Array, phi: number, psi: number, Dep: Float64Array): void {
    const sp = Math.sin(phi), sg = Math.sin(psi), a = 0.5 * (1 + sp), b = 0.5 * (sp - 1), ag = 0.5 * (1 + sg), bg = 0.5 * (sg - 1);
    const D = [0, 1, 2].map((i) => [De[i * 4], De[i * 4 + 1], De[i * 4 + 2]]);
    const n1 = [a, 0, b], n2 = [0, a, b], n3 = [a, b, 0], g1 = [ag, 0, bg], g2 = [0, ag, bg], g3 = [ag, bg, 0];
    const Dn = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    if (inf.reg === 3) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) Dn[i][j] = GeoFem.gApex * D[i][j];
    if (inf.reg !== 3) {
      const N = [n1], M = [g1];
      if (inf.reg === 2) { N.push(n3); M.push(g3); } else if (inf.reg === 4) { N.push(n2); M.push(g2); }
      const k = N.length;
      const DM = M.map((m) => [0, 1, 2].map((i) => D[i][0] * m[0] + D[i][1] * m[1] + D[i][2] * m[2]));
      const ND = N.map((n) => [0, 1, 2].map((i) => n[0] * D[0][i] + n[1] * D[1][i] + n[2] * D[2][i]));
      const L = N.map((n) => DM.map((dm) => n[0] * dm[0] + n[1] * dm[1] + n[2] * dm[2]));
      let Li: number[][];
      if (k === 1) Li = [[1 / L[0][0]]];
      else { const det = L[0][0] * L[1][1] - L[0][1] * L[1][0]; Li = [[L[1][1] / det, -L[0][1] / det], [-L[1][0] / det, L[0][0] / det]]; }
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        let s = 0; for (let p = 0; p < k; p++) for (let q = 0; q < k; q++) s += DM[p][i] * Li[p][q] * ND[q][j];
        Dn[i][j] = D[i][j] - s;
      }
    }
    const P = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) P[inf.ix[i]][inf.ix[j]] = Dn[i][j];
    P[3][3] = De[15];
    const th = inf.t2 / 2, c = Math.cos(th), s = Math.sin(th);
    const Rm = [[c * c, s * s, 0, c * s], [s * s, c * c, 0, -c * s], [0, 0, 1, 0], [-2 * c * s, 2 * c * s, 0, c * c - s * s]];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let v = 0; for (let p = 0; p < 4; p++) for (let q = 0; q < 4; q++) v += Rm[p][i] * P[p][q] * Rm[q][j];
      Dep[i * 4 + j] = v;
    }
  }

  /** Fuerzas internas con σ = retorno(SIG + De·B·du). Si commit: guarda σ y la tangente del retorno. */
  private assembleInc(du: Float64Array, ab: [number, number][], commit: boolean, Fi: Float64Array): void {
    Fi.fill(0);
    const ue = new Float64Array(12), deps = new Float64Array(4), sig = new Float64Array(4), Dep = new Float64Array(16);
    for (let e = 0; e < this.ne; e++) {
      if (!this.act[e]) continue;
      const mm = this.EMAT[e], De = this.D4[mm], al = ab[mm][0], k = ab[mm][1];
      for (let a = 0; a < 12; a++) ue[a] = du[this.edof[e * 12 + a]];
      for (let q = 0; q < NG; q++) {
        const kk = e * NG + q;
        const B = this.Bc.subarray(kk * 36, kk * 36 + 36);
        let e0 = 0, e1 = 0, e2 = 0;
        for (let c = 0; c < 12; c++) { e0 += B[c] * ue[c]; e1 += B[12 + c] * ue[c]; e2 += B[24 + c] * ue[c]; }
        deps[0] = e0; deps[1] = e1; deps[2] = 0; deps[3] = e2;
        const sigN = this.SIG.subarray(kk * 4, kk * 4 + 4);
        let got: boolean;
        if (this.model[mm - 1] === 1 && !this.rigid[mm - 1]) {   // MOHR-COULOMB, tangente NUMÉRICA (como geofem.cpp)
          const q = this.mcp[mm];
          const inf = { t2: 0, ix: [0, 1, 2], reg: 0 };
          const ret = (de: ArrayLike<number>, out: Float64Array): number => {
            const tr = new Float64Array(4); for (let i = 0; i < 4; i++) { let v = sigN[i]; for (let j = 0; j < 4; j++) v += De[i * 4 + j] * de[j]; tr[i] = v; }
            return GeoFem.mcReturn(tr, De, q[0], q[2], q[1], out, inf);
          };
          got = ret(deps, sig) !== 0;   // también en el ápice, tangente numérica (con la elástica la etapa 6 no convergía)
          if (got) GeoFem.mcPrincDevuelta(sig, inf);
          if (got && (commit || this.soloTangente)) GeoFem.mcTangenteGeo5(inf, De, q[0], q[2], Dep);   // la de GEO5
        } else got = this.dpReturn(deps, al, k, De, commit || this.soloTangente, sigN, sig, Dep);
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
        } else if (this.soloTangente) {   // solo la tangente del retorno (las tensiones guardadas no se tocan), como geofem.cpp
          if (got) { this.DEP.set(Dep, kk * 16); this.hasDep[kk] = 1; } else this.hasDep[kk] = 0;
        }
      }
    }
  }

  /** Fuerzas internas con la σ GUARDADA tal cual (Σ Bᵀ·σ·w), sin retorno (como geofem.cpp fintSig). */
  private fintSig(Fi: Float64Array): void {
    Fi.fill(0);
    for (let e = 0; e < this.ne; e++) {
      if (!this.act[e]) continue;
      for (let q = 0; q < NG; q++) {
        const kk = e * NG + q, B = this.Bc.subarray(kk * 36, kk * 36 + 36), w = this.dJw[kk];
        const t0 = this.SIG[kk * 4] * w, t1 = this.SIG[kk * 4 + 1] * w, t3 = this.SIG[kk * 4 + 3] * w;
        for (let c = 0; c < 12; c++) Fi[this.edof[e * 12 + c]] += B[c] * t0 + B[12 + c] * t1 + B[24 + c] * t3;
      }
    }
  }

  /** Un peldaño de la escalera (Newton completo con line-search). Devuelve [conv, u, it]. */
  private nrstep(SRF: number, Fext: Float64Array, rstep: number, trace?: { u: Float64Array }[], keep = false, Fref?: Float64Array): [boolean, Float64Array, number] {
    const maxit = 100;
    const ab: [number, number][] = [];
    for (let mm = 0; mm < this.MAT.length; mm++) {   // TODOS los suelos (antes tope 2: con 3+ suelos leía fuera del arreglo)
      // RIGID BODY de GEO5 (muro de hormigón): región ELÁSTICA. k = ∞ deja f = J + αI₁ − k < 0 siempre, así que el
      // return-map nunca se activa y la SRM no le reduce nada: el muro sostiene el talud pero no plastifica.
      if (this.rigid[mm]) { ab[mm + 1] = [0, 1e30]; continue; }
      const phi = Math.atan(Math.tan(this.MAT[mm][2] * Math.PI / 180) / SRF), c = this.MAT[mm][3] / SRF;
      ab[mm + 1] = this.dpAb(phi, c);
      this.mcp[mm + 1] = [phi, c, Math.min(this.MAT[mm][5] * Math.PI / 180, phi)];   // la dilatancia no pasa de la fricción reducida
    }
    const ndof = this.ndof, nf = this.nfree, free = this.free;
    const u = new Float64Array(ndof), du = new Float64Array(ndof), Fi = new Float64Array(ndof), F1 = new Float64Array(ndof);
    const Rf = new Float64Array(nf), R1 = new Float64Array(nf), duf = new Float64Array(nf), drf = new Float64Array(nf);
    const ADDisp = new Float64Array(nf), DForce = new Float64Array(nf);
    let conv = false, it = 0;
    if (!keep) this.resetState();   // keep = la etapa arranca del estado (σ, ε_pl) que dejó la anterior
    GeoFem.gDesempateZ = this.desempateZ; GeoFem.gEmpateXY = this.modoG5;
    // porPaso: el retorno de cada iteración sale del estado del INICIO del paso con el incremento ACUMULADO (como geofem.cpp).
    // U0 = incremento inicial (modo GEO5: η·Δu del último peldaño), solo en σ.
    const S0 = Float64Array.from(this.SIG), E0 = Float64Array.from(this.EPL), uT = new Float64Array(ndof), CLoad = new Float64Array(nf);
    const U0 = this.porPaso && this.u0ext && this.u0ext.length === ndof ? this.u0ext : new Float64Array(ndof);
    const evalInc = (dinc: Float64Array, commit: boolean, Fo: Float64Array): void => {
      if (!this.porPaso) { this.assembleInc(dinc, ab, commit, Fo); return; }
      for (let d = 0; d < ndof; d++) uT[d] = U0[d] + u[d] + dinc[d];
      if (commit) { this.SIG.set(S0); this.EPL.set(E0); this.assembleInc(uT, ab, true, Fo); return; }
      const cur = Float64Array.from(this.SIG); this.SIG.set(S0); this.assembleInc(uT, ab, false, Fo); this.SIG.set(cur);
    };
    if (this.soloFint) { this.assembleInc(du, ab, false, Fi); this.ALoadV = Float64Array.from(Fi); return [true, u, 0]; }   // ALoad = F_int (modo GEO5)
    if (keep && Fref && this.tangIni) { this.soloTangente = true; evalInc(du, false, Fi); this.soloTangente = false; }
    // modo GEO5 (bit 32), paso SIN porPaso (pasos de carga de SRF 1): R de arranque = Fext − Σ Bᵀ·σ GUARDADA, sin el retorno
    // con Δε = 0 (re-endereza los PG que la cara dejó con las principales invertidas). Tanda 14: los 10 pasos = GEO5 a 1e-11
    if (this.modoG5 && !this.porPaso) this.fintSig(Fi); else evalInc(du, false, Fi);
    this.gather(Fext, Fi, Rf);                                   // con TIES el esclavo suma en la fila del maestro
    DForce.set(Rf);
    if (Fref) this.gather(Fref, null, DForce);                   // SRM de GEO5: normas respecto a la carga total (como geofem.cpp)
    let rPrev = 1e300, ndiv = 0;
    for (it = 1; it <= maxit; it++) {
      if (!Number.isFinite(norm(Rf))) break;
      this.assembleK(this.Kt, false);
      let ok = bandFactor(this.Kt);
      if (ok) { bandSolve(this.Kt, Rf, duf); if (!Number.isFinite(norm(duf))) ok = false; }
      if (!ok) bandSolve(this.Kel, Rf, duf);
      this.scatter(duf, du);                                     // fijos = 0, esclavo = su maestro
      const s0 = dot(duf, Rf), n0 = norm(Rf);
      // line search de GEO5: secante acumulativa mientras ‖R(η)‖/‖R(0)‖ ≥ 0.8, recorte a [0.1, 1], hasta lsMax pasadas (como geofem.cpp)
      let al = 1.0, acc = 1.0, nls = 0, ratio: number;
      const dut = new Float64Array(ndof);
      do {
        for (let d = 0; d < ndof; d++) dut[d] = du[d] * al;
        evalInc(dut, false, F1);                                  // retorno de PRUEBA desde el estado
        this.gather(Fext, F1, R1);
        const s1 = dot(duf, R1), n1 = norm(R1), den = s0 - s1;
        ratio = 0;
        if (n0 > 1e-10 && n1 > 1e-10 && Math.abs(den) > 1e-10) { ratio = n1 / n0; if (ratio >= 0.8) acc = acc * s0 / den; }
        if (acc < 0.1) { al = 0.1; ratio = 0; } else if (acc >= 1.0) { al = 1.0; ratio = 0; } else { nls++; al = acc; }
      } while (nls < this.lsMax && ratio >= 0.8);
      this.lastRaw = Float64Array.from(du); this.lastEta = al;   // DDisp crudo y η de la última it (arranque del peldaño siguiente, modo GEO5)
      for (let k = 0; k < nf; k++) drf[k] = al * duf[k];
      for (let d = 0; d < ndof; d++) du[d] *= al;
      // ENERGÍA de GEO5 2024 (FUN_0059c800, llamada en FUN_004f7ea0 @0x4f82b8 con ecx = DLoad, edx = CLoad):
      // √|DDisp·CLoad| / máx(√|ADDisp·DForce|, 1); CLoad = DForce en la 1.ª it (memcpy @0x4f821f), luego el residuo de la
      // it anterior (CLoad ← DLoad tras las normas). Modo GEO5: esa; bit 8: el residuo previo también en la 1.ª.
      const enG5 = this.modoG5;
      if (enG5) CLoad.set(it === 1 ? DForce : Rf); else if (this.energiaPrev) CLoad.set(Rf);   // residuo ANTES de la iteración (bit 8)
      evalInc(du, true, Fi);                                     // COMMIT: σ_i y tangente
      for (let d = 0; d < ndof; d++) u[d] += du[d];
      this.gather(Fext, Fi, Rf);
      if (trace) trace.push({ u: Float64Array.from(u) });
      for (let k = 0; k < nf; k++) ADDisp[k] += drf[k];
      const nDD = norm(drf), dA = norm(ADDisp), nDL = norm(Rf), dF = norm(DForce);
      const nEN = Math.sqrt(Math.abs(dot(drf, enG5 || this.energiaPrev ? CLoad : Rf))), dE = Math.sqrt(Math.abs(dot(ADDisp, DForce)));
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

  /** Una etapa de CONSTRUCCIÓN (tensiones, SRF = 1), la misma que runStaged de geofem.cpp: activa `a`, carga = peso
   *  de los activos + Fextra, Newton desde el estado anterior; si no cierra, la carga nueva entra en 2, 4, 8, 16
   *  incrementos. En la PRIMERA etapa el estado se pone a cero y u también al acabar (GEO5); la ε NO (medido). */
  stagedStep(a: ArrayLike<number>, Fextra: ArrayLike<number>, first: boolean): { conv: boolean; alcanzada: number; u: Float64Array; sig1: Float64Array; epl1: Float64Array; eps1: Float64Array } {
    const ne = this.ne, ndof = this.ndof;
    for (let e = 0; e < ne; e++) this.act[e] = a[e] ? 1 : 0;
    this.dormido.fill(1);
    for (let e = 0; e < ne; e++) if (this.act[e]) for (let k = 0; k < 12; k++) this.dormido[this.edof[e * 12 + k]] = 0;
    if (first) this.prevAct = null;
    else if (this.prevAct) this.desplazamientoInicialRegion(this.prevAct);
    // MODO GEO5 (bit 32), medido contra Restart_Step de GEO5 (muro de Manabí con agua, 2-nov-2026): cada fase arranca con K ELÁSTICA
    // (el Restart no guarda la tangente), tangente del ápice 0 y la carga en pasos de 0.1 (time_step) con relajación ×½ ≤ 2.
    // Reintento de un paso (relajación) en modo GEO5: GEO5 relee el Restart_Step y arma K con la tangente de los PG que el
    // último paso bueno CORRIGIÓ (bandera 4|1), no la elástica. Medido con FRGeoFEM sin interfaz (fase 7 del muro, 2-nov-2026):
    // con updatenone los reintentos = 1.er intento; con updatefull el reintento no depende de la it en que falló.
    if (this.modoG5) { this.depFase = Float64Array.from(this.DEP); this.hasFase = Uint8Array.from(this.hasDep); this.hasDep.fill(0); }
    const F = new Float64Array(ndof);
    for (let e = 0; e < ne; e++) {
      if (!this.act[e]) continue;
      const rho = -this.MAT[this.EMAT[e] - 1][4];
      for (let q = 0; q < NG; q++) { const [N] = t6(GP[q][0], GP[q][1]); for (let k = 0; k < 6; k++) F[2 * this.ELE[e][k] + 1] += N[k] * rho * this.dJw[e * NG + q]; }
    }
    for (let d = 0; d < ndof; d++) F[d] += Fextra[d];
    if (first) { this.resetState(); this.Utot = new Float64Array(ndof); this.EPSacc = new Float64Array(ne * NG * 4); this.Flast = new Float64Array(ndof); }
    const sig0 = Float64Array.from(this.SIG), epl0 = Float64Array.from(this.EPL), dep0 = Float64Array.from(this.DEP), has0 = Uint8Array.from(this.hasDep);
    const u = new Float64Array(ndof), Fk = new Float64Array(ndof); let it = 0, c = false, nsub = 1;
    this.alcanzada = 1;
    GeoFem.gApex = this.modoG5 ? 0 : 0.1;   // construcción por etapas: tangente del ápice 0.1·De (como geofem.cpp); la SRM sigue con la de GEO5
    for (; nsub <= 16; nsub *= 2) {
      if (nsub > 1) { this.SIG.set(sig0); this.EPL.set(epl0); this.DEP.set(dep0); this.hasDep.set(has0); u.fill(0); }
      c = true;
      for (let j = 1; j <= nsub && c; j++) {
        const sj = Float64Array.from(this.SIG), ej = Float64Array.from(this.EPL), dj = Float64Array.from(this.DEP), hj = Uint8Array.from(this.hasDep);
        for (let d = 0; d < ndof; d++) Fk[d] = this.Flast[d] + (F[d] - this.Flast[d]) * j / nsub;
        const [cj, du1, itj] = (this.modoG5 && j === 1) ? this.pasosGeo5(Fk) : this.nrstep(1.0, Fk, j, undefined, true); c = cj; it += itj;
        if (c) { let m = 0; for (let d = 0; d < ndof; d++) m = Math.max(m, Math.abs(du1[d])); if (!(m < 1.0)) c = false; }   // > 1 m = mecanismo, no equilibrio (como geofem.cpp)
        if (c) for (let d = 0; d < ndof; d++) u[d] += du1[d];
        else if (nsub === 16) {   // último intento: se queda en el incremento j−1
          this.SIG.set(sj); this.EPL.set(ej); this.DEP.set(dj); this.hasDep.set(hj); this.alcanzada = (j - 1) / nsub;
          for (let d = 0; d < ndof; d++) Fk[d] = this.Flast[d] + (F[d] - this.Flast[d]) * this.alcanzada;
        }
      }
      if (c) break;
      if (nsub < 16) this.log(`    etapa: con ${nsub} incremento(s) no cierra; se reparte la carga en ${nsub * 2}`);
    }
    if (nsub > 16) nsub = 16;
    if (!c) {   // REINTENTO: toda la carga, con la tangente del ápice de GEO5 (como geofem.cpp)
      const sa = Float64Array.from(this.SIG), ea = Float64Array.from(this.EPL), da = Float64Array.from(this.DEP), ha = Uint8Array.from(this.hasDep), alc = this.alcanzada;
      this.SIG.set(sig0); this.EPL.set(epl0); this.DEP.set(dep0); this.hasDep.set(has0);
      GeoFem.gApex = 0; const [cr0, dur, itr] = this.nrstep(1.0, F, 1, undefined, true); it += itr;
      let cr = cr0; if (cr) { let m = 0; for (let d = 0; d < ndof; d++) m = Math.max(m, Math.abs(dur[d])); if (!(m < 1.0)) cr = false; }
      if (cr) { u.set(dur); c = true; this.alcanzada = 1; nsub = 1; this.log("    etapa: cierra con la tangente del ápice de GEO5"); }
      else { this.SIG.set(sa); this.EPL.set(ea); this.DEP.set(da); this.hasDep.set(ha); this.alcanzada = alc; }
    }
    GeoFem.gApex = 0;
    this.Flast = c ? F : Float64Array.from(Fk);
    if (!first) for (let d = 0; d < ndof; d++) this.Utot[d] += u[d];
    for (let e = 0; e < ne; e++) if (this.act[e]) for (let q = 0; q < NG; q++) {   // ε de SUS etapas activas (la 1 también)
      const kk = e * NG + q, B = this.Bc.subarray(kk * 36, kk * 36 + 36); let e0 = 0, e1 = 0, e2 = 0;
      for (let k = 0; k < 12; k++) { const v = u[this.edof[e * 12 + k]]; e0 += B[k] * v; e1 += B[12 + k] * v; e2 += B[24 + k] * v; }
      this.EPSacc[kk * 4] += e0; this.EPSacc[kk * 4 + 1] += e1; this.EPSacc[kk * 4 + 3] += e2;
    }
    this.prevAct = Uint8Array.from(this.act);
    let na = 0; for (let e = 0; e < ne; e++) na += this.act[e];
    let sF = 0; for (let i = 0; i < this.nn; i++) sF += F[2 * i + 1];
    this.log(`    ETAPA ${first ? "inicial" : ""}: ${na} de ${ne} elementos activos, carga vertical ${sF.toFixed(3)} kN, ${c ? "CONVERGE" : "NO CONVERGE"} en ${it} iteraciones (${nsub} incremento(s))${c ? "" : ` · carga alcanzada ${(100 * this.alcanzada).toFixed(1)} %`}`);
    return { conv: c, alcanzada: this.alcanzada, u: Float64Array.from(this.Utot), sig1: Float64Array.from(this.SIG), epl1: Float64Array.from(this.EPL), eps1: Float64Array.from(this.EPSacc) };
  }

  /** Modo GEO5 de una etapa: de Flast a Fk en pasos de 0.1 (`time_step`); si uno no cierra, vuelve a su estado y lo parte
   *  a la mitad (`time_step_relaxation_factor` 2); más de 2 relajaciones = no cierra. */
  private pasosGeo5(Fk: Float64Array): [boolean, Float64Array, number] {
    const ndof = this.ndof, F0 = Float64Array.from(this.Flast), u = new Float64Array(ndof), Fi = new Float64Array(ndof);
    // Carga base de la fase = Σ Bᵀ·σ de arranque (no la carga nominal de la fase anterior): GEO5 tira el desequilibrio que
    // dejó la fase anterior. Medido (registros/2026-11-02_geo5_residuo_iter1.md): con el Δu de GEO5 la σ de la it 1 = GEO5
    // a 8e-12 kPa y |gi| = 0.52562 (GEO5 0.5256) solo sin ese desequilibrio; K·(Δu_GEO5 − Δu_motor) = −desequilibrio a 3e-8.
    const Fs = new Float64Array(ndof); this.fintSig(Fs);
    let it = 0, t = 0, dt = 0.1, nrel = 0, k = 0;
    while (t < 1 - 1e-12) {
      const tn = Math.min(1, t + dt);
      const s0 = Float64Array.from(this.SIG), e0 = Float64Array.from(this.EPL), d0 = Float64Array.from(this.DEP), h0 = Uint8Array.from(this.hasDep);
      for (let d = 0; d < ndof; d++) Fi[d] = Fs[d] + (Fk[d] - F0[d]) * tn;
      const [ci, dui, iti] = this.nrstep(1.0, Fi, ++k, undefined, true); it += iti;
      if (ci) { for (let d = 0; d < ndof; d++) u[d] += dui[d]; t = tn; continue; }
      this.SIG.set(s0); this.EPL.set(e0); dt /= 2;
      // K del reintento = tangente del último paso bueno; en el 1.er paso de la fase, la del final de la fase anterior
      if (t === 0 && this.depFase && this.hasFase) { this.DEP.set(this.depFase); this.hasDep.set(this.hasFase); } else { this.DEP.set(d0); this.hasDep.set(h0); }
      this.log(`    paso ${tn.toFixed(4)} no converge → ${dt}`);
      if (++nrel > 2) return [false, u, it];
    }
    return [true, u, it];
  }

  /** DESPLAZAMIENTO INICIAL de los nudos de una región recién activada, como GEO5 (FRGeoFEM, region.cpp:
   *  Region::SetBoundaryNodesDisplacements + Region::GetDisplacementVector; decompilado FUN_005bfbe0 / FUN_005c0280 /
   *  FUN_005bf3e0, registros 30-sep-2026): problema ELÁSTICO solo con los elementos nuevos, SIN peso, con el u de los
   *  nudos que ya existían impuesto en la frontera (si hay menos de 2 nudos de frontera, nada). Los nudos nuevos nacen
   *  con ese u (la capa se coloca ya «asentada» con lo de abajo); no crea tensión ni deformación. */
  private desplazamientoInicialRegion(prev: Uint8Array): void {
    const ne = this.ne, nn = this.nn, ndof = this.ndof;
    const nuevo = new Uint8Array(ne); let hay = false;
    for (let e = 0; e < ne; e++) if (this.act[e] && !prev[e]) { nuevo[e] = 1; hay = true; }
    if (!hay) return;
    const viejo = new Uint8Array(nn), enRegion = new Uint8Array(nn);
    for (let e = 0; e < ne; e++) for (let k = 0; k < 6; k++) { if (prev[e]) viejo[this.ELE[e][k]] = 1; if (nuevo[e]) enRegion[this.ELE[e][k]] = 1; }
    let nfront = 0; for (let i = 0; i < nn; i++) if (enRegion[i] && viejo[i]) nfront++;
    if (nfront < 2) return;
    const act0 = this.act, dor0 = this.dormido;
    this.act = nuevo; this.dormido = new Uint8Array(ndof).fill(1);
    for (let i = 0; i < nn; i++) if (enRegion[i]) { this.dormido[2 * i] = 0; this.dormido[2 * i + 1] = 0; }
    const K = bandCreate(this.nfree, this.band); this.assembleK(K, true);
    const rhs = new Float64Array(this.nfree), P = 1e15;
    for (let i = 0; i < nn; i++) if (enRegion[i] && viejo[i]) for (const d of [2 * i, 2 * i + 1]) { const r = this.map[d]; if (r >= 0) { bandAdd(K, r, r, P); rhs[r] = P * this.Utot[d]; } }
    this.act = act0; this.dormido = dor0;
    if (!bandFactor(K)) { this.log("    región nueva: K singular, sin desplazamiento inicial"); return; }
    const x = new Float64Array(this.nfree); bandSolve(K, rhs, x);
    for (let i = 0; i < nn; i++) if (enRegion[i] && !viejo[i]) for (const d of [2 * i, 2 * i + 1]) { const r = this.map[d]; if (r >= 0) this.Utot[d] = x[r]; }
  }

  /** Construcción por etapas: TODAS en orden (fs = NaN: análisis de tensiones). Misma salida que GeoFemWasm.runStaged. */
  runStaged(m: GeoModel, onStage?: (r: StageResult, index: number) => void): StageResult[] {
    const ndof = this.ndof, ne = this.ne;
    const LOADS: Record<string, ArrayLike<number>> = { ...(m.loads || {}), Fs: m.Fs, Fa: m.Fa };
    return m.stages.map((st, si) => {
      const F = new Float64Array(ndof);
      for (const nm of st.loads) { if (nm === "Fg") continue; const v = LOADS[nm]; if (!v) throw new Error(`carga desconocida ${nm}`); for (let d = 0; d < ndof; d++) F[d] += v[d]; }
      if (m.agua) { const ex = extraAguaEtapa(m, st.active ?? new Array(ne).fill(1)); for (let d = 0; d < ndof; d++) F[d] += ex[d]; }
      const t0 = performance.now();
      this.log(""); this.log(`### ${st.name} ###`);
      const r = this.stagedStep(st.active ?? new Array(ne).fill(1), F, si === 0);
      const sec = (performance.now() - t0) / 1000;
      this.log(`  ${st.name.padEnd(22)} >>> ${r.conv ? "equilibrio" : "NO CONVERGE"}  [${sec.toFixed(1)} s]`);
      const res: StageResult = { name: st.name, fs: NaN, alcanzada: r.alcanzada, geo5: st.geo5, u: r.u, uel: new Float64Array(ndof), steps: [], prog: "", seconds: sec, u1: r.u, sig1: r.sig1, epl1: r.epl1, eps1: r.eps1, ngp: ne * NG };
      onStage?.(res, si); return res;
    });
  }

  /** Estado INICIAL de la SRM (SRF = 1): si no cierra de una vez, desde cero en 2, 4, 8, 16 incrementos (como geofem.cpp). Solo SRF = 1. */
  private nrstepInc(SRF: number, F: Float64Array, rstep: number): [boolean, Float64Array, number] {
    const r0 = this.nrstep(SRF, F, rstep); if (r0[0]) return r0;
    let it = r0[2]; const ndof = this.ndof, Fk = new Float64Array(ndof);
    for (let nsub = 2; nsub <= 16; nsub *= 2) {
      this.resetState(); const u = new Float64Array(ndof); let c = true;
      for (let j = 1; j <= nsub && c; j++) {
        for (let d = 0; d < ndof; d++) Fk[d] = F[d] * j / nsub;
        const [cj, du, itj] = this.nrstep(SRF, Fk, rstep, undefined, true); c = cj; it += itj;
        if (c) { let m = 0; for (let d = 0; d < ndof; d++) m = Math.max(m, Math.abs(du[d])); if (!(m < 1.0)) c = false; }
        if (c) for (let d = 0; d < ndof; d++) u[d] += du[d];
      }
      if (c) { this.log(`    SRF=${f4(SRF)}: converge con la carga en ${nsub} incrementos`); return [true, u, it]; }
    }
    return [false, r0[1], it];
  }

  /** Análisis de tensiones como GEO5: carga en pasos de 0.1 desde cero, relajación del paso a la mitad (≤ 5). Como geofem.cpp. */
  private nrstepPasos(SRF: number, F: Float64Array): [boolean, Float64Array, number] {
    this.resetState(); const ndof = this.ndof, u = new Float64Array(ndof), Fk = new Float64Array(ndof);
    let t = 0, dt = 0.1, nrel = 0, k = 0, it = 0;
    while (t < 1 - 1e-12) {
      const tn = Math.min(1, t + dt);
      const s0 = Float64Array.from(this.SIG), e0 = Float64Array.from(this.EPL), d0 = Float64Array.from(this.DEP), h0 = Uint8Array.from(this.hasDep);
      for (let d = 0; d < ndof; d++) Fk[d] = F[d] * tn;
      const [cc, du, itk] = this.nrstep(SRF, Fk, ++k, undefined, true); let c = cc; it += itk;
      if (c) { let m = 0; for (let d = 0; d < ndof; d++) m = Math.max(m, Math.abs(du[d])); if (!(m < 1.0)) c = false; }
      if (c) { for (let d = 0; d < ndof; d++) u[d] += du[d]; t = tn; }
      else { this.SIG.set(s0); this.EPL.set(e0); this.DEP.set(d0); this.hasDep.set(h0); dt /= 2; if (++nrel > 5) { this.log(`    tensiones: carga alcanzada ${(100 * t).toFixed(1)} %`); return [false, u, it]; } }
    }
    this.log(`    tensiones: 100 % de la carga en ${k - nrel} pasos (${nrel} relajaciones)`);
    return [true, u, it];
  }

  /** Escalera SRM de GEO5 para una etapa (carga total Ftot). */
  private srm(Ftot: Float64Array): { fs: number; prog: string; ulo: Float64Array; uel: Float64Array; steps: { srf: number; u: Float64Array }[]; u1: Float64Array; sig1: Float64Array; epl1: Float64Array; eps1: Float64Array } {
    const RED0 = 0.9, RELAX = 2, MINSTEP = 0.99, MAXRELAX = 3;
    let Racc = 1, fs = 1, nrelax = 0, rs = 0, prog = "";
    let ulo: Float64Array = new Float64Array(this.ndof);
    const steps: { srf: number; u: Float64Array }[] = [];
    // modo GEO5 del muro (bit 32): pasos de carga de SRF 1 SIN porPaso (Tanda 13), porPaso solo en los peldaños (como geofem.cpp)
    const pp = this.porPaso; if (this.modoG5) this.porPaso = false;
    const [c0, u1, n0] = this.srmContinua ? this.nrstepPasos(1.0, Ftot) : this.nrstepInc(1.0, Ftot, 0);   // GEO5: pasos de 0.1
    this.porPaso = pp;
    // instantánea del estado de tensión (SRF=1) para los campos del visor
    const sig1 = Float64Array.from(this.SIG), epl1 = Float64Array.from(this.EPL), eps1 = new Float64Array(this.ne * NG * 4);
    for (let e = 0; e < this.ne; e++) for (let q = 0; q < NG; q++) {
      const kk = e * NG + q, B = this.Bc.subarray(kk * 36, kk * 36 + 36); let e0 = 0, e1 = 0, e2 = 0;
      for (let c = 0; c < 12; c++) { const v = u1[this.edof[e * 12 + c]]; e0 += B[c] * v; e1 += B[12 + c] * v; e2 += B[24 + c] * v; }
      eps1[kk * 4] = e0; eps1[kk * 4 + 1] = e1; eps1[kk * 4 + 3] = e2;
    }
    // u ELÁSTICA = K_el⁻¹ F: la referencia que GEO5 resta (u(FS) − u_el), MEDIDO 2026-09-03
    const rhs = new Float64Array(this.nfree), x = new Float64Array(this.nfree);
    this.gather(Ftot, null, rhs);
    bandSolve(this.Kel, rhs, x);
    const uel = this.scatter(x);
    this.log(`    SRM rs00 paso=1.0000 SRF=1.0000 ${c0 ? "CONVERGE" : "DIVERGE"} it=${n0}`);
    let uBase: Float64Array = Float64Array.from(u1);   // SRM continuada: desplazamiento del último estado convergido
    let FL: Float64Array = Ftot, pend: Float64Array | null = null;   // pend = η·Δu de la última it del último peldaño convergido
    if (this.srmContinua && this.modoG5) {   // GEO5: ALoad = F_int del estado de SRF 1 (carga y referencia de las normas), como geofem.cpp
      this.soloFint = true; this.nrstep(1.0, Ftot, 0, undefined, true); this.soloFint = false; FL = this.ALoadV!;
      let a = 0, b = 0; for (let k = 0; k < this.nfree; k++) { const d = this.free[k]; a += FL[d] * FL[d]; b += Ftot[d] * Ftot[d]; }
      this.log(`    SRM modo GEO5: |ALoad| = ${Math.sqrt(a).toFixed(4)} (|F| = ${Math.sqrt(b).toFixed(4)})`);
    }
    if (!c0) {   // FS < 1 como GEO5: SRF 1 no converge → «Searching for stable parameters c and phi»: la resistencia se AUMENTA
      // ×1/0.9 en cada intento (SRF 0.9, 0.81, …), desde el estado de partida, hasta el PRIMERO que converge, y ahí termina
      // (Log_File de GEO5 2024, ACADS EX1(a): 4 intentos, «Safety Factor = 0.656100», c = 3/0.6561). Tope propio 0.9^20 ≈ 0.12.
      let f = 1;
      for (let k = 1; k <= 20; k++) {
        f *= RED0; rs++;
        const [cv, ub, nit] = this.srmContinua ? this.nrstepPasos(f, Ftot) : this.nrstep(f, Ftot, rs);
        const ok = cv && Number.isFinite(norm(ub));
        this.log(`    SRM rs${pad02(rs)} paso=${f4(RED0)} SRF=${f4(f)} ${ok ? "CONVERGE" : "DIVERGE"} it=${nit} (FS < 1)`);
        if (ok) {
          fs = f; ulo = ub; steps.push({ srf: f, u: ub });
          let dxmax = 0; for (let i = 0; i < this.nn; i++) dxmax = Math.max(dxmax, Math.abs(ub[2 * i]));
          prog += ` ${f.toFixed(3)}:${(dxmax * 1e3).toFixed(0)}`;
          break;
        }
      }
      if (!steps.length) fs = f;
      return { fs, prog, ulo, uel, steps, u1, sig1, epl1, eps1 };
    }
    for (;;) {
      const s = 1 - (1 - RED0) / Math.pow(RELAX, nrelax);
      if (s > MINSTEP) break;
      const trial = 1 / (Racc * s);                            // SRF EXACTO (GEO5 no redondea)
      if (trial > 3) break;
      rs++;
      let conv: boolean, u: Float64Array, nit: number;
      if (this.srmContinua) {   // GEO5: desde el último estado convergido; si diverge, se vuelve a él (como geofem.cpp)
        const s0 = Float64Array.from(this.SIG), e0 = Float64Array.from(this.EPL), d0 = Float64Array.from(this.DEP), h0 = Uint8Array.from(this.hasDep);
        this.u0ext = this.modoG5 ? pend : null;
        const [cc, du, it] = this.nrstep(trial, FL, rs, undefined, true, FL); conv = cc; nit = it; this.u0ext = null;
        if (conv) { let m = 0; for (let d = 0; d < this.ndof; d++) m = Math.max(m, Math.abs(du[d])); if (!(m < 1.0)) conv = false; }
        if (conv) { u = Float64Array.from(uBase); for (let d = 0; d < this.ndof; d++) u[d] += du[d]; uBase = u; }
        else { u = Float64Array.from(du); this.SIG.set(s0); this.EPL.set(e0); this.DEP.set(d0); this.hasDep.set(h0); }
        if (this.modoG5) { if (conv) { pend = new Float64Array(this.ndof); for (let d = 0; d < this.ndof; d++) pend[d] = this.lastEta * this.lastRaw![d]; } else pend = null; }
      } else [conv, u, nit] = this.nrstep(trial, Ftot, rs);   // SRF > 1: sin reintento por incrementos (la divergencia fija el FS; con reintento Demo04 etapa 3 daba 1.7369)
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

  // =====================================================================================================
  // DINÁMICO LINEAL (paso 1 del plan: suelo ELÁSTICO). Lo del binario de GEO5 (FRGeoFEM.exe 2024):
  //   masa CONSISTENTE Me = ρ·NᵀN·detJ·w (FUN_005836e0; la diagonal aborta en GEO5), ρ = γ/g;
  //   Newmark b1…b6 (part_001.c:60956-60968, c = 0.5 del .rdata), HHT (1+α), v₁ = v + Δt[(1−γ)a + γa₁].
  // Validado contra Abaqus/Standard (CPE6, misma malla nudo a nudo): tests/dinamico_columna.ts.
  // =====================================================================================================

  /** Masa consistente en banda (mismo `map` que K, así respeta fijos y ataduras) y la fila completa de M·1
   *  en x e y (Σ_b M_ab, también con los gdl fijos: es la carga −M·1·a_g del movimiento de la base). */
  massMatrix(g = 9.80665, rhoMat?: number[]): { M: BandMatrix; m1x: Float64Array; m1y: Float64Array; massTotal: number } {
    const M = bandCreate(this.nfree, this.band);
    const m1x = new Float64Array(this.nfree), m1y = new Float64Array(this.nfree);
    const Me = new Float64Array(36);
    let massTotal = 0;
    for (let e = 0; e < this.ne; e++) {
      const rho = rhoMat ? rhoMat[this.EMAT[e] - 1] : this.MAT[this.EMAT[e] - 1][4] / g;
      Me.fill(0);
      for (let q = 0; q < NG; q++) {
        const N = NSH[q], w = rho * this.dJw[e * NG + q];
        massTotal += w;
        for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) Me[a * 6 + b] += N[a] * N[b] * w;
      }
      const nd = this.ELE[e];
      for (let a = 0; a < 6; a++) {
        let row = 0; for (let b = 0; b < 6; b++) row += Me[a * 6 + b];
        for (let c = 0; c < 2; c++) {
          const ia = this.map[2 * nd[a] + c]; if (ia < 0) continue;
          if (c === 0) m1x[ia] += row; else m1y[ia] += row;
          for (let b = 0; b < 6; b++) { const ib = this.map[2 * nd[b] + c]; if (ib >= 0) bandAdd(M, ia, ib, Me[a * 6 + b]); }
        }
      }
    }
    return { M, m1x, m1y, massTotal };
  }

  /** out[k] = Σ_{d: map[d]=k} (F[d] − Fi[d]): residuo en gdl libres (con TIES el esclavo suma en la fila del maestro).
   *  Sin ataduras es exactamente F[free[k]] − Fi[free[k]] (0 + x = x, bit a bit). */
  private gather(F: ArrayLike<number>, Fi: ArrayLike<number> | null, out: Float64Array): void {
    out.fill(0);
    for (let d = 0; d < this.ndof; d++) { const k = this.map[d]; if (k >= 0) out[k] += Fi ? F[d] - Fi[d] : F[d]; }
  }

  /** Reparte un vector de gdl libres a los gdl completos (fijos = 0, esclavo = su maestro). */
  private scatter(x: Float64Array, out = new Float64Array(this.ndof)): Float64Array {
    for (let d = 0; d < this.ndof; d++) { const k = this.map[d]; out[d] = k >= 0 ? x[k] : 0; }
    return out;
  }

  /** Primeros `nmodes` modos de K·φ = ω²·M·φ por ITERACIÓN EN SUBESPACIO (Bathe 11.6; GEO5 usa también
   *  subespacio + Jacobi, eigenvalue_ssi_jacobi.cpp). Usa la K elástica ya factorizada (Kel). */
  modes(nmodes = 3, g = 9.80665, tol = 1e-12, maxit = 200): ModesResult {
    const n = this.nfree, p = Math.min(nmodes, n), q = Math.min(n, Math.max(2 * p, p + 8));
    const { M, m1x, m1y, massTotal } = this.massMatrix(g);
    const K = bandCreate(n, this.band); this.assembleK(K, true);
    // vectores de arranque: M·1x, M·1y y pseudoaleatorios deterministas
    let X: Float64Array[] = [];
    X.push(Float64Array.from(m1x)); X.push(Float64Array.from(m1y));
    let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
    while (X.length < q) X.push(Float64Array.from({ length: n }, rnd));
    let lam: Float64Array = new Float64Array(q), it = 0;
    const Y = X.map(() => new Float64Array(n)), Z = X.map(() => new Float64Array(n));
    for (it = 1; it <= maxit; it++) {
      for (let j = 0; j < q; j++) { bandMul(M, X[j], Y[j]); bandSolve(this.Kel, Y[j], Z[j]); }   // Z = K⁻¹·M·X
      // proyección: Kq = Zᵀ K Z = Zᵀ(M X) ; Mq = Zᵀ M Z
      const MZ = Z.map((z) => { const t = new Float64Array(n); bandMul(M, z, t); return t; });
      const Kq = new Float64Array(q * q), Mq = new Float64Array(q * q);
      for (let i = 0; i < q; i++) for (let j = 0; j < q; j++) { Kq[i * q + j] = dot(Z[i], Y[j]); Mq[i * q + j] = dot(Z[i], MZ[j]); }
      for (let i = 0; i < q; i++) for (let j = 0; j < i; j++) { const a = (Kq[i * q + j] + Kq[j * q + i]) / 2; Kq[i * q + j] = Kq[j * q + i] = a; }
      const [ev, Q] = genEigSym(Kq, Mq, q);
      X = Array.from({ length: q }, (_, j) => { const x = new Float64Array(n); for (let i = 0; i < q; i++) { const c = Q[i * q + j]; for (let k = 0; k < n; k++) x[k] += c * Z[i][k]; } return x; });
      let err = 0; for (let j = 0; j < p; j++) err = Math.max(err, Math.abs(ev[j] - lam[j]) / Math.abs(ev[j]));
      lam = ev;
      if (err < tol) break;
    }
    const f: number[] = [], omega: number[] = [], phi: Float64Array[] = [], mefx: number[] = [], mefy: number[] = [];
    const t = new Float64Array(n);
    for (let j = 0; j < p; j++) {
      bandMul(M, X[j], t); const gm = dot(X[j], t), s = 1 / Math.sqrt(gm);
      for (let k = 0; k < n; k++) X[j][k] *= s;
      omega.push(Math.sqrt(lam[j])); f.push(Math.sqrt(lam[j]) / (2 * Math.PI));
      mefx.push(dot(X[j], m1x) ** 2); mefy.push(dot(X[j], m1y) ** 2);
      phi.push(this.scatter(X[j]));
    }
    this.log(`MODOS (subespacio, ${q} vectores, ${it} iteraciones): ` + f.map((x, j) => `f${j + 1}=${x.toFixed(6)} Hz`).join("  ") + `  | masa total ${massTotal.toFixed(6)} t`);
    return { f, omega, phi, mefx, mefy, massTotal, iterations: it };
  }

  /** Respuesta en el tiempo, LINEAL, al movimiento de la base: M·ü + C·u̇ + K·u = −(M·1)·a_g(t), u relativo a la base.
   *  K_ef = b1·M + (1+α)(b4·C + K), factorizada UNA vez (suelo elástico: constante). Arranca en reposo. */
  dynamic(o: DynOptions): DynResult {
    const t0 = performance.now();
    const alpha = o.alpha ?? 0;
    const beta = o.beta ?? (alpha !== 0 ? (1 - alpha) ** 2 / 4 : 0.25), gamma = o.gamma ?? (alpha !== 0 ? (1 - 2 * alpha) / 2 : 0.5);
    const dt = o.dt, c = 0.5;                                  // c = DAT_00613ff8 (0.5, .rdata de FRGeoFEM.exe)
    const b1 = 1 / beta / dt / dt, b2 = 1 / beta / dt, b3 = (1 - 2 * beta) * c / beta;
    const b4 = gamma / beta / dt, b5 = gamma / beta - 1, b6 = (gamma - 2 * beta) * c / beta * dt;
    const n = this.nfree;
    const { M, m1x, m1y } = this.massMatrix(o.g);
    const r = o.dir === "y" ? m1y : m1x;
    const K = bandCreate(n, this.band); this.assembleK(K, true);
    const [ra, rb] = o.rayleigh ?? [0, 0], hasC = ra !== 0 || rb !== 0;
    const C = bandCreate(n, this.band);
    if (hasC) for (let k = 0; k < C.a.length; k++) C.a[k] = ra * M.a[k] + rb * K.a[k];
    const Kef = bandCreate(n, this.band);
    for (let k = 0; k < Kef.a.length; k++) Kef.a[k] = b1 * M.a[k] + (1 + alpha) * (b4 * C.a[k] + K.a[k]);
    if (!bandFactor(Kef)) throw new Error("K efectiva singular");
    const ag = typeof o.accel === "function" ? o.accel : historyFn(o.accel);
    const nst = Math.round(o.tEnd / dt);
    let u = new Float64Array(n), v = new Float64Array(n), a = new Float64Array(n);
    const R = new Float64Array(n), w1 = new Float64Array(n), w2 = new Float64Array(n), u1 = new Float64Array(n);
    // a0 = M⁻¹(F0 − C v0 − K u0) = M⁻¹·(−M·1·a_g(0)) → −1·a_g(0) en los gdl de la dirección (0 si a_g(0) = 0)
    const ag0 = ag(0);
    if (ag0 !== 0) { const Mf = bandCreate(n, this.band); Mf.a.set(M.a); bandFactor(Mf); for (let k = 0; k < n; k++) w1[k] = -r[k] * ag0; bandSolve(Mf, w1, a); }
    const watch = (o.watch ?? []).map((node) => ({ node, ux: new Float64Array(nst + 1), uy: new Float64Array(nst + 1), ax: new Float64Array(nst + 1), ay: new Float64Array(nst + 1) }));
    const tt = new Float64Array(nst + 1), umaxAbs = new Float64Array(this.ndof);
    const rec = (s: number) => {
      tt[s] = s * dt;
      for (const h of watch) {
        const kx = this.map[2 * h.node], ky = this.map[2 * h.node + 1];
        h.ux[s] = kx >= 0 ? u[kx] : 0; h.uy[s] = ky >= 0 ? u[ky] : 0; h.ax[s] = kx >= 0 ? a[kx] : 0; h.ay[s] = ky >= 0 ? a[ky] : 0;
      }
      for (let d = 0; d < this.ndof; d++) { const k = this.map[d]; if (k >= 0 && Math.abs(u[k]) > umaxAbs[d]) umaxAbs[d] = Math.abs(u[k]); }
      const quiere = stressSet.has(s) || !!stressMax || !!o.onStep;
      if (!quiere) return;
      this.scatter(u, uf);
      if (o.onStep) { this.scatter(v, vf); o.onStep(s, s * dt, uf, vf); }
      if (stressSet.has(s) || stressMax) {
        const sg = this.elasticStress(uf);
        if (stressSet.has(s)) stress.set(s, sg);
        if (stressMax) for (let i = 0; i < sg.length; i++) if (Math.abs(sg[i]) > stressMax[i]) stressMax[i] = Math.abs(sg[i]);
      }
    };
    const stressSet = new Set(o.stressAt ?? []), stress = new Map<number, Float64Array>();
    const stressMax = o.stressEnvelope ? new Float64Array(this.ne * NG * 4) : undefined;
    const uf = new Float64Array(this.ndof), vf = new Float64Array(this.ndof);
    rec(0);
    let Fprev = ag0;
    for (let s = 1; s <= nst; s++) {
      const agN = ag(s * dt);
      // R = (1+α)F₁ − αF₀ + α(C v + K u) + M(b1 u + b2 v + b3 a) + (1+α)C(b4 u + b5 v + b6 a)
      for (let k = 0; k < n; k++) w1[k] = b1 * u[k] + b2 * v[k] + b3 * a[k];
      bandMul(M, w1, R);
      for (let k = 0; k < n; k++) R[k] += -r[k] * ((1 + alpha) * agN - alpha * Fprev);
      if (hasC) {
        for (let k = 0; k < n; k++) w1[k] = (1 + alpha) * (b4 * u[k] + b5 * v[k] + b6 * a[k]) + alpha * v[k];
        bandMul(C, w1, w2); for (let k = 0; k < n; k++) R[k] += w2[k];
      }
      if (alpha !== 0) { bandMul(K, u, w2); for (let k = 0; k < n; k++) R[k] += alpha * w2[k]; }
      bandSolve(Kef, R, u1);
      for (let k = 0; k < n; k++) {
        const a1 = b1 * (u1[k] - u[k]) - b2 * v[k] - b3 * a[k];
        v[k] += dt * ((1 - gamma) * a[k] + gamma * a1);
        a[k] = a1;
      }
      u.set(u1); Fprev = agN;
      rec(s);
    }
    const sec = (performance.now() - t0) / 1000;
    this.log(`DINÁMICO lineal: Newmark β=${beta} γ=${gamma} α=${alpha}, Δt=${dt} s, ${nst} pasos, b1..b6 = ${[b1, b2, b3, b4, b5, b6].map((x) => +x.toPrecision(12)).join(" ")} [${sec.toFixed(2)} s]`);
    return { t: tt, coef: { b1, b2, b3, b4, b5, b6, beta, gamma, alpha }, hist: watch, u: this.scatter(u), umaxAbs, seconds: sec,
      ...(stressSet.size ? { stress } : {}), ...(stressMax ? { stressMax } : {}) };
  }

  /** Respuesta en el tiempo NO LINEAL (Mohr-Coulomb) al movimiento de la base. Reglas de FRGeoFEM 2024, todas comprobadas
   *  contra el solver corriendo (Frida + comparación de u por nudo):
   *   · HHT-α con γ = ½ − α, β = (1−α)²/4 (α sale de alpha_dyn; el β/γ del GUI el solver los IGNORA); (1+α) pesa K, C y la carga.
   *   · u relativo a la base; la base lleva aceleración impuesta, velocidad V por Newmark SIN pesar y a₀ = 0.
   *   · Rayleigh C = a·M + b·K elástica(Edyn) y la parte de masa actúa sobre la velocidad TOTAL: fuerza extra −C·r·V (r = M·1).
   *   · Edyn en K, M, retorno y tangente del dinámico (el estático usa E).
   *   · Retorno MC multisuperficie con ys_tolerance ABSOLUTA (GeoFem.ysTol) y tangente de GEO5 (principales de la σ DEVUELTA),
   *     que arranca ELÁSTICA en cada paso (flags limpios) y se rehace en cada iteración; σ se actualiza por iteración.
   *   · Búsqueda lineal (FUN_00403da0): g_LS = F_ext − F_int(u+η·du) con la inercia y el amortiguamiento CONGELADOS en η=0;
   *     si |g(η)|/|g(0)| > ls_tol: η ← η·e0/(e0−e1) (e = g·du), recortado a [η_min, η_max]; UNA actualización por llamada. */
  dynamicNL(o: DynNLOptions): DynNLResult {
    const t0c = performance.now();
    const alpha = o.alpha ?? 0;
    const beta = o.beta ?? (1 - alpha) ** 2 / 4, gamma = o.gamma ?? 0.5 - alpha;
    const dtN = o.dt, ndof = this.ndof, n = this.nfree;
    const nst = Math.round(o.tEnd / dtN);
    const times = new Float64Array(nst + 1); times[0] = o.t0 ?? 0; for (let k = 1; k <= nst; k++) times[k] = k * dtN;
    const ag = typeof o.accel === "function" ? o.accel : historyFn(o.accel);
    const acc = new Float64Array(nst + 1); for (let k = 1; k <= nst; k++) acc[k] = ag(times[k]);   // acc[0] = 0 (a₀ = 0, como GEO5)
    const V = new Float64Array(nst + 1);                                                              // velocidad de la base (Newmark sin pesar)
    { let ug = 0, vg = 0, ag_ = 0; for (let k = 1; k <= nst; k++) { const dt = times[k] - times[k - 1]; const ut = ug + dt * vg + dt * dt * (0.5 - beta) * ag_, vt = vg + dt * (1 - gamma) * ag_; ag_ = acc[k]; ug = ut + beta * dt * dt * ag_; vg = vt + gamma * dt * ag_; V[k] = vg; } }
    const sig0 = o.sig0 ?? this.elasticStress(this.elasticSolve(this.Fg2));   // ANTES de cambiar a Edyn
    // constitutivo dinámico (Edyn)
    const D4s = this.D4.slice(), Dis = this.Dinv.slice(), mcps = this.mcp.slice(), SIGs = Float64Array.from(this.SIG), EPLs = Float64Array.from(this.EPL), DEPs = Float64Array.from(this.DEP), hs = Uint8Array.from(this.hasDep);
    const gz = GeoFem.gDesempateZ, gxy = GeoFem.gEmpateXY;
    try {
      for (let mm = 0; mm < this.MAT.length; mm++) {
        const E = o.edyn?.[mm] ?? this.MAT[mm][0], nu = this.MAT[mm][1], f = E / ((1 + nu) * (1 - 2 * nu)), D = new Float64Array(16);
        D[0] = f * (1 - nu); D[1] = f * nu; D[2] = f * nu; D[4] = f * nu; D[5] = f * (1 - nu); D[6] = f * nu; D[8] = f * nu; D[9] = f * nu; D[10] = f * (1 - nu); D[15] = f * (1 - 2 * nu) / 2;
        this.D4[mm + 1] = D; this.Dinv[mm + 1] = inv4(D);
        const phi = this.MAT[mm][2] * Math.PI / 180;
        this.mcp[mm + 1] = [phi, this.MAT[mm][3], Math.min(this.MAT[mm][5] * Math.PI / 180, phi)];
      }
      const ab: [number, number][] = []; for (let mm = 0; mm < this.MAT.length; mm++) ab[mm + 1] = [0, 1e30];   // sin Drucker-Prager: solo MC (MODEL=1) o elástico
      GeoFem.gDesempateZ = false; GeoFem.gEmpateXY = true;
      const { M, m1x, m1y } = this.massMatrix(o.g, o.rho);
      const r = o.dir === "y" ? m1y : m1x;
      // Rayleigh POR MATERIAL (alpha_c, beta_c del InputFile): C = Σ_e (a_m·M_e + b_m·K_e,elástica Edyn). Cr = Σ a_m·(M_m·1): fila completa (con los fijos)
      const rayMat = o.rayleighMat ?? (o.rayleigh ? this.MAT.map(() => o.rayleigh as [number, number]) : null);
      const hasC = !!rayMat && rayMat.some(([x, y]) => x !== 0 || y !== 0);
      const C = bandCreate(n, this.band), Cr = new Float64Array(n);
      if (hasC) {
        const rhoB = this.MAT.map((m, j) => o.rho?.[j] ?? m[4] / (o.g ?? 9.80665));
        for (let mm = 0; mm < this.MAT.length; mm++) {
          const [am, bm] = rayMat![mm]; if (am === 0 && bm === 0) continue;
          const mats = this.massMatrix(o.g, rhoB.map((x, j) => (j === mm ? x : 0)));
          const saved = this.D4.slice(); for (let j = 0; j < this.MAT.length; j++) if (j !== mm) this.D4[j + 1] = new Float64Array(16);
          const Km = bandCreate(n, this.band); this.assembleK(Km, true); for (let j = 0; j < saved.length; j++) this.D4[j] = saved[j];
          for (let q = 0; q < C.a.length; q++) C.a[q] += am * mats.M.a[q] + bm * Km.a[q];
          const rm = o.dir === "y" ? mats.m1y : mats.m1x; for (let i = 0; i < n; i++) Cr[i] += am * rm[i];
        }
      }
      const lsOn = o.ls?.on ?? true, lsTol = o.ls?.tol ?? 0.8, etaMin = o.ls?.etaMin ?? 0.1, etaMax = o.ls?.etaMax ?? 1;
      const tolN = o.tolN ?? 1e-11, maxit = o.maxit ?? 100;
      this.SIG.set(sig0); this.EPL.fill(0); this.hasDep.fill(0);
      const Fi = new Float64Array(ndof), du_f = new Float64Array(ndof), tmp = new Float64Array(n);
      const fintFree = (out: Float64Array): void => { this.fintSig(Fi); this.gather(Fi, null, out); };
      const f0 = new Float64Array(n); fintFree(f0);
      const fde = new Float64Array(n);                                 // F_int(σ guardada) − F_int(σ₀)
      const u = new Float64Array(n), v = new Float64Array(n), a = new Float64Array(n);
      const Fk = (k: number, i: number) => -r[i] * acc[k] - Cr[i] * V[k];   // F = −M·1·a_g − C·1·V  (K·1 = 0)
      const Kef = bandCreate(n, this.band);
      const iters: number[] = [0], etas: number[][] = [[]];
      const watch = (o.watch ?? []).map((node) => ({ node, ux: new Float64Array(nst + 1), uy: new Float64Array(nst + 1), ax: new Float64Array(nst + 1), ay: new Float64Array(nst + 1) }));
      const umaxAbs = new Float64Array(ndof);
      const rec = (s: number) => {
        for (const h of watch) { const kx = this.map[2 * h.node], ky = this.map[2 * h.node + 1]; h.ux[s] = kx >= 0 ? u[kx] : 0; h.uy[s] = ky >= 0 ? u[ky] : 0; h.ax[s] = kx >= 0 ? a[kx] : 0; h.ay[s] = ky >= 0 ? a[ky] : 0; }
        for (let d = 0; d < ndof; d++) { const k = this.map[d]; if (k >= 0 && Math.abs(u[k]) > umaxAbs[d]) umaxAbs[d] = Math.abs(u[k]); }
        if (o.onStep) o.onStep(s, times[s], this.scatter(u), this.scatter(v));
      };
      rec(0);
      const ut = new Float64Array(n), vt = new Float64Array(n), rhs = new Float64Array(n), uk = new Float64Array(n), Rr = new Float64Array(n), du = new Float64Array(n);
      const w1 = new Float64Array(n), w2 = new Float64Array(n), w3 = new Float64Array(n), gt = new Float64Array(n), Mdu = new Float64Array(n);
      for (let k = 1; k <= nst; k++) {
        const dt = times[k] - times[k - 1], b1 = 1 / (beta * dt * dt), b4 = gamma / (beta * dt);
        for (let i = 0; i < n; i++) { ut[i] = u[i] + dt * v[i] + dt * dt * (0.5 - beta) * a[i]; vt[i] = v[i] + dt * (1 - gamma) * a[i]; }
        // rhs_c = (1+α)F(k) − αF(k−1) + α(C v + F_int,n)
        if (hasC) bandMul(C, v, w1); else w1.fill(0);
        let rmax = 0;
        for (let i = 0; i < n; i++) { rhs[i] = (1 + alpha) * Fk(k, i) - alpha * Fk(k - 1, i) + alpha * (w1[i] + fde[i]); rmax = Math.max(rmax, Math.abs(rhs[i])); }
        uk.set(u); this.hasDep.fill(0);                               // flags limpios: la tangente de la 1.ª iteración es elástica
        // R = M·an + (1+α)(C·vn + fde) − rhs, con an = (uk−ut)·b1 y vn = vt + γ·dt·an
        const residuo = (ukv: Float64Array, fdev: Float64Array, out: Float64Array): void => {
          for (let i = 0; i < n; i++) w1[i] = (ukv[i] - ut[i]) * b1;
          bandMul(M, w1, w2);
          if (hasC) { for (let i = 0; i < n; i++) w1[i] = vt[i] + gamma * dt * w1[i]; bandMul(C, w1, w3); } else w3.fill(0);
          for (let i = 0; i < n; i++) out[i] = w2[i] + (1 + alpha) * (w3[i] + fdev[i]) - rhs[i];
        };
        const etaK: number[] = []; let it = 0;
        for (; it < maxit; it++) {
          residuo(uk, fde, Rr);
          let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(Rr[i]));
          if (mx < tolN * Math.max(1, rmax)) break;
          this.assembleK(this.Kt, false);
          for (let q = 0; q < Kef.a.length; q++) Kef.a[q] = b1 * M.a[q] + (1 + alpha) * ((hasC ? b4 * C.a[q] : 0) + this.Kt.a[q]);
          Kef.factored = false; if (!bandFactor(Kef)) throw new Error("K efectiva singular en el paso " + k);
          bandSolve(Kef, Rr, du); for (let i = 0; i < n; i++) du[i] = -du[i];
          let eta = 1;
          if (lsOn) {
            let gn0 = 0, s0 = 0; for (let i = 0; i < n; i++) { gn0 += Rr[i] * Rr[i]; s0 += du[i] * Rr[i]; } gn0 = Math.sqrt(gn0);
            // parte de R que varía con η por la inercia y el amortiguamiento: se resta (queda CONGELADA en η=0)
            bandMul(M, du, w1); if (hasC) bandMul(C, du, w2);
            for (let i = 0; i < n; i++) Mdu[i] = b1 * w1[i] + (hasC ? (1 + alpha) * b4 * w2[i] : 0);
            for (let i = 0; i < n; i++) w1[i] = uk[i] + du[i];            // η = 1
            this.scatter(du, du_f); this.assembleInc(du_f, ab, false, Fi); this.gather(Fi, null, tmp);
            for (let i = 0; i < n; i++) tmp[i] -= f0[i];
            residuo(w1, tmp, gt); let gn1 = 0, s1 = 0; for (let i = 0; i < n; i++) { gt[i] -= Mdu[i]; gn1 += gt[i] * gt[i]; s1 += du[i] * gt[i]; } gn1 = Math.sqrt(gn1);
            if (gn1 / gn0 > lsTol && gn0 > 1e-12 && Math.abs(s0 - s1) > 1e-12) {
              const en = s0 / (s0 - s1);
              eta = en < etaMin ? etaMin : en >= etaMax ? etaMax : en;
            }
          }
          etaK.push(eta);
          for (let i = 0; i < n; i++) w1[i] = eta * du[i];
          this.scatter(w1, du_f); this.assembleInc(du_f, ab, true, Fi);   // σ guardada ← retorno(σ + De·B·η·du); DEP de esta iteración
          fintFree(tmp); for (let i = 0; i < n; i++) fde[i] = tmp[i] - f0[i];
          for (let i = 0; i < n; i++) uk[i] += w1[i];
        }
        if (it >= maxit) this.log(`  dynamicNL: paso ${k} no converge en ${maxit} iteraciones`);
        iters.push(it); etas.push(etaK);
        for (let i = 0; i < n; i++) { const an = (uk[i] - ut[i]) * b1; v[i] = vt[i] + gamma * dt * an; a[i] = an; u[i] = uk[i]; }
        rec(k);
      }
      const sec = (performance.now() - t0c) / 1000;
      this.log(`DINÁMICO no lineal (MC GEO5): HHT β=${beta} γ=${gamma} α=${alpha}, ${nst} pasos, ${iters.reduce((x, y) => x + y, 0)} iteraciones [${sec.toFixed(2)} s]`);
      return { t: times, coef: { b1: 1 / (beta * dtN * dtN), b2: 1 / (beta * dtN), b3: 0, b4: gamma / (beta * dtN), b5: 0, b6: 0, beta, gamma, alpha }, hist: watch, u: this.scatter(u), umaxAbs, seconds: sec, iters, etas, etaMin: Float64Array.from(etas.map((e) => e.reduce((m, x) => Math.min(m, x), 1))), sig: Float64Array.from(this.SIG) };
    } finally {
      for (let i = 0; i < D4s.length; i++) { this.D4[i] = D4s[i]; this.Dinv[i] = Dis[i]; }
      this.mcp = mcps; this.SIG.set(SIGs); this.EPL.set(EPLs); this.DEP.set(DEPs); this.hasDep.set(hs);
      GeoFem.gDesempateZ = gz; GeoFem.gEmpateXY = gxy;
    }
  }

  /** σ ELÁSTICA por punto de Gauss (ngp·4: xx yy zz xy) para u en gdl completos: σ = De·B·u con las MISMAS B y De que el
   *  estático (es el retorno de assembleInc cuando no hay plasticidad, desde σ₀ = 0). */
  elasticStress(u: ArrayLike<number>): Float64Array {
    const out = new Float64Array(this.ne * NG * 4), deps = new Float64Array(4);
    for (let e = 0; e < this.ne; e++) {
      const De = this.D4[this.EMAT[e]];
      for (let q = 0; q < NG; q++) {
        const kk = e * NG + q, B = this.Bc.subarray(kk * 36, kk * 36 + 36);
        let e0 = 0, e1 = 0, e2 = 0;
        for (let c = 0; c < 12; c++) { const v = u[this.edof[e * 12 + c]]; e0 += B[c] * v; e1 += B[12 + c] * v; e2 += B[24 + c] * v; }
        deps[0] = e0; deps[1] = e1; deps[2] = 0; deps[3] = e2;
        for (let i = 0; i < 4; i++) { let s = 0; for (let j = 0; j < 4; j++) s += De[i * 4 + j] * deps[j]; out[kk * 4 + i] = s; }
      }
    }
    return out;
  }

  /** Fuerzas nodales internas ∫Bᵀσ dA (gdl completos) de los elementos `elems` para u (σ = elasticStress). Es lo que Abaqus
   *  llama NFORC sumado sobre esos elementos. */
  elasticNodalForces(u: ArrayLike<number>, elems: number[]): Float64Array {
    const F = new Float64Array(this.ndof), deps = new Float64Array(4), sg = new Float64Array(4);
    for (const e of elems) {
      const De = this.D4[this.EMAT[e]];
      for (let q = 0; q < NG; q++) {
        const kk = e * NG + q, B = this.Bc.subarray(kk * 36, kk * 36 + 36);
        let e0 = 0, e1 = 0, e2 = 0;
        for (let c = 0; c < 12; c++) { const v = u[this.edof[e * 12 + c]]; e0 += B[c] * v; e1 += B[12 + c] * v; e2 += B[24 + c] * v; }
        deps[0] = e0; deps[1] = e1; deps[2] = 0; deps[3] = e2;
        for (let i = 0; i < 4; i++) { let s = 0; for (let j = 0; j < 4; j++) s += De[i * 4 + j] * deps[j]; sg[i] = s; }
        const w = this.dJw[kk];
        for (let c = 0; c < 12; c++) F[this.edof[e * 12 + c]] += (B[c] * sg[0] + B[12 + c] * sg[1] + B[24 + c] * sg[3]) * w;
      }
    }
    return F;
  }

  /** u = K_el⁻¹·F (lineal elástico, gdl completos; respeta fijos y ataduras). */
  elasticSolve(F: ArrayLike<number>): Float64Array {
    const rhs = new Float64Array(this.nfree), x = new Float64Array(this.nfree);
    this.gather(F, null, rhs); bandSolve(this.Kel, rhs, x);
    return this.scatter(x);
  }

  setLog(log: Log): void { this.log = log; }

  /** Corre las etapas pedidas del modelo (cada una independiente: cargas según `stages[i].loads`).
   *  φ y c se leen de m.MAT en cada corrida (sliders); E, ν y γ requieren un GeoFem nuevo. */
  run(m: GeoModel, stageIdx: number[] = m.stages.map((_, i) => i), onStage?: (r: StageResult, index: number) => void): StageResult[] {
    if (m.staged) return this.runStaged(m, onStage);
    const t0 = performance.now();
    this.MAT = m.MAT;
    this.model = m.MODEL ?? []; this.setSrm(m.srmContinua);
    this.rigid = m.RIGID ?? (m.MATNAMES ?? []).map((n) => /muro|hormig|concret|wall/i.test(n));
    const results: StageResult[] = [];
    // Con sliders de γ la gravedad de la fixture ya no vale: se usa la recalculada (N·ρ·detJ·w por
    // punto de Gauss, la misma cuenta que comprueba la fixture en el constructor).
    const LOADS: Record<string, number[] | Float64Array> = { ...(m.loads || {}), Fg: m.agua ? fgConAgua(m) : m.recomputeGravity ? this.Fg2 : m.Fg, Fs: m.Fs, Fa: m.Fa };
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

/** Rayleigh C = a·M + b·K con amortiguamiento ξ en ω_a y ω_b (manual GEO5 ec. 17.121-17.126):
 *  a = 2ξ·ω_a·ω_b/(ω_a+ω_b), b = 2ξ/(ω_a+ω_b). */
export function rayleighCoef(xi: number, wa: number, wb: number): [number, number] {
  return [2 * xi * wa * wb / (wa + wb), 2 * xi / (wa + wb)];
}

/** a_g(t) desde pares [t0,a0,t1,a1,…] (el `history` de GEO5), interpolación lineal; 0 fuera del registro. */
export function historyFn(h: number[]): (t: number) => number {
  if (h.length % 2) throw new Error("acelerograma: solo número par de valores (pares t, a)");
  const n = h.length / 2;
  return (t) => {
    if (n === 0 || t < h[0] || t > h[2 * (n - 1)]) return 0;
    for (let i = 1; i < n; i++) if (t <= h[2 * i]) { const ta = h[2 * i - 2], tb = h[2 * i]; return tb > ta ? h[2 * i - 1] + (h[2 * i + 1] - h[2 * i - 1]) * (t - ta) / (tb - ta) : h[2 * i + 1]; }
    return h[2 * n - 1];
  };
}

/** Problema generalizado pequeño A·z = λ·B·z (A simétrica, B SPD): Cholesky B = LLᵀ, Jacobi cíclico sobre
 *  L⁻¹AL⁻ᵀ. Devuelve λ ascendentes y los vectores (columnas de Q, q×q por filas). */
function genEigSym(A: Float64Array, Bm: Float64Array, q: number): [Float64Array, Float64Array] {
  const L = new Float64Array(q * q);
  for (let j = 0; j < q; j++) {
    let s = Bm[j * q + j]; for (let k = 0; k < j; k++) s -= L[j * q + k] ** 2;
    if (!(s > 0)) throw new Error("subespacio: la masa proyectada no es definida positiva");
    L[j * q + j] = Math.sqrt(s);
    for (let i = j + 1; i < q; i++) { let t = Bm[i * q + j]; for (let k = 0; k < j; k++) t -= L[i * q + k] * L[j * q + k]; L[i * q + j] = t / L[j * q + j]; }
  }
  // Li = L⁻¹ (triangular inferior)
  const Li = new Float64Array(q * q);
  for (let j = 0; j < q; j++) { Li[j * q + j] = 1 / L[j * q + j]; for (let i = j + 1; i < q; i++) { let s = 0; for (let k = j; k < i; k++) s -= L[i * q + k] * Li[k * q + j]; Li[i * q + j] = s / L[i * q + i]; } }
  // S = Li·A·Liᵀ
  const T = new Float64Array(q * q), S = new Float64Array(q * q);
  for (let i = 0; i < q; i++) for (let j = 0; j < q; j++) { let s = 0; for (let k = 0; k < q; k++) s += Li[i * q + k] * A[k * q + j]; T[i * q + j] = s; }
  for (let i = 0; i < q; i++) for (let j = 0; j < q; j++) { let s = 0; for (let k = 0; k < q; k++) s += T[i * q + k] * Li[j * q + k]; S[i * q + j] = s; }
  const V = new Float64Array(q * q); for (let i = 0; i < q; i++) V[i * q + i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0, dia = 0;
    for (let i = 0; i < q; i++) for (let j = 0; j < q; j++) if (i !== j) off += S[i * q + j] ** 2; else dia += S[i * q + j] ** 2;
    if (off <= 1e-30 * dia) break;
    for (let p = 0; p < q - 1; p++) for (let r = p + 1; r < q; r++) {
      const apr = S[p * q + r]; if (Math.abs(apr) < 1e-300) continue;
      const th = (S[r * q + r] - S[p * q + p]) / (2 * apr);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
      for (let k = 0; k < q; k++) { const skp = S[k * q + p], skr = S[k * q + r]; S[k * q + p] = cs * skp - sn * skr; S[k * q + r] = sn * skp + cs * skr; }
      for (let k = 0; k < q; k++) { const spk = S[p * q + k], srk = S[r * q + k]; S[p * q + k] = cs * spk - sn * srk; S[r * q + k] = sn * spk + cs * srk; }
      for (let k = 0; k < q; k++) { const vkp = V[k * q + p], vkr = V[k * q + r]; V[k * q + p] = cs * vkp - sn * vkr; V[k * q + r] = sn * vkp + cs * vkr; }
    }
  }
  const idx = Array.from({ length: q }, (_, i) => i).sort((a, b) => S[a * q + a] - S[b * q + b]);
  const ev = new Float64Array(q), Q = new Float64Array(q * q);
  for (let jj = 0; jj < q; jj++) {
    const j = idx[jj]; ev[jj] = S[j * q + j];
    for (let i = 0; i < q; i++) { let s = 0; for (let k = 0; k < q; k++) s += Li[k * q + i] * V[k * q + j]; Q[i * q + jj] = s; }   // z = L⁻ᵀ·v
  }
  return [ev, Q];
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
