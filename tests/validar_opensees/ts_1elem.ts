// Experimento (b) · el MISMO T6 (0,0)(2,0)(0,2), base empotrada, DP «extension» phi 22.7, E 130347, nu 0.3, gamma 18, tracción horizontal q en el lado izquierdo,
// con el solver de Hekatan Geotechnic (análisis de tensiones por etapas).   npx tsx tests/validar_opensees/ts_1elem.ts 0,20,40 0,0.001,0.01,0.1,1,5,20
import { writeFileSync } from "node:fs";
import { GeoFem, GeoModel } from "../../src/geofem/solver";
const qs = (process.argv[2] ?? "0").split(",").map(Number), cs = (process.argv[3] ?? "0.1").split(",").map(Number);
const out: any[] = [];
for (const q of qs) for (const c of cs) {
  const X = [0, 2, 0, 1, 1, 0], Y = [0, 0, 2, 0, 1, 1], z = () => new Array(12).fill(0);
  const Fs = z(); Fs[0] = q * 2 / 6; Fs[4] = q * 2 / 6; Fs[10] = q * 2 * 2 / 3;   // nudos 1, 3 (esquinas) y 6 (medio) en x
  const m: GeoModel = { X, Y, ELE: [[0, 1, 2, 3, 4, 5]], EMAT: [1], FIXED: [0, 1, 2, 3, 6, 7], Fg: z(), Fs, Fa: z(), MAT: [[130347, 0.3, 22.7, c, 18, 0]], MODEL: [0],
    recomputeGravity: true, staged: true, stages: [{ name: "tension", loads: ["Fg", "Fs"] }] };
  let conv = false, u: Float64Array | null = null, alc = 0;
  try {
    m.Fg = Array.from(new GeoFem(m, () => {}).Fg2);                    // la etapa usa m.Fg: se le da la gravedad recalculada
    const fem = new GeoFem(m, () => {}); const r = fem.runStaged(m); conv = (r[0].alcanzada ?? 0) >= 0.9999; alc = r[0].alcanzada ?? 0; u = (r[0].u1 && r[0].u1.some((v: number) => v !== 0)) ? r[0].u1 : r[0].u;
  } catch (e) { conv = false; }
  out.push({ q, c, conv, alcanzada: alc, u3: u ? [u[4], u[5]] : null });
  console.log(`q=${q} c=${c}: ${conv ? "converge" : "NO converge"} (alcanzada ${alc})  u(3) = ${u ? "(" + u[4].toExponential(6) + ", " + u[5].toExponential(6) + ")" : "-"}`);
}
writeFileSync(new URL("./ts_1elem.json", import.meta.url), JSON.stringify(out));
