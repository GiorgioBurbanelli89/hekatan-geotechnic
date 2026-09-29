// Muro de Manabí en Hekatan Geotechnic, DINÁMICO LINEAL (Newmark), sin navegador, y su .inp de Abaqus/Standard
// con la MISMA malla nudo a nudo (CPE6, muro y suelo comparten nudos).
//
//   npx tsx tools/dinamico/muro_manabi_dinamico.ts generar   → malla (tests/datos/muro_din_malla.json) + .inp de Abaqus
//   npx tsx tools/dinamico/muro_manabi_dinamico.ts correr    → masa, modos, respuesta; compara con Abaqus si ya está
//
// TODO ELÁSTICO LINEAL: sin plasticidad, muro PEGADO al suelo (sin despegue ni deslizamiento).
// Contorno: base fija (u = v = 0); lados con v = 0 y u LIBRE. No se atan (u_der = u_izq) porque las dos columnas de
// nudos de los bordes NO tienen las mismas cotas: el terreno de delante (izquierda) está a −2.30 y el relleno
// (derecha) a 0.00, y el mallador reparte cada borde en tramos distintos (se comprueba abajo y se dice).
// Módulos para dinámico desde Vs (hekatan-school/serie_muro_manabi/vs_desde_spt.py): SP (de la coronación a −3 m)
// Vs = 195 m/s, SP-SM (bajo −3 m) Vs = 286 m/s; E = 2(1+ν)ρVs², ρ = γ/9.80665. Hormigón E = 4700·√21 MPa, ν 0.2, γ 23.
// Sismo: APO1 norte (Portoviejo, 16-abr-2016), cm/s², 100 Hz, ventana de 8 a 30 s; Δt = 0.01 s; Newmark β = ¼, γ = ½;
// Rayleigh 5 % en los modos 1 y 3 del modelo. u relativo a la base.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHgeo } from "../../src/model/dsl";
import { meshSlope } from "../../src/mesh/mesher";
import { GeoFem, GeoModel, rayleighCoef } from "../../src/geofem/solver";

const AQUI = dirname(fileURLToPath(import.meta.url));
const REPO = join(AQUI, "..", "..");
const DATOS = join(REPO, "tests", "datos");
const ABQ = join(REPO, "..", "hekatan-school", "VIDEOS", "serie_muro_manabi", "08_abaqus", "muro_lineal");
const REGISTRO = process.env.MURO_REGISTRO ?? "C:\\Users\\j-b-j\\Downloads\\Registros sismicos\\Registros Sismicos 16A\\Portoviejo\\APO1_201604162359_N_100.txt";
const G0 = 9.80665, DT = 0.01, T0 = 8, T1 = 30, H = 0.5;

const rho = (g: number) => g / G0;
const Evs = (g: number, nu: number, vs: number) => 2 * (1 + nu) * rho(g) * vs * vs;
export const MATS = {
  SP: { E: Evs(18.5, 0.28, 195), nu: 0.28, gamma: 18.5 },
  SPSM: { E: Evs(17.5, 0.30, 286), nu: 0.30, gamma: 17.5 },
  HORMIGON: { E: 4700 * Math.sqrt(21) * 1000, nu: 0.2, gamma: 23 },
};

/** Registro: la cabecera se salta (se empieza de nuevo tras cada línea no numérica, como muro_ssi.py). Pares [t, a] en m/s²,
 *  t = 0 en el segundo T0 del registro, hasta T1 incluido. */
export function registro(): number[] {
  let cm: number[] = [];
  for (const l of readFileSync(REGISTRO, "latin1").split(/\r?\n/)) {
    const v = l.trim().split(/\s+/).filter(Boolean).map(Number);
    if (!v.length) continue;
    if (v.some((x) => !Number.isFinite(x))) { cm = []; continue; }
    cm.push(...v);
  }
  const i0 = Math.round(T0 / DT), i1 = Math.round(T1 / DT), out: number[] = [];
  for (let i = i0; i <= i1; i++) out.push(+((i - i0) * DT).toFixed(4), cm[i] / 100);
  return out;
}

function hgeo(): string {
  const zf = -2.3, xc = 10 + 0.15 * (-2.4 - zf) / 2.4;   // 0.70 m de tierra delante; la cara vista (10,−2.4)→(10.15,0) cortada a zf
  const s = (n: string, m: { E: number; nu: number; gamma: number }, x = "") => `suelo ${n} E=${m.E} nu=${m.nu} phi=30 c=0 gamma=${m.gamma}${x}`;
  return [
    "margenes xmin=0 xmax=30 fondo=-12",
    `interfaz 0,${zf} ${xc.toFixed(5)},${zf} 10.15,0 30,0`,
    "interfaz 0,-3 30,-3",
    s("ARENA_SP", MATS.SP), s("ARENA_SPSM", MATS.SPSM), s("HORMIGON", MATS.HORMIGON, " rigido=1"),
    "asignar HORMIGON en 10.25,-1.2", "asignar ARENA_SP en 20,-1.5", `asignar ARENA_SP en 5,${zf - 0.3}`, "asignar ARENA_SPSM en 15,-8",
    `linea 9.28,-3 9.30,-2.6 9.98,-2.6 ${xc.toFixed(5)},${zf}`,
    "linea 10.40,0 10.42,-2.6 12.30,-2.6 12.32,-3",
    `malla ${H}`, "etapa peso propio",
  ].join("\n");
}

type Malla = GeoModel & { WATCH: Record<string, number>; FUSTE: number[]; nota: string };
const near = (m: GeoModel, x: number, y: number) => { let b = 0, d = Infinity; m.X.forEach((xi, i) => { const q = Math.hypot(xi - x, m.Y[i] - y); if (q < d) { d = q; b = i; } }); return b; };

function generar() {
  const def = parseHgeo(hgeo());
  const t0 = performance.now();
  const { model, stats } = meshSlope(def, { topeMs: 600000, maxIter: 60000 });
  console.log(`malla h=${H}: ${stats.nodes} nudos, ${stats.elements} T6, ángulo mín ${stats.minAngle.toFixed(1)}°, ${((performance.now() - t0) / 1000).toFixed(1)} s ${stats.avisos.join(" · ")}`);
  const { X, Y } = model, ymin = Math.min(...Y), xmin = Math.min(...X), xmax = Math.max(...X);
  // contorno del dinámico: base fija, lados v = 0 (u libre)
  const FIXED: number[] = [];
  const izq: number[] = [], der: number[] = [];
  for (let i = 0; i < X.length; i++) {
    if (Math.abs(Y[i] - ymin) < 1e-6) FIXED.push(2 * i, 2 * i + 1);
    else if (Math.abs(X[i] - xmin) < 1e-6) { FIXED.push(2 * i + 1); izq.push(i); }
    else if (Math.abs(X[i] - xmax) < 1e-6) { FIXED.push(2 * i + 1); der.push(i); }
  }
  const zi = izq.map((i) => Y[i]).sort((a, b) => a - b), zd = der.map((i) => Y[i]).sort((a, b) => a - b);
  const mismas = zi.length === zd.length && zi.every((z, k) => Math.abs(z - zd[k]) < 1e-9);
  const nota = `bordes: izquierda ${izq.length} nudos (z ${zi[0].toFixed(2)}…${zi[zi.length - 1].toFixed(2)}), derecha ${der.length} (z ${zd[0].toFixed(2)}…${zd[zd.length - 1].toFixed(2)}); mismas cotas: ${mismas ? "SÍ" : "NO"} → ${mismas ? "se podrían atar" : "lados con v = 0 y u libre"}`;
  console.log(nota);
  // nudos que se miran; el fuste (nudos del trasdós del fuste, de −2.6 a 0) para el empuje
  const WATCH = { corona: near(model, 10.15, 0), corona_tras: near(model, 10.40, 0), sup_detras: near(model, 25, 0), sup_delante: near(model, 3, -2.3), pie: near(model, 9.28, -3) };
  for (const [k, i] of Object.entries(WATCH)) console.log(`  ${k}: nudo ${i + 1} (${X[i].toFixed(3)}, ${Y[i].toFixed(3)})`);
  const FUSTE: number[] = [];
  const onBack = (x: number, y: number) => y >= -2.6 - 1e-9 && y <= 1e-9 && Math.abs(x - (10.40 + 0.02 * (-y) / 2.6)) < 1e-6;
  X.forEach((x, i) => { if (onBack(x, Y[i])) FUSTE.push(i); });
  const m: Malla = { ...model, FIXED, loads: {}, stages: [], WATCH, FUSTE, nota };
  mkdirSync(DATOS, { recursive: true });
  writeFileSync(join(DATOS, "muro_din_malla.json"), JSON.stringify({ X: X.map((v) => +v.toFixed(10)), Y: Y.map((v) => +v.toFixed(10)), ELE: m.ELE, EMAT: m.EMAT, FIXED, MAT: m.MAT, MATNAMES: m.MATNAMES, RIGID: m.RIGID, Fg: [], Fs: [], Fa: [], stages: [], WATCH, FUSTE, nota }));
  // Rayleigh con los modos 1 y 3 de ESTA malla (Geotechnic) → los mismos a, b van al .inp
  const md = new GeoFem(loadMalla(), () => {}).modes(3);
  const [a, b] = rayleighCoef(0.05, md.omega[0], md.omega[2]);
  console.log(`f = ${md.f.map((f) => f.toFixed(6)).join(" / ")} Hz → Rayleigh a = ${a} 1/s, b = ${b} s`);
  escribirInp(loadMalla(), a, b);
}

export function loadMalla(): Malla {
  const m = JSON.parse(readFileSync(join(DATOS, "muro_din_malla.json"), "utf-8"));
  return { ...m, Fg: new Array(2 * m.X.length).fill(0), Fs: new Array(2 * m.X.length).fill(0), Fa: new Array(2 * m.X.length).fill(0) };
}

function escribirInp(m: Malla, a: number, b: number) {
  mkdirSync(ABQ, { recursive: true });
  const L = ["*HEADING", "Muro de Manabi LINEAL, CPE6, misma malla que Hekatan Geotechnic (kN, m, t, s)", "*PREPRINT, ECHO=NO, MODEL=NO, HISTORY=NO, CONTACT=NO", "*NODE"];
  m.X.forEach((x, i) => L.push(`${i + 1}, ${x.toPrecision(15)}, ${m.Y[i].toPrecision(15)}`));
  const nom = ["SP", "SPSM", "HORMIGON"], mats = [MATS.SP, MATS.SPSM, MATS.HORMIGON];
  for (let k = 0; k < 3; k++) {
    L.push(`*ELEMENT, TYPE=CPE6, ELSET=E_${nom[k]}`);
    m.ELE.forEach((e, i) => { if (m.EMAT[i] === k + 1) L.push(`${i + 1}, ${e.map((n) => n + 1).join(", ")}`); });
  }
  L.push("*ELSET, ELSET=TODO", "E_SP, E_SPSM, E_HORMIGON");
  for (let k = 0; k < 3; k++) {
    const M = mats[k];
    L.push(`*SOLID SECTION, ELSET=E_${nom[k]}, MATERIAL=${nom[k]}`, "1.0,", `*MATERIAL, NAME=${nom[k]}`, "*ELASTIC", `${M.E.toPrecision(15)}, ${M.nu}`,
      "*DENSITY", `${rho(M.gamma).toPrecision(15)},`, `*DAMPING, ALPHA=${a.toPrecision(15)}, BETA=${b.toPrecision(15)}`);
  }
  const nset = (nm: string, ns: number[]) => { L.push(`*NSET, NSET=${nm}`); for (let k = 0; k < ns.length; k += 16) L.push(ns.slice(k, k + 16).map((n) => n + 1).join(", ")); };
  const base: number[] = [], lados: number[] = [];
  for (let i = 0; i < m.X.length; i++) { const fx = m.FIXED.includes(2 * i), fy = m.FIXED.includes(2 * i + 1); if (fx && fy) base.push(i); else if (fy) lados.push(i); }
  nset("BASE", base); nset("LADOS", lados);
  nset("MIRA", Object.values(m.WATCH));
  L.push("*BOUNDARY", "BASE, 1, 2", "LADOS, 2, 2");
  const acc = registro();
  L.push("*AMPLITUDE, NAME=APO1N, DEFINITION=TABULAR");
  for (let k = 0; k < acc.length; k += 8) L.push(acc.slice(k, k + 8).map((v) => v.toPrecision(10)).join(", "));
  L.push("*STEP, NAME=MODOS, PERTURBATION", "*FREQUENCY, EIGENSOLVER=LANCZOS, NORMALIZATION=MASS", "5,", "*OUTPUT, FIELD, VARIABLE=PRESELECT", "*END STEP");
  L.push("*STEP, NAME=SISMO, INC=100000", "*DYNAMIC, ALPHA=0, DIRECT", `${DT}, ${T1 - T0}`, "*DLOAD, AMPLITUDE=APO1N", "TODO, GRAV, 1., -1., 0., 0.",
    "*OUTPUT, FIELD, FREQUENCY=100", "*NODE OUTPUT", "U,", "*OUTPUT, HISTORY, FREQUENCY=1", "*NODE OUTPUT, NSET=MIRA", "U1, U2, A1", "*END STEP");
  writeFileSync(join(ABQ, "muro_lineal.inp"), L.join("\r\n") + "\r\n");
  console.log(`.inp → ${join(ABQ, "muro_lineal.inp")} (${m.X.length} nudos, ${m.ELE.length} CPE6, ${acc.length / 2} puntos del registro)`);
}

/** Corre masa → modos → respuesta con Geotechnic (TS). Devuelve lo que se compara. */
export function correr(m = loadMalla(), log = (l: string) => console.log(l)) {
  const fem = new GeoFem(m, () => {});
  const t0 = performance.now();
  const md = fem.modes(3);
  const [a, b] = rayleighCoef(0.05, md.omega[0], md.omega[2]);
  const acc = registro();
  const W = Object.values(m.WATCH);
  const dyn = fem.dynamic({ dt: DT, tEnd: T1 - T0, accel: acc, watch: W, rayleigh: [a, b] });
  const ag = (s: number) => acc[2 * s + 1];
  const res: Record<string, unknown> = {
    nudos: m.X.length, T6: m.ELE.length, gdl: fem.nfree, banda: fem.band, masa_total: md.massTotal, f: md.f, T: md.f.map((f) => 1 / f), mefx: md.mefx,
    rayleigh: [a, b], t: Array.from(dyn.t), segundos: (performance.now() - t0) / 1000,
    pga_base: Math.max(...acc.filter((_, k) => k % 2 === 1).map(Math.abs)),
  };
  const hist: Record<string, { ux: number[]; ax: number[]; aabs_max: number; t_aabs: number; ux_max: number; t_ux: number }> = {};
  Object.keys(m.WATCH).forEach((k, j) => {
    const h = dyn.hist[j]; let iu = 0, ia = 0; const aabs = Array.from(h.ax, (x, s) => x + ag(s));
    for (let s = 0; s < h.ux.length; s++) { if (Math.abs(h.ux[s]) > Math.abs(h.ux[iu])) iu = s; if (Math.abs(aabs[s]) > Math.abs(aabs[ia])) ia = s; }
    hist[k] = { ux: Array.from(h.ux), ax: Array.from(h.ax), ux_max: h.ux[iu], t_ux: dyn.t[iu], aabs_max: aabs[ia], t_aabs: dyn.t[ia] };
  });
  res.hist = hist;
  log(`Geotechnic: ${m.X.length} nudos, ${m.ELE.length} T6, ${fem.nfree} gdl, banda ${fem.band} · masa ${md.massTotal.toFixed(4)} t · f ${md.f.map((f) => f.toFixed(4)).join(" / ")} Hz · T1 ${(1 / md.f[0]).toFixed(4)} s · ${(res.segundos as number).toFixed(1)} s`);
  for (const [k, h] of Object.entries(hist)) log(`  ${k.padEnd(12)} u_x máx ${(h.ux_max * 1e3).toFixed(4)} mm (t ${h.t_ux.toFixed(2)} s) · a abs máx ${(h.aabs_max / G0).toFixed(4)} g (t ${h.t_aabs.toFixed(2)} s)`);
  return res;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const que = process.argv[2] ?? "correr";
  if (que === "generar") generar();
  else {
    const r = correr();
    writeFileSync(join(AQUI, "muro_din_ts.json"), JSON.stringify(r));
    if (existsSync(join(DATOS, "muro_din_abaqus.json"))) console.log("comparación: npx tsx tests/dinamico_muro.ts");
  }
}
