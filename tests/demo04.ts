// Corre la Demo04 con el solver TS y deja el log en tests/out/demo04_ts.log con el MISMO formato que
// talud_geo5_hek.py, para compararlo iteración a iteración con matlab_exact_3et.log (cmp_iterlogs_key.py).
//   npx tsx tests/demo04.ts [nstages]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { GeoFem, GeoModel } from "../src/geofem/solver";

const nst = process.argv[2] ? parseInt(process.argv[2]) : 3;
const model = JSON.parse(readFileSync(new URL("../public/models/demo04.json", import.meta.url), "utf-8")) as GeoModel;
const lines: string[] = [];
const t0 = performance.now();
const fem = new GeoFem(model, (l) => { lines.push(l); if (l.startsWith("  ") && !l.startsWith("  RS=")) console.log(l); if (l.startsWith("###") || l.startsWith("TOTAL") || l.startsWith("    SRM")) console.log(l); });
console.log(`banda=${fem.band} nfree=${fem.nfree}`);
const res = fem.run(model, nst);
console.log(`TS wall ${((performance.now() - t0) / 1000).toFixed(1)} s; FS = ${res.map((r) => r.fs.toFixed(4)).join(" / ")}`);
mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
writeFileSync(new URL("./out/demo04_ts.log", import.meta.url), lines.join("\n") + "\n", "utf-8");
// desplazamientos del último peldaño (u(FS) − u_el) en mm por etapa, para la tabla nodal
const tab = res.map((r) => ({ name: r.name, fs: r.fs, dx: Array.from({ length: model.X.length }, (_, i) => -(r.u[2 * i] - r.uel[2 * i]) * 1e3) }));
writeFileSync(new URL("./out/demo04_ts_u.json", import.meta.url), JSON.stringify(tab), "utf-8");
