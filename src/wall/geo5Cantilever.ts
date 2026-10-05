// MURO EN VOLADIZO «tal cual lo hace GEO5» (módulo Cantilever Wall, equilibrio del sólido rígido).
//
// Formas: T (puntera + fuste + talón), L (v1 = 0, sin puntera), cada una con o sin DENTELLÓN en el extremo del
// talón, fuste vertical o con talud en la cara vista. Estático + sismo pseudoestático (Mononobe-Okabe) con kh y kv.
//
// TODO sale de CantileverWall_5.dll 2024 (ensamblado + depuración dinámica con Frida, 5-oct-2026), contrastado con la
// tabla «Verification» de GEO5 en 9 modelos (registros/2026-10-05_geo5_muro_nec15_borrador_mononobe.md):
//
//  · La cara de empuje se parte en CAPAS de arriba abajo: la CARA VIRTUAL (plano que sale del extremo del talón con
//    θ = 45° + φ/2 sobre la horizontal, suelo contra suelo, δ = φ, α = 90° − θ) y la cara vertical del talón
//    (δ de pared-suelo, α = 0) hasta el fondo de la zapata (o del dentellón). Cada capa toma el suelo de su cota.
//  · ESTÁTICO: Δσ = Ka·σv con σv acumulada DESDE ARRIBA.
//  · SÍSMICO (incremento): Δσ = (Kae − Ka)·σv′ con σv′ = (1−kv)·peso del suelo que queda DEBAJO de cada punto
//    (acumulado desde abajo → diagrama en TRIÁNGULO INVERTIDO).
//  · Cada capa es un trapecio: F = (Δσ_arriba + Δσ_abajo)/2 · espesor;  Fx = F·cos(α+δ),  Fz = F·sin(α+δ)  (δ sin recortar).
//  · Kae = Ka(φ,δ,α+ψ,β+ψ)·cos²(α+ψ)/(cos ψ·cos²α),  ψ = atan(kh/(1−kv)),  Ka = Coulomb con la rama de GEO5
//    (0xD9C4C8).  Antes de calcular K, δ se recorta a φ − 1e-4 rad (constante 0xD9D978 del binario).
//  · Punto de aplicación: y = ΣFx_i·y_i/ΣFx_i,  x = ΣFz_i·x_i/ΣFz_i (centroide de cada trapecio).
//  · VUELCO: Mres/Movr respecto del fondo de la ZAPATA en la puntera (y = 0), sin contar el dentellón.
//  · DESLIZAMIENTO: sobre la BASE INCLINADA (del fondo de la puntera al fondo del dentellón, ε = atan(dk/B)):
//      FS = (N·cosε + H·sinε)·tanφb / (H·cosε − N·sinε),  con φb = φ del suelo bajo la base.
//
// Lo que NO está (y no se inventa): sobrecarga, nivel freático, resistencia delante (FF resistance), cohesión,
// repisas (h1, h2, v3), fuste inclinado (z1, k1, z2), dentellón que no esté en el extremo del talón (x3 ≠ 0), capacidad
// portante y armado. Cada uno hay que MEDIRLO en GEO5 antes de añadirlo.

const rad = (g: number) => (g * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
/** recorte de δ cuando δ ≥ φ (0xD9D978 del binario) */
export const EPS_DELTA = 1e-4;

/** Suelo del perfil: `hasta` = profundidad (m desde el terreno) donde termina; el último lleva Infinity. */
export type SueloG5 = { nombre?: string; gamma: number; phi: number; /** δ pared-suelo [°] */ deltaPared: number; hasta: number };
export type DentellonG5 = { x1: number; x2: number; x3: number };
export type MuroG5 = {
  /** coronación del fuste */ k: number; /** altura del fuste */ h: number; /** canto de la zapata */ xx: number;
  /** puntera (0 = muro en L) */ v1: number; /** talón */ v2: number;
  /** talud de la cara vista H:V (0 = vertical) */ s1?: number;
  /** dentellón en el extremo del talón: x1 = espesor de la zapata bajo él, x2 = ancho, x3 = distancia al extremo (solo 0) */
  dent?: DentellonG5;
  gammaC: number;
};
export type SismoG5 = { kh: number; kv: number };

/** Coulomb (rama de GEO5): K = cos²(φ−α)/(cos²α·cos(α+δ)·(1+√R)²), R = max(0, sin(φ+δ)sin(φ−β)/(cos(α+δ)cos(α−β))). Ángulos en rad. */
export function kCoulomb(phi: number, d: number, a: number, b = 0): number {
  const R = Math.max(Math.sin(phi + d) * Math.sin(phi - b) / (Math.cos(a + d) * Math.cos(a - b)), 0);
  return Math.cos(phi - a) ** 2 / (Math.cos(a) ** 2 * Math.cos(a + d) * (1 + Math.sqrt(R)) ** 2);
}
/** Mononobe-Okabe como GEO5: Coulomb con el marco girado ψ, por cos²(α+ψ)/(cos ψ cos²α). */
export function kMO(phi: number, d: number, a: number, psi: number): number {
  return kCoulomb(phi, d, a + psi, psi) * Math.cos(a + psi) ** 2 / (Math.cos(psi) * Math.cos(a) ** 2);
}

type P = [number, number];
function poligono(pts: P[]): { A: number; cx: number; cy: number } {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; const c = x0 * y1 - x1 * y0;
    A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
  }
  A /= 2; return { A: Math.abs(A), cx: cx / (6 * A), cy: cy / (6 * A) };
}
/** recorta un polígono convexo entre dos cotas y (devuelve null si no queda nada) */
function banda(pts: P[], y0: number, y1: number): P[] | null {
  const rec = (poly: P[], f: (p: P) => number): P[] => {
    const out: P[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
    }
    return out;
  };
  const r1 = rec(pts, (p) => p[1] - y0), r2 = rec(r1, (p) => y1 - p[1]);
  return r2.length >= 3 ? r2 : null;
}

export type FuerzaG5 = { nombre: string; Fx: number; Fz: number; x: number; z: number };
export type CapaG5 = { espesor: number; gamma: number; phi: number; delta: number; alfa: number; nombre: string };
export type ResultadoG5 = {
  B: number; Hterreno: number; profTotal: number; theta: number; xv: number; capas: CapaG5[];
  pesoMuro: number; xMuro: number; yMuro: number; pesoCuna: number; xCuna: number; yCuna: number;
  fuerzas: FuerzaG5[];
  estatico: { Fx: number; Fz: number; x: number; y: number };
  sismico: { Fx: number; Fz: number; x: number; y: number };
  Mres: number; Movr: number; Hres: number; Hact: number; N: number; epsBase: number; phiBase: number;
  fsVuelco: number; fsDeslizamiento: number;
};

/** soil en una profundidad (los límites caen en el suelo de ABAJO, como GEO5 con la base en la interfaz) */
function sueloEn(perfil: SueloG5[], prof: number): SueloG5 {
  for (const s of perfil) if (prof < s.hasta - 1e-9) return s;
  return perfil[perfil.length - 1];
}

export function muroGeo5(m: MuroG5, perfil: SueloG5[], sismo: SismoG5, alfaVirtualDeg?: number): ResultadoG5 {
  const { k, h, xx, v1, v2 } = m; const s1 = m.s1 ?? 0;
  const kb = k + (s1 > 0 ? h / s1 : 0);                 // espesor del fuste abajo
  const B = v1 + kb + v2, xt = v1 + kb;                  // ancho de la zapata y cara trasera (vertical)
  const Hter = xx + h;                                   // cota del terreno sobre el fondo de la zapata
  let dk = 0; let zap: P[] = [[0, 0], [B, 0], [B, xx], [0, xx]];
  if (m.dent) {
    if (Math.abs(m.dent.x3) > 1e-9) throw new Error("dentellón con x3 ≠ 0: sin medir en GEO5, no implementado");
    dk = m.dent.x1 - xx; const xa = B - m.dent.x2;
    zap = [[0, 0], [xa, 0], [xa, -dk], [B, -dk], [B, xx], [0, xx]];
  }
  const fus: P[] = [[v1, xx], [xt, xx], [xt, Hter], [xt - k, Hter]];
  const z = poligono(zap), f = poligono(fus);
  const Wz = m.gammaC * z.A, Wf = m.gammaC * f.A, Wm = Wz + Wf;
  const xm = (Wz * z.cx + Wf * f.cx) / Wm, ym = (Wz * z.cy + Wf * f.cy) / Wm;

  const sup = perfil[0];
  const th = rad(45) + rad(sup.phi) / 2;                 // ángulo de la cara virtual sobre la horizontal
  const xv = B - h / Math.tan(th);
  const cuna: P[] = [[xt, xx], [B, xx], [xv, Hter], [xt, Hter]];
  // peso de la cuña por bandas de suelo (profundidad desde el terreno; la cuña llega hasta la profundidad h)
  let Wc = 0, mx = 0, my = 0, d0 = 0;
  for (const s of perfil) {
    if (d0 >= h - 1e-12) break;
    const d1 = Math.min(s.hasta, h);
    const bd = banda(cuna, Hter - d1, Hter - d0);
    if (bd) { const g = poligono(bd); Wc += s.gamma * g.A; mx += s.gamma * g.A * g.cx; my += s.gamma * g.A * g.cy; }
    d0 = d1;
  }
  const xc = mx / Wc, yc = my / Wc;

  // capas de la cara de empuje, de arriba abajo
  const abajo = m.dent ? -dk : 0;                        // cota del fondo de la cara del talón
  const profTotal = Hter - abajo;
  const alfaV = alfaVirtualDeg ?? (90 - deg(th));
  const capas: CapaG5[] = [];
  let z0 = 0;
  const cortes = [h, ...perfil.map((s) => s.hasta).filter((hh) => hh > h && hh < profTotal), profTotal];
  const cortesUnicos = Array.from(new Set(cortes)).sort((a, b) => a - b);
  for (let i = 0; i < cortesUnicos.length; i++) {
    const z1 = cortesUnicos[i], esp = z1 - z0; if (esp <= 1e-12) { z0 = z1; continue; }
    const s = sueloEn(perfil, z0 + 1e-9);
    if (i === 0) capas.push({ espesor: esp, gamma: s.gamma, phi: s.phi, delta: s.phi, alfa: alfaV, nombre: "cara virtual" });
    else capas.push({ espesor: esp, gamma: s.gamma, phi: s.phi, delta: s.deltaPared, alfa: 0, nombre: "cara del talón" });
    z0 = z1;
  }
  const { kh, kv } = sismo;
  const diagrama = (psi: number, desdeAbajo: boolean, escala: number) => {
    const pesos = capas.map((c) => escala * c.espesor * c.gamma);
    const res: { Fx: number; Fz: number; x: number; y: number }[] = [];
    let zz = 0;
    capas.forEach((c, i) => {
      const dKdeg = Math.abs(c.delta - c.phi) < 1e-9 ? c.delta - deg(EPS_DELTA) : c.delta;   // δ recortado SOLO para K
      const ph = rad(c.phi), dK = rad(dKdeg), al = rad(c.alfa);
      let s0: number, s1_: number, dk_: number;
      if (desdeAbajo) { s0 = pesos.slice(i).reduce((a, b) => a + b, 0); s1_ = pesos.slice(i + 1).reduce((a, b) => a + b, 0); dk_ = kMO(ph, dK, al, psi) - kCoulomb(ph, dK, al); }
      else { s0 = pesos.slice(0, i).reduce((a, b) => a + b, 0); s1_ = pesos.slice(0, i + 1).reduce((a, b) => a + b, 0); dk_ = kCoulomb(ph, dK, al); }
      const p0 = dk_ * s0, p1 = dk_ * s1_, ang = rad(c.alfa + c.delta), F = ((p0 + p1) / 2) * c.espesor;
      const zc = p0 + p1 > 0 ? zz + c.espesor * (p0 + 2 * p1) / (3 * (p0 + p1)) : zz + c.espesor / 2;
      res.push({ Fx: F * Math.cos(ang), Fz: F * Math.sin(ang), x: i === 0 ? xv + zc / Math.tan(th) : B, y: Hter - zc });
      zz += c.espesor;
    });
    const Fx = res.reduce((a, q) => a + q.Fx, 0), Fz = res.reduce((a, q) => a + q.Fz, 0);
    return { Fx, Fz, x: Fz > 0 ? res.reduce((a, q) => a + q.Fz * q.x, 0) / Fz : 0, y: Fx > 0 ? res.reduce((a, q) => a + q.Fx * q.y, 0) / Fx : 0 };
  };
  const est = diagrama(0, false, 1);
  const psi = Math.atan(kh / (1 - kv));
  const sis = kh > 0 ? diagrama(psi, true, 1 - kv) : { Fx: 0, Fz: 0, x: 0, y: 0 };

  const fuerzas: FuerzaG5[] = [
    { nombre: "Weight - wall", Fx: 0, Fz: Wm, x: xm, z: ym },
    { nombre: "Earthq. - constr.", Fx: kh * Wm, Fz: -kv * Wm, x: xm, z: ym },
    { nombre: "Weight - earth wedge", Fx: 0, Fz: Wc, x: xc, z: yc },
    { nombre: "Earthquake - soil wedge", Fx: kh * Wc, Fz: -kv * Wc, x: xc, z: yc },
    { nombre: "Active pressure", Fx: est.Fx, Fz: est.Fz, x: est.x, z: est.y },
    ...(kh > 0 ? [{ nombre: "Earthq. - act.pressure", Fx: sis.Fx, Fz: sis.Fz, x: sis.x, z: sis.y }] : []),
  ];
  // verificación
  const Mres = fuerzas.reduce((a, q) => a + q.Fz * q.x, 0);
  const Movr = fuerzas.reduce((a, q) => a + q.Fx * q.z, 0);
  const N = fuerzas.reduce((a, q) => a + q.Fz, 0), H = fuerzas.reduce((a, q) => a + q.Fx, 0);
  const sBase = sueloEn(perfil, Hter);                    // suelo bajo la base (la interfaz cae en el de abajo)
  const eps = Math.atan(dk / B);
  const Hres = (N * Math.cos(eps) + H * Math.sin(eps)) * Math.tan(rad(sBase.phi));
  const T = H * Math.cos(eps) - N * Math.sin(eps);
  return {
    B, Hterreno: Hter, profTotal, theta: deg(th), xv, capas,
    pesoMuro: Wm, xMuro: xm, yMuro: ym, pesoCuna: Wc, xCuna: xc, yCuna: yc,
    fuerzas, estatico: est, sismico: sis, Mres, Movr, Hres, Hact: T, N, epsBase: deg(eps), phiBase: sBase.phi,
    fsVuelco: Mres / Movr, fsDeslizamiento: Hres / T,
  };
}
