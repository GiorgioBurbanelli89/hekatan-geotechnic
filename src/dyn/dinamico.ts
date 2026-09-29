// DINÁMICO LINEAL de un modelo de Geotechnic (lo usa el Worker de la interfaz y las pruebas sin navegador).
// Motor: GeoFem.modes / GeoFem.dynamic (TS), validados contra Abaqus/Standard en la columna de suelo y en el muro de
// Manabí (tests/dinamico_columna.ts, tests/dinamico_muro.ts). Aquí solo se prepara el modelo y se recogen resultados:
//   - el suelo es ELÁSTICO (sin plasticidad) y el muro va PEGADO al suelo (sin despegue ni deslizamiento);
//   - contorno: base fija (u = v = 0) y lados con v = 0 y u libre (como la validación del muro);
//   - E dinámico por material: si el suelo tiene Vs, E = 2(1+ν)·(γ/g)·Vs²; si no, el E del modelo;
//   - el sismo entra por la base en x: F = −M·1·a_g(t); u, v, a son RELATIVOS a la base.
import { GeoFem, GeoModel, rayleighCoef } from "../geofem/solver";

export const G0 = 9.80665;
export type DynIn = {
  acc: number[];                 // pares [t, a] en m/s²
  dt: number; tEnd: number;
  alpha: number;                 // HHT (0 = Newmark β = ¼, γ = ½)
  xi: number; modosRayleigh: [number, number];   // ξ y los dos modos (1-based) del amortiguamiento de Rayleigh (xi = 0: sin C)
  vs: (number | null)[];         // Vs por material (null = usa E)
  watch?: number[];              // nudos vigilados (por defecto: coronación del muro y superficie lejos)
  nsnap?: number;                // nº de instantes que se guardan del campo u entero (deslizador de tiempo)
};
export type DynModos = { f: number[]; T: number[]; mefx: number[]; masa: number; rayleigh: [number, number] | null; E: number[] };
export type DynOut = DynModos & {
  t: Float64Array; ag: Float64Array;
  watch: { nodo: number; nombre: string; x: number; z: number; ux: Float64Array; aabs: Float64Array }[];
  empuje: { peso: number; t: Float64Array; din: Float64Array; nodos: number[]; elems: number[] } | null;
  snapT: number[]; snapU: Float32Array[];      // u (gdl completos) en nsnap instantes
  envU: Float32Array;                          // envolvente max_t |u| por nudo [m]
  seconds: number; nudos: number; T6: number; gdl: number; banda: number;
};

/** Contorno del dinámico: base fija y lados con v = 0. */
export function fixedDinamico(m: GeoModel): number[] {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity;
  for (let i = 0; i < m.X.length; i++) { xmin = Math.min(xmin, m.X[i]); xmax = Math.max(xmax, m.X[i]); ymin = Math.min(ymin, m.Y[i]); }
  const F: number[] = [];
  for (let i = 0; i < m.X.length; i++) {
    if (Math.abs(m.Y[i] - ymin) < 1e-6) F.push(2 * i, 2 * i + 1);
    else if (Math.abs(m.X[i] - xmin) < 1e-6 || Math.abs(m.X[i] - xmax) < 1e-6) F.push(2 * i + 1);
  }
  return F;
}

/** Modelo para el dinámico: mismos nudos y elementos, E dinámico, contorno del dinámico, sin cargas. */
export function modeloDinamico(m: GeoModel, vs: (number | null)[]): GeoModel {
  const MAT = m.MAT.map((r, i) => { const r2 = r.slice(); const v = vs[i]; if (v && v > 0) r2[0] = 2 * (1 + r[1]) * (r[4] / G0) * v * v; return r2; });
  const n = 2 * m.X.length;
  return { ...m, MAT, FIXED: fixedDinamico(m), TIES: undefined, loads: {}, stages: [], Fg: new Array(n).fill(0), Fs: new Array(n).fill(0), Fa: new Array(n).fill(0), recomputeGravity: true };
}

/** Muro (materiales rígidos): coronación (nudo más alto del hormigón; en empate el de menor x) y TRASDÓS del fuste: la
 *  cadena de aristas casi verticales hormigón–suelo del lado del relleno (el de más longitud de contacto) que baja desde
 *  la coronación. Devuelve los nudos del trasdós y los T6 de suelo con un lado en él (la definición validada con Abaqus). */
export function muroDe(m: GeoModel): { corona: number; nodos: number[]; elems: number[] } | null {
  const rig = (e: number) => !!m.RIGID?.[m.EMAT[e] - 1];
  if (!m.ELE.some((_, e) => rig(e))) return null;
  let corona = -1;
  m.ELE.forEach((el, e) => { if (!rig(e)) return; for (const n of el) if (corona < 0 || m.Y[n] > m.Y[corona] + 1e-9 || (Math.abs(m.Y[n] - m.Y[corona]) < 1e-9 && m.X[n] < m.X[corona])) corona = n; });
  // aristas (esquinas) hormigón–suelo
  const lados = new Map<string, { a: number; b: number; mid: number; rig: number[]; sue: number[] }>();
  m.ELE.forEach((el, e) => { for (const [p, q, mm] of [[0, 1, 3], [1, 2, 4], [2, 0, 5]]) { const a = Math.min(el[p], el[q]), b = Math.max(el[p], el[q]), k = a + "," + b; const L = lados.get(k) ?? { a, b, mid: el[mm], rig: [], sue: [] }; (rig(e) ? L.rig : L.sue).push(e); lados.set(k, L); } });
  const cand = [...lados.values()].filter((L) => L.rig.length && L.sue.length && Math.abs(m.Y[L.a] - m.Y[L.b]) > 2 * Math.abs(m.X[L.a] - m.X[L.b]));
  const lado = (L: { a: number; b: number; sue: number[] }) => { const e = m.ELE[L.sue[0]]; const gx = (m.X[e[0]] + m.X[e[1]] + m.X[e[2]]) / 3; return gx > (m.X[L.a] + m.X[L.b]) / 2 ? 1 : -1; };
  const largo = (s: number) => cand.filter((L) => lado(L) === s).reduce((acc, L) => acc + Math.abs(m.Y[L.a] - m.Y[L.b]), 0);
  const s = largo(1) >= largo(-1) ? 1 : -1;
  const mios = cand.filter((L) => lado(L) === s);
  if (!mios.length) return { corona, nodos: [], elems: [] };
  // la cadena conexa que contiene el nudo más alto de esas aristas
  let top = mios[0].a; for (const L of mios) for (const n of [L.a, L.b]) if (m.Y[n] > m.Y[top]) top = n;
  const usadas = new Set<typeof mios[number]>(), nodos = new Set<number>([top]);
  for (let cambio = true; cambio;) { cambio = false; for (const L of mios) if (!usadas.has(L) && (nodos.has(L.a) || nodos.has(L.b))) { usadas.add(L); nodos.add(L.a); nodos.add(L.b); nodos.add(L.mid); cambio = true; } }
  const elems = [...new Set([...usadas].flatMap((L) => L.sue))];
  return { corona, nodos: [...nodos], elems };
}

/** Nudo de la superficie a una x dada (el de mayor z entre los del contorno cerca de esa x). */
export function nudoSuperficie(m: GeoModel, x: number): number {
  let best = -1, bd = Infinity;
  const dx = new Map<number, number>();
  for (let i = 0; i < m.X.length; i++) { const d = Math.abs(m.X[i] - x); if (d < bd - 1e-9) { bd = d; } dx.set(i, d); }
  for (let i = 0; i < m.X.length; i++) if ((dx.get(i) ?? 1e9) <= bd + 0.3 && (best < 0 || m.Y[i] > m.Y[best])) best = i;
  return best;
}

/** Vigilados por defecto: coronación del muro (si hay) y un punto de la superficie lejos (del lado del relleno a 5/6 del
 *  ancho; sin muro, en el centro). */
export function vigiladosPorDefecto(m: GeoModel): { nodo: number; nombre: string }[] {
  let xmin = Infinity, xmax = -Infinity; for (const x of m.X) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); }
  const mu = muroDe(m);
  if (!mu) return [{ nodo: nudoSuperficie(m, (xmin + xmax) / 2), nombre: "superficie (centro)" }];
  const xw = m.X[mu.corona], lejos = xmax - xw > xw - xmin ? xw + (xmax - xw) * 5 / 6 : xmin + (xw - xmin) / 6;
  return [{ nodo: mu.corona, nombre: "coronación del muro" }, { nodo: nudoSuperficie(m, lejos), nombre: "superficie lejos del muro" }];
}

/** Frecuencias, periodos y masa efectiva (sin respuesta en el tiempo). */
export function modosDe(m: GeoModel, vs: (number | null)[], n = 3): DynModos & { fem: GeoFem } {
  const md = modeloDinamico(m, vs), fem = new GeoFem(md, () => {});
  const r = fem.modes(n);
  return { fem, f: r.f, T: r.f.map((f) => 1 / f), mefx: r.mefx, masa: r.massTotal, rayleigh: null, E: md.MAT.map((q) => q[0]) };
}

/** Todo el cálculo. `progreso(frac)` se llama ~100 veces; `cancelado()` corta el bucle (el Worker además puede terminarse). */
export function correrDinamico(m: GeoModel, o: DynIn, progreso: (f: number, fase: string) => void = () => {}): DynOut {
  const t0 = performance.now();
  progreso(0, "modos");
  const nm = Math.max(3, o.modosRayleigh[0], o.modosRayleigh[1]);
  const mo = modosDe(m, o.vs, nm), fem = mo.fem, md = modeloDinamico(m, o.vs);
  const ray: [number, number] | null = o.xi > 0 ? rayleighCoef(o.xi, 2 * Math.PI * mo.f[o.modosRayleigh[0] - 1], 2 * Math.PI * mo.f[o.modosRayleigh[1] - 1]) : null;
  const vig = o.watch?.length ? o.watch.map((n) => ({ nodo: n, nombre: `nudo ${n + 1}` })) : vigiladosPorDefecto(md);
  const mu = muroDe(md);
  const cara = mu && mu.elems.length ? mu : null;
  // empuje: Σ(∫Bᵀσ)_x de los T6 de la cara en los nudos del trasdós, σ con la parte viscosa del Rayleigh de rigidez
  // (u + b·v), como el NFORC de Abaqus con el que se validó. Positivo = el terreno empuja el muro hacia la cara vista.
  const signo = cara ? (() => { const e = md.ELE[cara.elems[0]]; const gx = (md.X[e[0]] + md.X[e[1]] + md.X[e[2]]) / 3; return gx > md.X[cara.nodos[0]] ? 1 : -1; })() : 1;
  const emp = (u: ArrayLike<number>) => { const F = fem.elasticNodalForces(u, cara!.elems); let h = 0; for (const n of cara!.nodos) h += F[2 * n]; return signo * h; };
  const peso = cara ? emp(fem.elasticSolve(fem.Fg2)) : 0;
  const nst = Math.round(o.tEnd / o.dt);
  const Ed = new Float64Array(nst + 1), w = new Float64Array(2 * md.X.length), b = ray ? ray[1] : 0;
  const nsnap = Math.min(o.nsnap ?? 200, nst + 1), cada = Math.max(1, Math.ceil((nst + 1) / nsnap));
  const snapT: number[] = [], snapU: Float32Array[] = [], env = new Float32Array(md.X.length);
  let pasoProg = Math.max(1, Math.floor(nst / 100));
  progreso(0.02, "respuesta en el tiempo");
  const dyn = fem.dynamic({
    dt: o.dt, tEnd: o.tEnd, accel: o.acc, alpha: o.alpha, rayleigh: ray ?? undefined, watch: vig.map((q) => q.nodo),
    onStep: (s, t, u, v) => {
      if (cara) { for (let i = 0; i < w.length; i++) w[i] = u[i] + b * v[i]; Ed[s] = emp(w); }
      for (let i = 0; i < env.length; i++) { const q = Math.hypot(u[2 * i], u[2 * i + 1]); if (q > env[i]) env[i] = q; }
      if (s % cada === 0 || s === nst) { snapT.push(t); snapU.push(Float32Array.from(u)); }
      if (s % pasoProg === 0) progreso(0.02 + 0.98 * s / nst, "respuesta en el tiempo");
    },
  });
  pasoProg = 0;
  const ag = new Float64Array(nst + 1);
  const hist = (t: number) => { const p = o.acc; if (t < p[0] || t > p[p.length - 2]) return 0; for (let i = 2; i < p.length; i += 2) if (t <= p[i]) { const ta = p[i - 2], tb = p[i]; return tb > ta ? p[i - 1] + (p[i + 1] - p[i - 1]) * (t - ta) / (tb - ta) : p[i + 1]; } return p[p.length - 1]; };
  for (let s = 0; s <= nst; s++) ag[s] = hist(s * o.dt);
  return {
    f: mo.f, T: mo.T, mefx: mo.mefx, masa: mo.masa, rayleigh: ray, E: mo.E,
    t: dyn.t, ag,
    watch: vig.map((q, j) => ({ nodo: q.nodo, nombre: q.nombre, x: md.X[q.nodo], z: md.Y[q.nodo], ux: dyn.hist[j].ux, aabs: Float64Array.from(dyn.hist[j].ax, (a, s) => a + ag[s]) })),
    empuje: cara ? { peso, t: dyn.t, din: Ed, nodos: cara.nodos, elems: cara.elems } : null,
    snapT, snapU, envU: env,
    seconds: (performance.now() - t0) / 1000, nudos: md.X.length, T6: md.ELE.length, gdl: fem.nfree, banda: fem.band,
  };
}
