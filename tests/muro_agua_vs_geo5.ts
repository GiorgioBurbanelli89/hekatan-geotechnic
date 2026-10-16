// Muro de Manabí por ETAPAS con GWT (z=-6) en GEO5 (malla nudo a nudo, 7 etapas) contra runStaged de Geotechnic: tensión TOTAL por nudo
// al final de cada etapa (Restart_In.bin de la fase siguiente = estado al final de la anterior).   npx tsx tests/muro_agua_vs_geo5.ts [ts|wasm] [ef]
import { readFileSync } from "node:fs";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
import { GeoFem } from "../src/geofem/solver";
import { presionNodal } from "../src/geofem/agua";
const D = "tests/data/muro_agua_geo5/", base = JSON.parse(readFileSync(D + "modelo.json", "utf-8")), motor = process.argv[2] || "wasm", TOTAL = process.argv[3] !== "ef";
const SIN = process.env.SIN === "1";   // sin agua (control)
const agua = SIN ? undefined : { gwt: [[0, -6], [30, -6]] as [number, number][], gammaSat: base.MAT.map((m: number[]) => m[4]) };   // GEO5: γsat = γ (el .gmk no define otro)
const mod = { ...base, agua };
const fem: any = motor === "ts" ? new GeoFem(mod, () => {}) : await GeoFemWasm.create(mod, () => {});
const rs: any[] = fem.runStaged(mod), ne = mod.ELE.length, nn = mod.X.length;
const MARC = Buffer.from("0400000001000000", "hex");
const leer = (f: string) => { const b = readFileSync(D + f), g5 = new Map<string, number[]>(); let o = 16;
  for (let k = 0; k < b.readInt32LE(12); k++) { const m = b.indexOf(MARC, o), x = b.readDoubleLE(o + 4), y = b.readDoubleLE(o + 12);
    g5.set(`${x.toFixed(4)},${y.toFixed(4)}`, [0, 8, 16, 24].map((d) => b.readDoubleLE(m + 8 + d))); o = m + 40; } return g5; };
const pn = agua ? presionNodal(mod as any, agua as any) : new Float64Array(nn);
for (let fase = 2; fase <= 7; fase++) {
  const g5 = leer(`fase${fase}_Restart_In.bin`), r = rs[fase - 2], ng = r.ngp / ne;
  const acc = new Float64Array(nn * 4), cnt = new Float64Array(nn);
  for (let e = 0; e < ne; e++) { const m = [0, 0, 0, 0]; for (let q = 0; q < ng; q++) for (let i = 0; i < 4; i++) m[i] += r.sig1[(e * ng + q) * 4 + i] / ng;
    for (const k of mod.ELE[e]) { for (let i = 0; i < 4; i++) acc[k * 4 + i] += m[i]; cnt[k]++; } }
  let n = 0; const dif = [0, 0, 0, 0], mx = [0, 0, 0, 0], esc = [0, 0, 0, 0];
  for (let i = 0; i < nn; i++) {
    const s = g5.get(`${mod.X[i].toFixed(4)},${mod.Y[i].toFixed(4)}`); if (!s || !cnt[i]) continue;
    const gt = [acc[i * 4] / cnt[i], acc[i * 4 + 1] / cnt[i], acc[i * 4 + 3] / cnt[i], acc[i * 4 + 2] / cnt[i]];   // σx σy τxy σz
    if (TOTAL) { gt[0] -= pn[i]; gt[1] -= pn[i]; gt[3] -= pn[i]; }
    n++; for (let k = 0; k < 4; k++) { const d = Math.abs(gt[k] - s[k]); dif[k] += d; mx[k] = Math.max(mx[k], d); esc[k] = Math.max(esc[k], Math.abs(s[k])); }
  }
  console.log(`fin etapa ${fase - 1}: nudos ${n}/${nn}  ` + ["σx", "σy", "τxy", "σz"].map((nm, k) => `${nm} med ${(dif[k] / n).toFixed(2)} máx ${mx[k].toFixed(1)} (${(100 * dif[k] / n / esc[k]).toFixed(2)} %)`).join(" · "));
}
