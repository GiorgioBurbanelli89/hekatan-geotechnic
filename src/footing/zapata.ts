// CIMENTACIONES · ZAPATA AISLADA (programa «Spread Footing» de GEO5 2024).
//
// De dónde sale cada cosa (ver registros/2026-11-08_geotechnic_cimentaciones.md):
//  · BINARIO SpreadFooting_5.dll (RTTI de Delphi): enum TMetodaVypoctuSvisUnosOdvod {Standard, CSN, PN, IS, EC7,
//    NCMA, GB, SNIP}; la lista de la interfaz 2024 añade DK NA, DPWH, Vesic, Meyerhof, DIN 4017, CTE, B1/VM4, SP22.
//  · AYUDA de GEO5 2024 (GEO5_EN.fhl es un PE; las fórmulas son PNG con el LaTeX en el chunk tEXt «MathSource»):
//    «Standard Analysis» (Brinch-Hansen, drenado y no drenado), «Meyerhof», «Vesic», «Effective Area», «Verification of Foundation
//    Eccentricity», «Horizontal Bearing Capacity of Foundation», «Analysis Using the Oedometric Modulus»,
//    «Theory of Structural Strength», «Influence of Foundation Depth…» (κ1), «Overall Settlement and Rotation».
//  · Verificado contra GEO5 2024 corriendo (tests/zapata_geo5.ts): Demo01.gpa y la zapata de Guerra con
//    Standard, Meyerhof y Vesic (R_d, σ, FS, e, b_ef, R_dh a 2 decimales; asiento 1.3 mm, k 0.74).
//  · LITERATURA (no es de GEO5, se marca así en la salida): la presión de contacto sin tracción
//    de la zapata rígida (Navier/núcleo central), el asiento Winkler s = σ/ks y el γ con freático entre el fondo y
//    fondo + B (Das). La homogeneización de Prandtl de GEO5 (suelo estratificado o con agua) NO está extraída.

export type Metodo = "estandar" | "meyerhof" | "vesic";

export interface ZapataDatos {
  unidad: "kN" | "t";           // kN·m·kPa  o  t·m·(t/m²); las fórmulas son homogéneas
  B: number; L: number;          // lados en x y en y [m]
  h: number;                     // canto [m]
  Df: number;                    // profundidad del fondo desde la rasante [m]
  cx: number; cy: number;        // columna [m]
  gc: number;                    // peso específico del hormigón
  gr: number;                    // peso específico del relleno sobre la zapata
  // suelo (uno solo, homogéneo)
  gamma: number; gsat: number; phi: number; c: number; cu: number; drenado: boolean;
  zw: number;                    // profundidad del freático desde la rasante [m]; Infinity = sin agua
  Edef: number; nu: number; m: number;   // módulo de deformación [MPa], Poisson, coef. de resistencia estructural
  Ec: number;                    // módulo del hormigón [MPa] (rigidez relativa k)
  ks: number;                    // módulo de balasto [F/m³] (0 = no)
  // cargas en la cabeza de la zapata (servicio)
  N: number; Mx: number; My: number; Hx: number; Hy: number;
  // exigencias
  FS: number; eAdm: number; betaAdm: number;  // FS vertical, excentricidad relativa admisible, distorsión angular admisible
  metodo: Metodo;
  pesoPropio: boolean;           // sumar zapata + relleno a N (GEO5 lo hace)
  gammaBajo?: number;            // γ bajo el fondo si difiere (p. ej. el γ homogeneizado que imprime GEO5); por defecto = γ
}

export interface Linea { nombre: string; valor: number; unidad: string; fuente: "GEO5" | "literatura" | "dato"; nota?: string }

export interface ZapataResultado {
  V: number; G: number; Z: number; H: number; delta: number;
  ex: number; ey: number; erx: number; ery: number; ert: number;
  bx: number; by: number; bef: number; lef: number; Aef: number;
  sigEf: number;                 // presión uniforme sobre el área efectiva (la que usa GEO5)
  sigMax: number; sigMin: number; Acomp: number;   // presión de contacto lineal sin tracción (literatura)
  mapa: { nx: number; ny: number; p: Float64Array };   // presión en la planta (rejilla de celdas)
  N: { Nq: number; Nc: number; Ng: number };
  f: { sc: number; sq: number; sg: number; dc: number; dq: number; dg: number; ic: number; iq: number; ig: number };
  q0: number; g2: number;
  Rc: number; Rq: number; Rg: number; Rd: number; qadm: number; FS: number;
  Rdh: number; FSh: number;
  asiento: AsientoRes | null;
  winkler: { sMed: number; sMax: number; sMin: number; giro: number } | null;
  beta: number | null;           // distorsión angular (Δs/lado) con el asiento que haya
  lineas: Linea[];
  avisos: string[];
  unidades: { F: string; p: string; g: string };
}

export interface AsientoRes {
  sCar: number; sCen: number; zInf: number; k: number; rigida: boolean; s: number;  // [mm], [m]
  sBx1: number; sBx2: number; sBy1: number; sBy2: number;   // centros de los bordes (x−, x+, y−, y+) [mm]
  giroX: number; giroY: number;   // ‰ (tan·1000)
  perfil: { z: number; ds: number; msor: number }[];      // del punto representativo
}

const R = Math.PI / 180;
const gw = (u: "kN" | "t") => (u === "t" ? 1.0 : 9.81);

/** Δσz bajo la ESQUINA de un rectángulo a×b con carga unitaria (ayuda GEO5 «Increment of Earth Pressure under
 *  Footing», Steinbrenner). Con signo para sumar/restar rectángulos (punto fuera). */
export function Ic(a: number, b: number, z: number): number {
  if (a === 0 || b === 0) return 0;
  const A = Math.abs(a), Bb = Math.abs(b), r = Math.sqrt(A * A + Bb * Bb + z * z);
  const v = (Math.atan(A * Bb / (z * r)) + A * Bb * z / r * (1 / (A * A + z * z) + 1 / (Bb * Bb + z * z))) / (2 * Math.PI);
  return Math.sign(a) * Math.sign(b) * v;
}
/** rectángulo [x0,x1]×[y0,y1] visto desde (px,py) a la profundidad z: cuatro esquinas */
export function Ru(x0: number, x1: number, y0: number, y1: number, px: number, py: number, z: number): number {
  return Ic(x1 - px, y1 - py, z) + Ic(px - x0, y1 - py, z) + Ic(x1 - px, py - y0, z) + Ic(px - x0, py - y0, z);
}
/** carga triangular (0 en un borde, 1 en el otro) sobre l×b (b = lado en que crece): bajo la esquina del lado 0 y del máximo */
export function T0(l: number, b: number, z: number): number {
  const r = Math.sqrt(l * l + b * b + z * z), rl = Math.sqrt(l * l + z * z);
  return (l * b * z / (r * (z * z + b * b)) + l * z / (b * r) * (r - rl) / rl) / (2 * Math.PI);
}
export function Tm(l: number, b: number, z: number): number {
  const r = Math.sqrt(l * l + b * b + z * z), rl = Math.sqrt(l * l + z * z);
  return (Math.atan(l * b / (z * r)) + l * z / (l * l + z * z) * (r - rl) / b) / (2 * Math.PI);
}

/** Presión de contacto de la zapata RÍGIDA sin tracción (plano p = a + b·x + c·y, solo donde p > 0) por iteración
 *  sobre una rejilla de celdas. Equilibra V, V·ex, V·ey. Literatura (Navier + núcleo central; fuera del núcleo la
 *  parte traccionada se despega). */
export function contacto(B: number, L: number, V: number, ex: number, ey: number, n = 80) {
  const nx = n, ny = n, dx = B / nx, dy = L / ny, dA = dx * dy;
  const xs = new Float64Array(nx), ys = new Float64Array(ny);
  for (let i = 0; i < nx; i++) xs[i] = -B / 2 + (i + 0.5) * dx;
  for (let j = 0; j < ny; j++) ys[j] = -L / 2 + (j + 0.5) * dy;
  // arranque: Navier en toda el área
  let a = V / (B * L), b = V * ex / (L * B ** 3 / 12), c = V * ey / (B * L ** 3 / 12);
  const p = new Float64Array(nx * ny);
  for (let it = 0; it < 200; it++) {
    // momentos de área de la zona comprimida (p > 0 con el plano actual)
    let S0 = 0, Sx = 0, Sy = 0, Sxx = 0, Syy = 0, Sxy = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = xs[i], y = ys[j];
      if (a + b * x + c * y > 0 || it === 0) { S0 += dA; Sx += x * dA; Sy += y * dA; Sxx += x * x * dA; Syy += y * y * dA; Sxy += x * y * dA; }
    }
    // [S0 Sx Sy; Sx Sxx Sxy; Sy Sxy Syy]·[a b c] = [V, V·ex, V·ey]
    const M = [[S0, Sx, Sy], [Sx, Sxx, Sxy], [Sy, Sxy, Syy]], r = [V, V * ex, V * ey];
    const sol = resolver3(M, r);
    const cambio = Math.abs(sol[0] - a) + Math.abs(sol[1] - b) * B + Math.abs(sol[2] - c) * L;
    a = sol[0]; b = sol[1]; c = sol[2];
    if (it > 0 && cambio < 1e-12 * Math.abs(a)) break;
  }
  let pmax = -Infinity, pmin = Infinity, Ac = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = Math.max(0, a + b * xs[i] + c * ys[j]); p[j * nx + i] = v; if (v > 0) Ac += dA;
  }
  // extremos en las esquinas del plano (exactos, no en el centro de la celda)
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const v = a + b * sx * B / 2 + c * sy * L / 2; pmax = Math.max(pmax, v); pmin = Math.min(pmin, v); }
  return { a, b, c, pmax, pmin: Math.max(0, pmin), Acomp: Ac, nx, ny, p };
}
function resolver3(M: number[][], r: number[]): number[] {
  const A = M.map((f, i) => [...f, r[i]]);
  for (let k = 0; k < 3; k++) {
    let piv = k; for (let i = k + 1; i < 3; i++) if (Math.abs(A[i][k]) > Math.abs(A[piv][k])) piv = i;
    [A[k], A[piv]] = [A[piv], A[k]];
    for (let i = 0; i < 3; i++) if (i !== k) { const f = A[i][k] / A[k][k]; for (let j = k; j < 4; j++) A[i][j] -= f * A[k][j]; }
  }
  return [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]];
}

export function calcularZapata(d: ZapataDatos): ZapataResultado {
  const av: string[] = [], L_: Linea[] = [];
  const u = d.unidad, F = u, p = u === "t" ? "t/m²" : "kPa", g = u === "t" ? "t/m³" : "kN/m³";
  const yw = gw(u), gsu = Math.max(0, d.gsat - yw);
  // --- cargas en el fondo (GEO5: N + peso de la zapata G + relleno encima Z) ---
  const G = d.pesoPropio ? d.B * d.L * d.h * d.gc : 0;
  const Z = d.pesoPropio ? d.gr * Math.max(0, d.Df - d.h) * (d.B * d.L - d.cx * d.cy) : 0;
  const V = d.N + G + Z;
  // GEO5 «Stress in the Footing Bottom»: e_x = (−My + Hx·t)/V ; e_y = (Mx + Hy·t)/V (columna centrada)
  const ex = (-d.My + d.Hx * d.h) / V, ey = (d.Mx + d.Hy * d.h) / V;
  const erx = Math.abs(ex) / d.B, ery = Math.abs(ey) / d.L, ert = Math.hypot(erx, ery);
  const H = Math.hypot(d.Hx, d.Hy), tD = H / V, delta = Math.atan(tD) / R;
  // --- área efectiva (GEO5 «Effective Area», forma rectangular) ---
  const bx = d.B - 2 * Math.abs(ex), by = d.L - 2 * Math.abs(ey);
  if (bx <= 0 || by <= 0) throw new Error("la resultante cae fuera de la zapata (B − 2e ≤ 0)");
  const bef = Math.min(bx, by), lef = Math.max(bx, by), Aef = bx * by, sigEf = V / Aef;
  // --- presión de contacto lineal sin tracción (literatura) ---
  const ct = contacto(d.B, d.L, V, ex, ey);
  // --- agua: q0 y γ bajo el fondo ---
  let q0: number, g2: number, g1 = d.gamma;
  if (d.zw <= d.Df) {
    q0 = d.gamma * Math.max(0, d.zw) + gsu * (d.Df - Math.max(0, d.zw)); g2 = gsu;
    av.push(`freático sobre el fondo: q₀ con γ' bajo el agua y γ₂ = γ' = ${gsu.toFixed(3)} (GEO5 homogeneiza por la superficie de Prandtl: aquí toda la cuña está bajo el agua y da lo mismo)`);
  } else if (d.zw < d.Df + bef) {
    q0 = d.gamma * d.Df; g2 = gsu + (d.zw - d.Df) / bef * (d.gamma - gsu);
    av.push(`freático entre el fondo y fondo + b_ef: γ₂ interpolado (Das, LITERATURA); GEO5 lo homogeneiza con la superficie de Prandtl (no extraído)`);
  } else { q0 = d.gamma * d.Df; g2 = d.gammaBajo ?? d.gamma; }
  void g1;
  // --- capacidad portante ---
  const f = d.phi * R;
  let Nq = 1, Nc = Math.PI + 2, Ng = 0, sc = 1, sq = 1, sg = 1, dc = 1, dq = 1, dg = 1, ic = 1, iq = 1, ig = 1, Rc = 0, Rq = 0, Rg = 0;
  if (d.drenado) {
    // GEO5 «Standard Analysis» (Brinch-Hansen): Rd = c·Ne·se·de·ie + q0·Nd·sd·dd·id + b/2·γ·Nb·sb·db·ib.
    // «Meyerhof» y «Vesic» de GEO5: «igual que el estándar salvo» los coeficientes de sus páginas de la ayuda.
    Nq = Math.tan(Math.PI / 4 + f / 2) ** 2 * Math.exp(Math.PI * Math.tan(f));
    Nc = f > 0 ? (Nq - 1) / Math.tan(f) : Math.PI + 2;
    const bl = bef / lef, db = d.Df / bef;
    if (d.metodo === "estandar") {
      Ng = 1.5 * (Nq - 1) * Math.tan(f);
      sc = 1 + 0.2 * bl; sq = 1 + bl * Math.sin(f); sg = 1 - 0.3 * bl;
      dc = 1 + 0.1 * Math.sqrt(db); dq = 1 + 0.1 * Math.sqrt(db * Math.sin(2 * f)); dg = 1;
      ic = iq = ig = (1 - tD) ** 2;
    } else if (d.metodo === "meyerhof") {
      const Kp = Math.tan(Math.PI / 4 + f / 2) ** 2;
      Ng = (Nq - 1) * Math.tan(1.4 * f);
      sc = 1 + 0.2 * Kp * bl; sq = sg = d.phi > 10 ? 1 + 0.1 * Kp * bl : 1;
      dc = 1 + 0.2 * db * Math.sqrt(Kp); dq = dg = f > 0 ? 1 + 0.1 * db * Math.sqrt(Kp) : 1;
      const dr = delta * R; ic = iq = (1 - 2 * dr / Math.PI) ** 2; ig = f > 0 ? Math.max(0, 1 - dr / f) ** 2 : 0;
    } else {   // vesic
      Ng = 2 * (Nq + 1) * Math.tan(f);
      sc = 1 + bl * Nq / Nc; sq = 1 + bl * Math.tan(f); sg = 1 - 0.4 * bl;
      const t = db <= 1 ? db : Math.atan(db);
      dc = 1 + 0.4 * t; dq = 1 + 2 * Math.tan(f) * (1 - Math.sin(f)) ** 2 * t; dg = 1;
      const mm = (2 + bl) / (1 + bl);
      if (f > 0) { const tt = H / (V + Aef * d.c / Math.tan(f)); iq = (1 - tt) ** mm; ig = (1 - tt) ** (mm + 1); ic = (iq * Nq - 1) / (Nq - 1); }
      else { ic = 1 - mm * H / (Aef * d.c * Nc); iq = ig = 1; }
    }
    Rc = d.c * Nc * sc * dc * ic; Rq = q0 * Nq * sq * dq * iq; Rg = bef / 2 * g2 * Ng * sg * dg * ig;
  } else {
    // GEO5 «Standard Analysis» no drenado: Rd = (π+2)·cu·sc·dc·ic·bc + q
    sc = 1 + 0.2 * bef / lef; dc = 1 + 0.1 * Math.sqrt(d.Df / bef); ic = (1 - tD) ** 2;
    Nc = Math.PI + 2; Nq = 1; Ng = 0; sq = dq = iq = 1; sg = dg = ig = 1;
    Rc = Nc * d.cu * sc * dc * ic; Rq = q0; Rg = 0;
  }
  const Rd = Rc + Rq + Rg, qadm = Rd / d.FS, FS = Rd / sigEf;
  // --- capacidad horizontal (GEO5 «Horizontal Bearing Capacity»: Rdh = V·tanψ + a·Aef + Spd, Spd en reposo K0 = 1 − sinφ) ---
  const K0 = 1 - Math.sin(f);
  const Spd = d.drenado ? K0 * d.gamma * (d.Df ** 2 - (d.Df - d.h) ** 2) / 2 * d.L : 0;
  const Rdh = (d.drenado ? V * Math.tan(f) + d.c * Aef : d.cu * Aef) + Spd;
  const FSh = H > 0 ? Rdh / H : Infinity;
  // --- asiento (GEO5: módulo edométrico + resistencia estructural + κ1) ---
  let asiento: AsientoRes | null = null;
  if (d.Edef > 0) asiento = asientoGEO5(d, V, ex, ey, yw, gsu);
  // --- Winkler (literatura): s = σ/ks, zapata rígida ---
  let winkler: ZapataResultado["winkler"] = null;
  if (d.ks > 0) {
    const sMed = V / (d.B * d.L) / d.ks * 1000;
    winkler = { sMed, sMax: ct.pmax / d.ks * 1000, sMin: ct.pmin / d.ks * 1000, giro: Math.hypot(ct.b, ct.c) / d.ks * 1000 };
  }
  // distorsión angular: con el asiento de GEO5 si lo hay, si no con Winkler
  let beta: number | null = null;
  if (asiento) beta = Math.max(Math.abs(asiento.giroX), Math.abs(asiento.giroY)) / 1000;
  else if (winkler) beta = winkler.giro / 1000;

  // --- informe ---
  const add = (nombre: string, valor: number, unidad: string, fuente: Linea["fuente"], nota?: string) => L_.push({ nombre, valor, unidad, fuente, nota });
  add("V en el fondo (N + G + Z)", V, F, "GEO5");
  add("e_x", ex, "m", "GEO5"); add("e_y", ey, "m", "GEO5");
  add("excentricidad relativa total e_t", ert, "", "GEO5", `≤ ${d.eAdm}`);
  add("b_ef × l_ef", bef * lef, "m²", "GEO5", `${bef.toFixed(3)} × ${lef.toFixed(3)}`);
  add("σ sobre el área efectiva", sigEf, p, "GEO5");
  add("σ_max contacto (rígida, sin tracción)", ct.pmax, p, "literatura");
  add("σ_min contacto", ct.pmin, p, "literatura");
  add("N_q", Nq, "", "GEO5"); add("N_c", Nc, "", "GEO5"); add("N_γ", Ng, "", "GEO5");
  add("R_d capacidad última", Rd, p, "GEO5");
  add("q_adm = R_d / FS", qadm, p, "GEO5");
  add("FS vertical = R_d / σ", FS, "", "GEO5", `≥ ${d.FS}`);
  add("R_dh deslizamiento", Rdh, F, "GEO5"); add("FS horizontal", FSh, "", "GEO5");
  if (asiento) { add("asiento (GEO5, edométrico)", asiento.s, "mm", "GEO5", asiento.rigida ? "punto característico (rígida)" : "centro (flexible)"); add("zona de influencia", asiento.zInf, "m", "GEO5"); }
  if (winkler) { add("asiento Winkler σ/ks (máx)", winkler.sMax, "mm", "literatura"); add("asiento Winkler (mín)", winkler.sMin, "mm", "literatura"); }
  if (beta != null) add("distorsión angular β", beta, "", asiento ? "GEO5" : "literatura", `≤ 1/${Math.round(1 / d.betaAdm)}`);

  if (ert > d.eAdm) av.push(`excentricidad relativa ${ert.toFixed(3)} > ${d.eAdm}: NO cumple`);
  if (ct.Acomp < d.B * d.L * 0.999) av.push(`la resultante sale del núcleo central: se despega el ${(100 * (1 - ct.Acomp / (d.B * d.L))).toFixed(1)} % de la planta`);
  if (Math.abs(d.Mx) + Math.abs(d.My) > 0) av.push("excentricidad: GEO5 usa el área efectiva (B − 2e); σ_max/σ_min del mapa son la distribución lineal de la zapata rígida (literatura)");
  return {
    V, G, Z, H, delta, ex, ey, erx, ery, ert, bx, by, bef, lef, Aef, sigEf,
    sigMax: ct.pmax, sigMin: ct.pmin, Acomp: ct.Acomp, mapa: { nx: ct.nx, ny: ct.ny, p: ct.p },
    N: { Nq, Nc, Ng }, f: { sc, sq, sg, dc, dq, dg, ic, iq, ig }, q0, g2,
    Rc, Rq, Rg, Rd, qadm, FS, Rdh, FSh, asiento, winkler, beta, lineas: L_, avisos: av,
    unidades: { F, p, g },
  };
}

/** Asiento por el módulo edométrico (ayuda GEO5): s = Σ (Δσz − m·σor)·h / Eoed, Eoed = Edef/β, β = 1 − 2ν²/(1−ν);
 *  Δσz con la profundidad ficticia z_r = κ1·z, κ1 = 1 + 0.35·atan(1.55·d/z); presión neta desde la rasante
 *  (q − γ·d); la zona de influencia acaba donde Δσz = m·σor. Rígida (k > 1) → punto característico (0.37·lado). */
export function asientoGEO5(d: ZapataDatos, V: number, ex: number, ey: number, yw: number, gsu: number): AsientoRes {
  const fE = d.unidad === "t" ? 1000 / 9.80665 : 1000;      // MPa → t/m² o kPa
  const beta = 1 - 2 * d.nu ** 2 / (1 - d.nu), Eoed = d.Edef / beta * fE;
  const sor = (zg: number) => (zg <= d.zw ? d.gamma * zg : d.gamma * Math.max(0, d.zw) + gsu * (zg - Math.max(0, d.zw)));  // desde la rasante
  const qn = V / (d.B * d.L) - d.gamma * d.Df;             // presión neta media
  // presiones de borde (trapecio, flexión compuesta) netas
  const qxM = V / (d.B * d.L) + V * Math.abs(ex) / (d.L * d.B ** 2 / 6) - d.gamma * d.Df;
  const qxm = V / (d.B * d.L) - V * Math.abs(ex) / (d.L * d.B ** 2 / 6) - d.gamma * d.Df;
  const qyM = V / (d.B * d.L) + V * Math.abs(ey) / (d.B * d.L ** 2 / 6) - d.gamma * d.Df;
  const qym = V / (d.B * d.L) - V * Math.abs(ey) / (d.B * d.L ** 2 / 6) - d.gamma * d.Df;
  const k1 = (z: number) => 1 + 0.35 * Math.atan(1.55 * d.Df / z);
  const B2 = d.B / 2, L2 = d.L / 2;
  const unif = (px: number, py: number) => (z: number) => qn * Ru(-B2, B2, -L2, L2, px, py, k1(z) * z);
  // borde x+ (más cargado si ex>0 hacia +x): l = L/2 (a cada lado del punto), b = B (crece en x)
  const bordeX = (mas: boolean) => (z: number) => { const zr = k1(z) * z; return 2 * qxm * Ic(L2, d.B, zr) + 2 * (qxM - qxm) * (mas ? Tm(L2, d.B, zr) : T0(L2, d.B, zr)); };
  const bordeY = (mas: boolean) => (z: number) => { const zr = k1(z) * z; return 2 * qym * Ic(B2, d.L, zr) + 2 * (qyM - qym) * (mas ? Tm(B2, d.L, zr) : T0(B2, d.L, zr)); };
  const integra = (ds: (z: number) => number, guarda = false) => {
    const dz = 0.005; let s = 0, z0 = 0, zInf = 0; const perfil: AsientoRes["perfil"] = [];
    for (let k = 0; k < 20000; k++) {
      let z1 = z0 + dz;
      const f1 = ds(z1) - d.m * sor(z1 + d.Df);
      if (f1 < 0) {   // fin de la zona de influencia dentro de esta capa: bisección (como GEO5)
        let a = z0, b = z1;
        for (let it = 0; it < 50; it++) { const c = (a + b) / 2; if (ds(c) - d.m * sor(c + d.Df) > 0) a = c; else b = c; }
        z1 = (a + b) / 2;
      }
      const zm = (z0 + z1) / 2, g = ds(zm), ms = d.m * sor(zm + d.Df);
      s += Math.max(g - ms, 0) * (z1 - z0) / Eoed;
      if (guarda && k % 10 === 0) perfil.push({ z: zm, ds: g, msor: ms });
      z0 = z1; zInf = z1;
      if (f1 < 0) break;
    }
    return { s: s * 1000, zInf, perfil };
  };
  // rigidez relativa (suelo homogéneo: E_def,av = E_def). GEO5 la evalúa en cada dirección; la zapata es rígida si k > 1
  const kx = d.Ec * d.h ** 3 / (d.Edef * d.B ** 3), ky = d.Ec * d.h ** 3 / (d.Edef * d.L ** 3);
  const k = Math.min(kx, ky), rigida = k > 1;
  const car = integra(unif(0.37 * d.B, 0.37 * d.L), rigida), cen = integra(unif(0, 0), !rigida);
  const sx1 = integra(bordeX(false)).s, sx2 = integra(bordeX(true)).s, sy1 = integra(bordeY(false)).s, sy2 = integra(bordeY(true)).s;
  const rep = rigida ? car : cen;
  return {
    sCar: car.s, sCen: cen.s, zInf: rep.zInf, k, rigida, s: rep.s,
    sBx1: sx1, sBx2: sx2, sBy1: sy1, sBy2: sy2,
    giroX: (sx2 - sx1) / d.B, giroY: (sy2 - sy1) / d.L,   // mm/m = ‰
    perfil: rep.perfil,
  };
}

/** El modelo de ejemplo «zapata_guerra»: Guerra, cap. 5, ej. 1 (zapata 3.45 × 3.45, h 0.45, P 121 t, My 17 t·m,
 *  ks 2920 t/m³). El libro NO da φ, c ni Df: el suelo es EQUIVALENTE (declarado), el que da q_adm ≈ 14 t/m² con FS 3. */
export const ZAPATA_GUERRA: ZapataDatos = {
  unidad: "t", B: 3.45, L: 3.45, h: 0.45, Df: 1.5, cx: 0.45, cy: 0.45, gc: 2.4028, gr: 1.8,
  gamma: 1.8, gsat: 2.0, phi: 22.2, c: 0, cu: 0, drenado: true, zw: Infinity,
  Edef: 89.9, nu: 0.3, m: 0.3, Ec: 23138, ks: 2920,
  N: 121, Mx: 0, My: 17, Hx: 0, Hy: 0,
  FS: 3, eAdm: 0.333, betaAdm: 1 / 500, metodo: "meyerhof", pesoPropio: true,
};
