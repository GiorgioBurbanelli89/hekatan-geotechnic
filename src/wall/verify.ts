// VERIFICACIÓN DEL MURO DE CONTENCIÓN — el módulo «Cantilever Wall» de GEO5, aparte de GeoFEM.
//
// Qué hace GEO5 en ese módulo (extraído de CantileverWall_5.dll, 10-sep-2026):
//   teorías de empuje  `g5ap_*` (activo) y `g5pp_*` (pasivo): Coulomb, Caqout_Kerisel,
//                      Muller_Breslau, Mazindrani, Absi;  en reposo: Jáky (`TJakyModul`)
//   verificaciones     `Coef_overturning_wall` (vuelco), `Coef_sliding_wall` (deslizamiento),
//                      `Coef_bearingcapacity_wall` (capacidad portante), `AllowableEccentricity`
//                      (+ `AllowableEccentricityType`), `Coef_resist_slip_surface` (estabilidad global)
//   contacto del pie   `Souc_obd_*` / `Souc_troj` = distribución de presión RECTANGULAR o TRIANGULAR
//   dimensionado       `Posouzeni driku - predni/zadni vyztuz` (armadura del fuste), `CB_PosouzVystupkuZdi`,
//                      `TrhlinyMaxSirka_*` (ancho de fisura) → eso es el PASO SIGUIENTE, no está aquí.
//
// Lo que hay aquí es el EQUILIBRIO DEL SÓLIDO RÍGIDO (vuelco, deslizamiento, excentricidad, presión de
// contacto) con el empuje de Coulomb. Eso es terreno firme y es de libro; lo que se copia de GEO5 es
// QUÉ se verifica, con qué teoría y cómo reparte la presión — no se inventa nada de eso.
//
// Diferencia honesta con GeoFEM (el resto del programa): aquí el muro es un CUERPO RÍGIDO y el suelo no
// se modela, solo empuja. En GeoFEM el muro es una región elástica dentro de la malla y el FS sale de
// reducir la resistencia del suelo. Son dos preguntas distintas y las dos hacen falta:
//   verificación → ¿vuelca, desliza, aplasta el terreno, hay que armarlo cómo?
//   GeoFEM       → ¿cuánto se mueve y por dónde falla el conjunto talud + muro?
import { SlopeDef, Wall, effectiveTerrain, interfaceY, wallLevels, wallGround, regionAt, Soil, Pt } from "../model/dsl";

export type TeoriaEmpuje = "coulomb" | "mazindrani" | "reposo";

export type VerifOpts = {
  teoria: TeoriaEmpuje;
  /** fricción trasdós-relleno δ [°]. "auto" = δ = φ del relleno en el plano ficticio del talón (cuña de suelo contra suelo) */
  delta: number | "auto";
  /** talud del relleno β [°] por encima de la coronación (0 = horizontal) */
  beta: number;
  /** sobrecarga en la superficie del relleno [kPa] */
  q: number;
  /** ¿cuenta el empuje pasivo delante de la puntera? GEO5 deja elegirlo (suele reducirse o no contarse) */
  pasivo: boolean;
  /** peso específico del hormigón [kN/m³] */
  gammaC: number;
  /** factores de seguridad exigidos */
  sfVuelco: number; sfDesliz: number; sfPortante: number;
  /** excentricidad admisible como fracción de B (GEO5: `AllowableEccentricity`; 1/3 = el clásico B/6 de la resultante en el núcleo) */
  eAdm: number;
  /** capacidad portante de cálculo del terreno de apoyo [kPa]; 0 = no se verifica (hay que darla, aquí no se calcula) */
  Rd: number;
};

export const VERIF_DEFAULT: Omit<VerifOpts, "q"> = {
  teoria: "coulomb", delta: "auto", beta: 0, pasivo: false, gammaC: 24,
  sfVuelco: 1.5, sfDesliz: 1.5, sfPortante: 1.5, eAdm: 1 / 3, Rd: 0,
};

export type Fuerza = { nombre: string; H: number; V: number; brazoV: number; brazoH: number };
/** `sentido` dice de qué lado está el límite: "min" = el valor tiene que ser MAYOR (los factores de
 *  seguridad), "max" = tiene que ser MENOR (la excentricidad y la presión de contacto). */
export type Chequeo = { nombre: string; valor: number; unidad: string; limite: number; sentido: "min" | "max"; ok: boolean; formula: string; detalle: string };
export type VerifResult = {
  geom: { B: number; Hf: number; Htot: number; xTalon: number };
  suelos: { relleno: Soil; base: Soil };
  K: { Ka: number; delta: number; Kp?: number };
  /** sobrecarga que se ha usado [kPa] (la de la etapa, o la que se pasó a mano) */
  q: number;
  fuerzas: Fuerza[];
  N: number; Hd: number; Mest: number; Mdes: number;
  e: number; sigma: { max: number; min: number; reparto: "rectangular" | "triangular" };
  chequeos: Chequeo[];
  avisos: string[];
};

const rad = (g: number) => (g * Math.PI) / 180;

/** COULOMB activo. α = inclinación del trasdós respecto a la VERTICAL (0 = trasdós vertical, el caso del
 *  plano ficticio por el extremo del talón), β = talud del relleno, δ = fricción trasdós-relleno. */
export function kaCoulomb(phi: number, delta: number, alpha = 0, beta = 0): number {
  const f = rad(phi), d = rad(delta), a = rad(alpha), b = rad(beta);
  const num = Math.cos(f - a) ** 2;
  const r = Math.sqrt(Math.max(0, (Math.sin(f + d) * Math.sin(f - b)) / (Math.cos(a + d) * Math.cos(a - b))));
  const den = Math.cos(a) ** 2 * Math.cos(a + d) * (1 + r) ** 2;
  return den > 1e-12 ? num / den : 0;
}
/** COULOMB pasivo (mismo desarrollo con φ y δ cambiados de signo). */
export function kpCoulomb(phi: number, delta: number, alpha = 0, beta = 0): number {
  const f = rad(phi), d = rad(delta), a = rad(alpha), b = rad(beta);
  const num = Math.cos(f + a) ** 2;
  const r = Math.sqrt(Math.max(0, (Math.sin(f + d) * Math.sin(f + b)) / (Math.cos(a - d) * Math.cos(a - b))));
  const den = Math.cos(a) ** 2 * Math.cos(a - d) * (1 - r) ** 2;
  return den > 1e-12 ? num / den : 0;
}
/** MAZINDRANI (Rankine con el relleno en talud β): el empuje sale paralelo a la superficie del relleno.
 *      Ka = cosβ · (cosβ − √(cos²β − cos²φ)) / (cosβ + √(cos²β − cos²φ))
 *  Con β = 0 se reduce a Rankine: √(1 − cos²φ) = sinφ  →  (1 − sinφ)/(1 + sinφ). */
export function kaMazindrani(phi: number, beta: number): number {
  const cb = Math.cos(rad(beta)), cf = Math.cos(rad(phi));
  const raiz = Math.sqrt(Math.max(0, cb * cb - cf * cf));
  return (cb * (cb - raiz)) / Math.max(cb + raiz, 1e-12);
}
/** JÁKY: empuje en reposo K0 = 1 − sinφ (lo que GEO5 llama `TypVypoctuTlakuVKlidu` con `JakyProgramConst`). */
export const k0Jaky = (phi: number) => 1 - Math.sin(rad(phi));

/** Suelo en un punto del modelo (por regiones, como el resto del programa). */
function suoloEn(def: SlopeDef, p: Pt): Soil {
  const reg = regionAt(def, p[0], p[1]);
  const a = def.assign.find((q) => regionAt(def, q.p[0], q.p[1]) === reg);
  return def.soils.find((s) => s.name === (a?.soil ?? def.soils[0]?.name)) ?? def.soils[0];
}

/** VERIFICACIÓN de un muro del modelo. Todo sale del propio .hgeo: la geometría de la orden `muro`, el
 *  suelo del relleno (detrás del talón), el suelo de apoyo (bajo la zapata) y la sobrecarga de la etapa. */
export function verificarMuro(def: SlopeDef, w: Wall, opts: Partial<VerifOpts> = {}, etapa = 0): VerifResult {
  const o: VerifOpts = { ...VERIF_DEFAULT, q: 0, ...opts };
  const pm = w.pm, z = wallGround(def, w), L = wallLevels(pm, z);
  const B = pm.dedo + pm.fuste + pm.talon;              // ancho de la zapata
  const xTalon = pm.x + pm.fuste + pm.talon;            // extremo del talón (plano ficticio del empuje)
  const x0 = pm.x - pm.dedo;                            // extremo de la puntera: origen de momentos
  const terr = effectiveTerrain(def);
  const zSup = interfaceY(terr, Math.min(xTalon + 0.01, def.margins!.xmax));   // superficie del relleno detrás del talón
  const Htot = zSup - L.zb;                             // altura del plano ficticio, desde la base de la zapata
  const Hf = L.ztop - L.ztf;                            // alto libre del fuste
  const avisos: string[] = [];

  const relleno = suoloEn(def, [xTalon + 0.2, (zSup + L.ztf) / 2]);
  const base = suoloEn(def, [pm.x, L.zb - 0.2]);
  if (!relleno || !base) throw new Error("no hay suelos definidos para verificar el muro");

  // sobrecarga: la q de la etapa que caiga sobre el relleno (detrás del talón), o la que se pase a mano
  let q = o.q;
  if (!q) for (const sc of def.stages[etapa]?.surcharges ?? []) {
    const xa = Math.min(sc.a[0], sc.b[0]), xb = Math.max(sc.a[0], sc.b[0]);
    if (xb > xTalon && xa < def.margins!.xmax) q = Math.max(q, sc.q);
  }

  // ---- empuje sobre el plano ficticio vertical por el extremo del talón (α = 0) ----
  const delta = o.delta === "auto" ? relleno.phi : o.delta;      // suelo contra suelo en el plano ficticio
  const Ka = o.teoria === "reposo" ? k0Jaky(relleno.phi)
    : o.teoria === "mazindrani" ? kaMazindrani(relleno.phi, o.beta)
    : kaCoulomb(relleno.phi, delta, 0, o.beta);
  const dirE = o.teoria === "coulomb" ? rad(delta) : rad(o.beta);  // inclinación del empuje respecto a la horizontal
  // parte del terreno (triangular) y de la sobrecarga (rectangular); la cohesión del relleno NO se cuenta
  // (lado seguro y es lo que se hace en un muro: el relleno se supone granular y drenado)
  const Eg = 0.5 * Ka * relleno.gamma * Htot * Htot;
  const Eq = Ka * q * Htot;
  if (relleno.c > 0) avisos.push(`la cohesión del relleno (c = ${relleno.c} kPa) NO se cuenta en el empuje (lado seguro, como en un muro con relleno granular)`);
  const fuerzas: Fuerza[] = [];
  const push = (nombre: string, H: number, V: number, brazoV: number, brazoH: number) => fuerzas.push({ nombre, H, V, brazoV, brazoH });
  // la componente VERTICAL del empuje va hacia ABAJO (el relleno roza el plano ficticio y tira del muro hacia
  // abajo): suma a N y estabiliza, con el brazo máximo (actúa en el extremo del talón).
  push(`empuje del terreno (Ka = ${Ka.toFixed(4)})`, Eg * Math.cos(dirE), Eg * Math.sin(dirE), xTalon - x0, Htot / 3);
  if (Eq > 0) push(`empuje de la sobrecarga q = ${q} kPa`, Eq * Math.cos(dirE), Eq * Math.sin(dirE), xTalon - x0, Htot / 2);

  // ---- pesos (por metro de muro) ----
  const Wfuste = pm.fuste * Hf * o.gammaC, Wzap = B * pm.zapata * o.gammaC;
  push("peso del fuste", 0, Wfuste, pm.x - x0 + pm.fuste / 2, 0);
  push("peso de la zapata", 0, Wzap, B / 2, 0);
  // relleno sobre el talón, hasta la superficie
  const hTalon = zSup - L.ztf;
  if (pm.talon > 1e-6 && hTalon > 0) {
    const Wrel = pm.talon * hTalon * relleno.gamma;
    push("relleno sobre el talón", 0, Wrel, pm.x - x0 + pm.fuste + pm.talon / 2, 0);
    if (q > 0) push("sobrecarga sobre el talón", 0, q * pm.talon, pm.x - x0 + pm.fuste + pm.talon / 2, 0);
  }
  // suelo sobre la puntera (delante): pesa, y su empuje pasivo es opcional
  const hDedo = z - L.ztf;
  if (pm.dedo > 1e-6 && hDedo > 0) push("suelo sobre la puntera", 0, pm.dedo * hDedo * base.gamma, pm.dedo / 2, 0);

  let Kp: number | undefined;
  if (o.pasivo) {
    const hp = z - L.zb;                                  // profundidad de empotramiento delante
    Kp = kpCoulomb(base.phi, 0, 0, 0);
    const Ep = 0.5 * Kp * base.gamma * hp * hp + 2 * base.c * Math.sqrt(Kp) * hp;
    push(`empuje pasivo delante (Kp = ${Kp.toFixed(3)}, ${hp.toFixed(2)} m)`, -Ep, 0, 0, hp / 3);
  } else avisos.push("el empuje PASIVO delante de la puntera no se cuenta (opción `pasivo=1` para contarlo, como en GEO5)");

  // ---- resultantes y momentos respecto al extremo de la PUNTERA ----
  const N = fuerzas.reduce((s, f) => s + f.V, 0);         // vertical hacia abajo positiva
  const Hd = fuerzas.reduce((s, f) => s + f.H, 0);        // horizontal hacia la puntera positiva (desestabiliza)
  let Mest = 0, Mdes = 0;
  for (const f of fuerzas) {
    const mV = f.V * f.brazoV;                            // vertical × brazo: estabiliza si V>0
    const mH = f.H * f.brazoH;                            // horizontal × brazo: vuelca si H>0
    if (mV >= 0) Mest += mV; else Mdes += -mV;
    if (mH >= 0) Mdes += mH; else Mest += -mH;
  }
  // ---- excentricidad y presión de contacto ----
  const xR = N > 1e-9 ? (Mest - Mdes) / N : 0;            // posición de la resultante desde la puntera
  const e = B / 2 - xR;
  const dentroNucleo = Math.abs(e) <= B / 6 + 1e-12;
  const sMax = N <= 0 ? 0 : dentroNucleo ? (N / B) * (1 + (6 * Math.abs(e)) / B) : (2 * N) / (3 * (B / 2 - Math.abs(e)));
  const sMin = N <= 0 ? 0 : dentroNucleo ? (N / B) * (1 - (6 * Math.abs(e)) / B) : 0;

  // ---- chequeos ----
  const chequeos: Chequeo[] = [];
  const sfV = Mdes > 1e-9 ? Mest / Mdes : Infinity;
  chequeos.push({ nombre: "vuelco", valor: sfV, unidad: "", limite: o.sfVuelco, sentido: "min", ok: sfV >= o.sfVuelco,
    formula: "SF = ΣM_estabilizadores / ΣM_de vuelco (respecto al extremo de la puntera)",
    detalle: `${Mest.toFixed(2)} / ${Mdes.toFixed(2)} kN·m/m` });
  const Rdesl = N * Math.tan(rad(base.phi)) + base.c * B;
  const Epas = -fuerzas.filter((f) => f.H < 0).reduce((s, f) => s + f.H, 0);
  const sfS = Hd > 1e-9 ? (Rdesl + Epas) / Hd : Infinity;
  chequeos.push({ nombre: "deslizamiento", valor: sfS, unidad: "", limite: o.sfDesliz, sentido: "min", ok: sfS >= o.sfDesliz,
    formula: "SF = (N·tanφ_base + c_base·B + E_pasivo) / ΣH",
    detalle: `(${N.toFixed(2)}·tan${base.phi}° + ${base.c}·${B.toFixed(2)}${Epas ? ` + ${Epas.toFixed(2)}` : ""}) / ${Hd.toFixed(2)} kN/m` });
  chequeos.push({ nombre: "excentricidad", valor: Math.abs(e) / B, unidad: "·B", limite: o.eAdm, sentido: "max", ok: Math.abs(e) / B <= o.eAdm,
    formula: "e = B/2 − (ΣM_est − ΣM_des)/N,  |e|/B ≤ admisible",
    detalle: `e = ${e.toFixed(4)} m = B/${(B / Math.max(Math.abs(e), 1e-9)).toFixed(1)} · resultante a ${xR.toFixed(3)} m de la puntera · ${dentroNucleo ? "DENTRO del núcleo (reparto rectangular/trapecial)" : "FUERA del núcleo (reparto TRIANGULAR, la zapata se levanta)"}` });
  if (o.Rd > 0) chequeos.push({ nombre: "capacidad portante", valor: sMax, unidad: "kPa", limite: o.Rd / o.sfPortante, sentido: "max", ok: sMax <= o.Rd / o.sfPortante,
    formula: dentroNucleo ? "σ_max = N/B·(1 + 6e/B)" : "σ_max = 2N / (3·(B/2 − e))   (reparto triangular)",
    detalle: `σ = ${sMin.toFixed(1)} … ${sMax.toFixed(1)} kPa frente a R_d/SF = ${(o.Rd / o.sfPortante).toFixed(1)} kPa` });
  else avisos.push("capacidad portante NO verificada: hace falta dar R_d del terreno de apoyo (aquí no se calcula; en GEO5 sale del módulo Spread Footing)");

  return {
    geom: { B, Hf, Htot, xTalon }, suelos: { relleno, base }, K: { Ka, delta, Kp }, q,
    fuerzas, N, Hd, Mest, Mdes, e, sigma: { max: sMax, min: sMin, reparto: dentroNucleo ? "rectangular" : "triangular" },
    chequeos, avisos,
  };
}
