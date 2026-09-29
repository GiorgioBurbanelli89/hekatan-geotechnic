// Muro de Manabí en Hekatan Geotechnic, SIN navegador: factor de seguridad por reducción de resistencia (SRM)
// para el modelo base y una variación cada vez (las demás cosas iguales).
//
//   npx tsx tools/variaciones_muro_manabi.ts              → todas las corridas
//   npx tsx tools/variaciones_muro_manabi.ts base c1 ...  → solo esas (por id)
//   npx tsx tools/variaciones_muro_manabi.ts --lista      → ids disponibles
//
// Escribe tools/variaciones_muro_manabi/resultados.json, tabla.md y, por caso, <id>_malla.json (malla + Δu del
// mecanismo) para dibujar con tools/variaciones_muro_manabi_png.py (matplotlib sin ventana).
//
// Lo que NO hace el programa (y por eso no está aquí): Mohr-Coulomb (solo Drucker-Prager de GEO5, ajuste de
// extensión), sismo seudoestático (no hay carga de volumen horizontal), contacto muro-suelo (va pegado), malla de
// GEO5 nudo a nudo (el mallador es otro: Delaunay + Ruppert).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFemWasm } from "../src/geofem/geofemWasm";

const AQUI = dirname(fileURLToPath(import.meta.url));
const OUT = join(AQUI, "variaciones_muro_manabi");
// tope del mallador: el de la app (8 s) hace la malla DEPENDIENTE de la carga de la máquina; aquí 300 s (--tope=s)
const TOPE_S = +(process.argv.find((a) => a.startsWith("--tope="))?.slice(7) ?? 300);
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------------------------------
// Parámetros del modelo. BASE = examples/muro_manabi.hgeo (el que se llevó a GeoFEM: 0.60 m de tierra delante).
// ---------------------------------------------------------------------------------------------------
type P = {
  geo: "muro" | "geofem";   // muro = orden `muro` (fuste 0.40 constante, cara con 6 cm de talud, suelos a −3.05)
                            // geofem = geometría CALCADA del lanzador de GeoFEM (fuste 0.25→0.40, suelos a −3.00, líneas libres)
  emp: number;              // tierra delante sobre la base de la zapata [m] (base a −3.00)
  h: number;                // arista de malla [m]
  phiR: number; phiA: number;   // φ relleno (ARENA_SP) y apoyo (ARENA_SPSM)
  cR: number; cA: number;       // c relleno y apoyo [kPa]
  Emuro: number;            // E del hormigón [kPa]
};
const BASE: P = { geo: "muro", emp: 0.6, h: 0.8, phiR: 30, phiA: 29.97, cR: 0, cA: 0, Emuro: 21166510 };

function hgeo(p: P): string {
  const zf = -(3.0 - p.emp);   // terreno de delante
  const suelos = [
    `suelo ARENA_SP    E=25000 nu=0.28 phi=${p.phiR} c=${p.cR} gamma=18.5`,
    `suelo ARENA_SPSM  E=15500 nu=0.30 phi=${p.phiA} c=${p.cA} gamma=17.5`,
  ];
  if (p.geo === "muro") return [
    "margenes xmin=0 xmax=30 fondo=-12",
    `interfaz 0,${zf} 30,${zf}`,
    "interfaz 0,-3.05 30,-3.05",
    ...suelos,
    `suelo HORMIGON    E=${p.Emuro} nu=0.2 phi=0 c=0 gamma=23`,
    "asignar ARENA_SP en 20,-1.5",
    "asignar ARENA_SPSM en 15,-8",
    `muro HORMIGON x=10 H=${(3.0 - p.emp).toFixed(2)} fuste=0.40 zapata=0.40 talon=1.90 dedo=0.70 emp=${p.emp}`,
    `malla ${p.h}`,
    "etapa peso propio",
  ].join("\n");
  // geometría de tools/muro_manabi_a_geofem.py (TERRENO, SUELOS, PUNTERA, TRASDOS), con la cara vista cortada
  // a la cota del terreno de delante
  const xc = 10 + 0.15 * (-2.4 - zf) / 2.4;   // la cara vista (10,−2.4)→(10.15,0) a la cota zf
  return [
    "margenes xmin=0 xmax=30 fondo=-12",
    `interfaz 0,${zf} ${xc.toFixed(5)},${zf} 10.15,0 30,0`,
    "interfaz 0,-3 30,-3",
    ...suelos,
    `suelo HORMIGON    E=${p.Emuro} nu=0.2 phi=0 c=0 gamma=23 rigido=1`,
    // el hormigón PRIMERO: la asignación por región (nº de interfaces encima) se queda con la última, y el muro,
    // el relleno y la tierra de delante son la misma región 1; las líneas libres las separan después
    "asignar HORMIGON en 10.25,-1.2",
    "asignar ARENA_SP en 20,-1.5",
    `asignar ARENA_SP en 5,${(zf - 0.3).toFixed(2)}`,
    "asignar ARENA_SPSM en 15,-8",
    `linea 9.28,-3 9.30,-2.6 9.98,-2.6 ${xc.toFixed(5)},${zf}`,
    "linea 10.40,0 10.42,-2.6 12.30,-2.6 12.32,-3",
    `malla ${p.h}`,
    "etapa peso propio",
  ].join("\n");
}

type Caso = { id: string; grupo: string; que: string; p: P };
// las variaciones parten de la geometría CALCADA de GeoFEM (la del 1.36), no del ejemplo con la franja de 5 cm
const G: P = { ...BASE, geo: "geofem" };
const v = (o: Partial<P>): P => ({ ...G, ...o });
const CASOS: Caso[] = [
  { id: "base", grupo: "0 base", que: "modelo de examples/muro_manabi.hgeo (0.60 m delante, malla 0.8)", p: BASE },
  { id: "geofem", grupo: "0 base", que: "geometría calcada de GeoFEM (fuste 0.25→0.40, suelos a −3.00), 0.60 m delante, malla 0.8", p: G },
  { id: "emp070", grupo: "a tierra delante", que: "0.70 m de tierra delante", p: v({ emp: 0.7 }) },
  { id: "h100", grupo: "b malla", que: "malla 1.00 m", p: v({ h: 1.0 }) },
  { id: "h065", grupo: "b malla", que: "malla 0.65 m", p: v({ h: 0.65 }) },
  { id: "h050", grupo: "b malla", que: "malla 0.50 m", p: v({ h: 0.5 }) },
  { id: "h035", grupo: "b malla", que: "malla 0.35 m", p: v({ h: 0.35 }) },
  { id: "phi28", grupo: "c φ", que: "φ 28° relleno y apoyo", p: v({ phiR: 28, phiA: 28 }) },
  { id: "phi30", grupo: "c φ", que: "φ 30° relleno y apoyo", p: v({ phiR: 30, phiA: 30 }) },
  { id: "phi32", grupo: "c φ", que: "φ 32° relleno y apoyo", p: v({ phiR: 32, phiA: 32 }) },
  { id: "c1", grupo: "d c relleno", que: "c = 1 kPa en el relleno", p: v({ cR: 1 }) },
  { id: "c5", grupo: "d c relleno", que: "c = 5 kPa en el relleno", p: v({ cR: 5 }) },
  { id: "c1ambos", grupo: "d c relleno", que: "c = 1 kPa en el relleno y en el apoyo", p: v({ cR: 1, cA: 1 }) },
  { id: "c1h050", grupo: "d c relleno", que: "c = 1 kPa en el relleno y en el apoyo, malla 0.50 m", p: v({ cR: 1, cA: 1, h: 0.5 }) },
  { id: "rigido", grupo: "e muro", que: "muro rígido (E ×100)", p: v({ Emuro: 100 * G.Emuro }) },
];

type Fila = {
  id: string; grupo: string; que: string; p: P;
  nudos: number; elementos: number; angMin: number; aristaMedia: number; tMalla: number; avisosMalla: string[];
  fs: number; srf1: "CONVERGE" | "DIVERGE"; peldanos: string[]; fin: string; tCalculo: number;
  mecanismo: string; zona?: { xmin: number; xmax: number; zmin: number; zmax: number; bajoZapata: boolean; delante: boolean; detras: boolean };
};

async function correr(c: Caso): Promise<Fila> {
  const txt = hgeo(c.p);
  writeFileSync(join(OUT, `${c.id}.hgeo`), `# ${c.que} (generado por tools/variaciones_muro_manabi.ts)\n${txt}\n`);
  const def = parseHgeo(txt);
  const t0 = performance.now();
  const { model, stats } = meshSlope(def, { topeMs: TOPE_S * 1000, maxIter: 40000 });
  const tMalla = (performance.now() - t0) / 1000;
  const cnt = new Map<number, number>(); for (const m of model.EMAT) cnt.set(m, (cnt.get(m) ?? 0) + 1);
  console.log(`\n[${c.id}] ${c.que}\n  malla h=${c.p.h}: ${stats.nodes} nudos, ${stats.elements} T6, ángulo mín ${stats.minAngle.toFixed(1)}°, arista media ${stats.meanEdge.toFixed(2)} m, ${tMalla.toFixed(1)} s` +
    `  | ${def.soils.map((s, i) => `${s.name}=${cnt.get(i + 1) ?? 0}`).join(" ")}${stats.avisos.length ? "\n  AVISOS: " + stats.avisos.join(" · ") : ""}`);
  const peldanos: string[] = [];
  const fem = await GeoFemWasm.create(model, (l) => { if (l.includes("SRM rs")) { peldanos.push(l.trim()); console.log("  " + l.trim()); } });
  const t1 = performance.now();
  const r = fem.run(model)[0];
  const tCalculo = (performance.now() - t1) / 1000;
  const srf1 = peldanos[0]?.includes("CONVERGE") ? "CONVERGE" : "DIVERGE";
  const ult = peldanos[peldanos.length - 1] ?? "";
  const nConv = peldanos.filter((l) => l.includes("CONVERGE")).length;
  const fin = srf1 === "DIVERGE" && nConv === 0 ? "no converge en ningún peldaño, ni con la resistencia completa: el FS = 1 que da el programa NO es un resultado"
    : srf1 === "DIVERGE" ? "SRF = 1 NO converge pero un SRF mayor SÍ: el FS sale de peldaños posteriores (fallo de Newton, no rotura)"
    : /relax=4/.test(ult) ? "rotura: 4 relajaciones del peldaño sin converger (como GEO5)" : "tope del programa (SRF > 3)";
  // MECANISMO: incremento de desplazamiento entre los dos últimos peldaños convergidos (lo que se mueve al pasar
  // del penúltimo SRF al FS). Si solo convergió SRF = 1, se usa u(SRF=1) − u elástica.
  const nn = model.X.length, st = r.steps;
  const ua = st.length ? st[st.length - 1].u : r.u1!, ub = st.length >= 2 ? st[st.length - 2].u : st.length === 1 && srf1 === "CONVERGE" ? r.u1! : r.uel;
  const du = new Float64Array(nn); let dmax = 0;
  for (let i = 0; i < nn; i++) { du[i] = Math.hypot(ua[2 * i] - ub[2 * i], ua[2 * i + 1] - ub[2 * i + 1]); dmax = Math.max(dmax, du[i]); }
  // BANDA DE CORTE: deformación de corte del incremento Δu en el centro de cada T6, γ = √((εx−εy)² + γxy²).
  // La superficie de rotura es donde se concentra; se toman los elementos de SUELO con γ ≥ 30 % del máximo.
  const gam = new Float64Array(model.ELE.length);
  const dNdL = [[1 / 3, 0, -1 / 3, 4 / 3, -4 / 3, 0], [0, 1 / 3, -1 / 3, 4 / 3, 0, -4 / 3]];   // T6 (orden del solver) en L1 = L2 = 1/3
  model.ELE.forEach((e, k) => {
    let j11 = 0, j12 = 0, j21 = 0, j22 = 0;
    for (let a = 0; a < 6; a++) { j11 += dNdL[0][a] * model.X[e[a]]; j12 += dNdL[0][a] * model.Y[e[a]]; j21 += dNdL[1][a] * model.X[e[a]]; j22 += dNdL[1][a] * model.Y[e[a]]; }
    const dJ = j11 * j22 - j12 * j21; let ex = 0, ey = 0, gxy = 0;
    for (let a = 0; a < 6; a++) {
      const dx = (j22 * dNdL[0][a] - j12 * dNdL[1][a]) / dJ, dy = (-j21 * dNdL[0][a] + j11 * dNdL[1][a]) / dJ;
      const ux = ua[2 * e[a]] - ub[2 * e[a]], uy = ua[2 * e[a] + 1] - ub[2 * e[a] + 1];
      ex += dx * ux; ey += dy * uy; gxy += dy * ux + dx * uy;
    }
    gam[k] = model.RIGID?.[model.EMAT[k] - 1] ? 0 : Math.hypot(ex - ey, gxy);
  });
  let zona: Fila["zona"]; let mecanismo = "sin datos";
  if (nConv > 0 && dmax > 0) {
    const gmax = Math.max(...gam);
    const sel: number[] = []; gam.forEach((g, k) => { if (g >= 0.3 * gmax) sel.push(k); });
    const cen = (k: number) => { const e = model.ELE[k]; return [(model.X[e[0]] + model.X[e[1]] + model.X[e[2]]) / 3, (model.Y[e[0]] + model.Y[e[1]] + model.Y[e[2]]) / 3]; };
    const C = sel.map(cen), xs = C.map((q) => q[0]), zs = C.map((q) => q[1]);
    zona = { xmin: Math.min(...xs), xmax: Math.max(...xs), zmin: Math.min(...zs), zmax: Math.max(...zs), bajoZapata: false, delante: false, detras: false };
    zona.bajoZapata = C.some((q) => q[0] > 9.3 && q[0] < 12.3 && q[1] < -3.0);
    zona.delante = C.some((q) => q[0] < 9.3);
    zona.detras = C.some((q) => q[0] > 12.3);
    mecanismo = `banda de corte (γ ≥ 30 % del máx, ${sel.length} T6): x ${zona.xmin.toFixed(1)}…${zona.xmax.toFixed(1)}, z ${zona.zmin.toFixed(2)}…${zona.zmax.toFixed(2)}` +
      ` | bajo la zapata: ${zona.bajoZapata ? "sí" : "no"} · delante de la puntera: ${zona.delante ? "sí" : "no"} · detrás del talón: ${zona.detras ? "sí" : "no"}`;
  }
  console.log(`  FS = ${r.fs.toFixed(4)} · ${fin} · cálculo ${tCalculo.toFixed(1)} s\n  mecanismo: ${mecanismo}`);
  writeFileSync(join(OUT, `${c.id}_malla.json`), JSON.stringify({
    id: c.id, que: c.que, fs: r.fs, X: model.X.map((x) => +x.toFixed(4)), Y: model.Y.map((y) => +y.toFixed(4)),
    T: model.ELE.map((e) => e.slice(0, 3)), M: model.EMAT, rigido: model.RIGID, du: Array.from(du, (x) => +x.toExponential(4)),
    gam: Array.from(gam, (x) => +x.toExponential(4)), dux: Array.from({ length: nn }, (_, i) => +(ua[2 * i] - ub[2 * i]).toExponential(4)),
    duy: Array.from({ length: nn }, (_, i) => +(ua[2 * i + 1] - ub[2 * i + 1]).toExponential(4)),
  }));
  return { id: c.id, grupo: c.grupo, que: c.que, p: c.p, nudos: stats.nodes, elementos: stats.elements, angMin: +stats.minAngle.toFixed(1),
    aristaMedia: +stats.meanEdge.toFixed(3), tMalla: +tMalla.toFixed(1), avisosMalla: stats.avisos, fs: +r.fs.toFixed(4), srf1, peldanos, fin,
    tCalculo: +tCalculo.toFixed(1), mecanismo, zona };
}

const args = process.argv.slice(2);
if (args.includes("--lista")) { for (const c of CASOS) console.log(`${c.id.padEnd(8)} ${c.que}`); process.exit(0); }
const pedir = args.filter((a) => !a.startsWith("--"));
const sel = pedir.length ? CASOS.filter((c) => pedir.includes(c.id)) : CASOS;
const fjson = join(OUT, "resultados.json");
const prev: Fila[] = existsSync(fjson) ? JSON.parse(readFileSync(fjson, "utf-8")) : [];
const filas = new Map(prev.map((f) => [f.id, f]));
for (const c of sel) { filas.set(c.id, await correr(c)); writeFileSync(fjson, JSON.stringify([...filas.values()], null, 1)); }
// tabla en el orden de CASOS
const orden = CASOS.map((c) => filas.get(c.id)).filter((f): f is Fila => !!f);
const md = [
  "| id | variación | nudos | T6 | áng. mín | malla (s) | SRF = 1 | **FS** | fin | cálculo (s) | zona que se mueve al romper |",
  "|---|---|---|---|---|---|---|---|---|---|---|",
  ...orden.map((f) => `| ${f.id} | ${f.que} | ${f.nudos} | ${f.elementos} | ${f.angMin}° | ${f.tMalla}${f.avisosMalla.length ? " ⚠" : ""} | ${f.srf1} | **${f.fin.startsWith("no converge") ? "—" : f.fs.toFixed(3) + (f.srf1 === "DIVERGE" ? " ⚠" : "")}** | ${f.fin} | ${f.tCalculo} | ${f.mecanismo} |`),
  "",
  "Referencias (sin sismo, 0.60 m delante): GEO5 FEM (GeoFEM, Mohr-Coulomb, malla 0.50 m, 6531 nudos) **1.36** · GEO5 Slope Stability, Bishop **2.33**.",
].join("\n");
writeFileSync(join(OUT, "tabla.md"), md + "\n");
console.log("\n" + md);
