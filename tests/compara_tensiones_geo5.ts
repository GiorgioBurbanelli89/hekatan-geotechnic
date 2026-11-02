// Vuelca el estado por PUNTO DE GAUSS de Geotechnic (σx σy τxy σz, εp, u nodal y la posición (x, y) de cada PG) para
// compararlo con el Restart_Interval/Step de GEO5 (ingenieria-inversa/hekatan-geo5-bridge/tools/compara_tensiones_geo5.py).
//   tsx tests/compara_tensiones_geo5.ts <modelo.json> <etapa 0..n-1> <carpeta_salida> [fs|srf1|<SRF>]
// fs   = estado al FS de la escalera SRM (el que GEO5 guarda en Restart_Interval: c/FS, atan(tanφ/FS)), recalculado
//        desde cero con el SRF EXACTO de la escalera (como GEO5 en la SRM sin etapas: cada peldaño desde σ = 0).
// srf1 = estado de tensiones con los parámetros sin reducir (SRF 1).
// <SRF> = número: ese SRF exacto, desde cero.
// No toca el motor: usa nrstep (privado en TS, accesible en tiempo de ejecución).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { GeoFem, GeoModel, GP, t6 } from "../src/geofem/solver";
import { presionNodal } from "../src/geofem/agua";

//   tsx tests/compara_tensiones_geo5.ts <modelo.json> staged <carpeta_salida>     construcción por etapas (runStaged tal cual):
//        una subcarpeta e<k> por etapa con sig/epl/u(Utot)/gpxy y pN.bin (presión nodal del agua, si la hay)
const [mp, si, out, modo = "fs"] = process.argv.slice(2);
const m = JSON.parse(readFileSync(mp, "utf-8")) as GeoModel;
if (process.env.ETAPAS) m.stages = m.stages.slice(0, Number(process.env.ETAPAS));   // solo las N primeras etapas
mkdirSync(out, { recursive: true });
const LOG: string[] = [];   // LOG=1: log de iteraciones del motor en <salida>/log.txt (para compararlo con el Log_File de GEO5)
const g: any = new GeoFem(m, process.env.LOG ? (l: string) => LOG.push(l) : () => {});
process.on("exit", () => { if (process.env.LOG) writeFileSync(`${out}/log.txt`, LOG.join("\n") + "\n"); });
const gpxy = (): Float64Array => {
  const NG = GP.length, xy = new Float64Array(g.ne * NG * 2);
  for (let e = 0; e < g.ne; e++) for (let q = 0; q < NG; q++) {
    const [N] = t6(GP[q][0], GP[q][1]); let x = 0, y = 0;
    for (let a = 0; a < 6; a++) { x += N[a] * m.X[m.ELE[e][a]]; y += N[a] * m.Y[m.ELE[e][a]]; }
    xy[(e * NG + q) * 2] = x; xy[(e * NG + q) * 2 + 1] = y;
  }
  return xy;
};
if (si === "staged") {
  const xy = gpxy(), t0 = performance.now();
  // PASOS=n (prueba, NO es el motor): cada etapa en n pasos iguales de carga desde el estado anterior, como el
  // `time_step=0.10` del InputFile de GEO5 (10 pasos). Se envuelve nrstep solo en el 1.er intento (1 incremento) de stagedStep.
  const PASOS = Number(process.env.PASOS ?? 0);
  if (PASOS > 1) {
    const nr0 = g.nrstep.bind(g);
    g.nrstep = (SRF: number, Fk: Float64Array, j: number, tr: any, keep: boolean, Fref?: Float64Array) => {
      if (!(keep && SRF === 1 && j === 1 && Fref === undefined && !g._dentro)) return nr0(SRF, Fk, j, tr, keep, Fref);
      if (process.env.APEX !== undefined) g.constructor.gApex = Number(process.env.APEX);   // APEX=0: tangente del ápice de la SRM (prueba)
      if (process.env.TANG0 === '1') g.hasDep.fill(0);   // TANG0=1: la fase arranca con K elástica (el Restart no guarda la tangente; prueba)
      // GEO5 time_step_relaxation_factor=2, time_step_max_relaxations=2 (Log_File fase 7: 0.1 falla → 0.05 hasta el final)
      const NREL = Number(process.env.NREL ?? 2);
      g._dentro = true; const F0 = Float64Array.from(g.Flast), u = new Float64Array(g.ndof), Fi = new Float64Array(g.ndof);
      let it = 0, t = 0, dt = 1 / PASOS, nrel = 0, k = 0;
      while (t < 1 - 1e-12) {
        const tn = Math.min(1, t + dt);
        const s0 = Float64Array.from(g.SIG), e0 = Float64Array.from(g.EPL), d0 = Float64Array.from(g.DEP), h0 = Uint8Array.from(g.hasDep);
        for (let d = 0; d < g.ndof; d++) Fi[d] = F0[d] + (Fk[d] - F0[d]) * tn;
        const [ci, dui, iti] = nr0(1.0, Fi, ++k, undefined, true); it += iti;
        if (ci) { for (let d = 0; d < g.ndof; d++) u[d] += dui[d]; t = tn; continue; }
        g.SIG.set(s0); g.EPL.set(e0); g.DEP.set(d0); g.hasDep.set(h0); dt /= 2;
        g.log(`    PASOS: t=${tn.toFixed(4)} no converge → paso ${dt}`);
        if (++nrel > NREL) { g._dentro = false; return [false, u, it]; }
      }
      g._dentro = false; return [true, u, it];
    };
  }
  const pN = (m as any).agua ? presionNodal(m, (m as any).agua) : new Float64Array(g.nn);
  g.runStaged(m, (r: any, k: number) => {
    const d = `${out}/e${k + 1}`; mkdirSync(d, { recursive: true });
    const w = (n: string, a: ArrayLike<number>) => writeFileSync(`${d}/${n}.bin`, Buffer.from(Float64Array.from(a).buffer));
    w("sig", r.sig1); w("epl", r.epl1); w("u", r.u); w("gpxy", xy); w("pN", pN);
    writeFileSync(`${d}/meta.json`, JSON.stringify({ modelo: mp, etapa: r.name, modo: "staged", srf: 1, conv: r.alcanzada === 1, nit: 0, ne: g.ne, NG: GP.length, nn: g.nn, X: m.X, Y: m.Y, s: (performance.now() - t0) / 1000 }));
    console.log(`${r.name}: alcanzada ${r.alcanzada} [${((performance.now() - t0) / 1000).toFixed(1)} s] → ${d}`);
  });
  process.exit(0);
}
const st = m.stages[Number(si)];
const F = new Float64Array(g.ndof);
const LOADS: Record<string, ArrayLike<number>> = { ...((m as any).loads || {}), Fg: (m as any).recomputeGravity ? g.Fg2 : m.Fg, Fs: m.Fs, Fa: m.Fa };
for (const nm of st.loads) { const v = LOADS[nm]; for (let d = 0; d < g.ndof; d++) F[d] += v[d]; }
let srf = 1, uel: Float64Array | null = null;
if (modo === "fs") { const r = g.run(m, [Number(si)])[0]; srf = r.fs; uel = r.uel; }   // uel = K_el⁻¹F (lo que resta el Output_File_Geo.bin)
else if (modo !== "srf1") srf = Number(modo);
const t0 = performance.now();
const [conv, u, nit] = g.nrstep(srf, F, 0);
const NG = GP.length, ne = g.ne, xy = gpxy();
const w = (n: string, a: Float64Array) => writeFileSync(`${out}/${n}.bin`, Buffer.from(Float64Array.from(a).buffer));
w("sig", g.SIG); w("epl", g.EPL); w("u", u); w("gpxy", xy); if (uel) w("uel", uel);   // SIG/EPL por PG: [xx, yy, zz, xy] (orden del motor)
writeFileSync(`${out}/meta.json`, JSON.stringify({ modelo: mp, etapa: st.name, modo, srf, conv, nit, ne, NG, nn: g.nn, X: m.X, Y: m.Y, s: (performance.now() - t0) / 1000 }));
console.log(`${st.name}: SRF=${srf} conv=${conv} it=${nit} → ${out}`);
