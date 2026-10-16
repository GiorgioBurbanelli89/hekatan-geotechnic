// Tensiones del talud con GWT al final de la fase 1 de GEO5 (Restart_In.bin: σx σy τxy σz por nudo) contra el estado SRF=1 de Geotechnic
// sobre la MISMA malla y con el mismo agua: valida la carga del agua (peso γsat + presión de poros) punto a punto.   npx tsx tests/talud_restart_gwt_vs_geo5.ts
import { readFileSync } from "node:fs";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
import { presionNodal } from "../src/geofem/agua";
const base = JSON.parse(readFileSync("tests/data/geo5_talud_malla.json", "utf-8")), gsat = base.MAT.map(() => 20.5);
const b = readFileSync("tests/data/geo5_talud_gwt_Restart_In.bin"), MARC = Buffer.from("0400000001000000", "hex");
const g5 = new Map<string, number[]>(); let o = 16;   // cabecera (50,0,0,nnudos); cada nudo: id, x, y, … marca 04 00 00 00 01 00 00 00 + σx σy τxy σz (registros de largo variable)
for (let k = 0; k < b.readInt32LE(12); k++) {
  const m = b.indexOf(MARC, o); const x = b.readDoubleLE(o + 4), y = b.readDoubleLE(o + 12);
  g5.set(`${x.toFixed(4)},${y.toFixed(4)}`, [0, 8, 16, 24].map((d) => b.readDoubleLE(m + 8 + d))); o = m + 40;
}
const agua = { gwt: [[0, -10], [12, -10], [22, -6], [40, -6]] as [number, number][], gammaSat: gsat };
// ETAPAS=2: dos etapas idénticas con agua (como las dos etapas del modelo de GEO5: la 2.ª quita las cargas de la 1.ª y pone las suyas) por runStaged
const NET = +(process.env.ETAPAS ?? 1), st = base.stages[0], mod = NET > 1 ? { ...base, agua, staged: true, REGK: new Array(base.ELE.length).fill(0), stages: Array.from({ length: NET }, (_, k) => ({ ...st, name: `etapa ${k + 1}` })) } : { ...base, agua };
const fem = await GeoFemWasm.create(mod, () => {}), rs: any[] = fem.run(mod), r: any = rs[rs.length - 1];
const ne = mod.ELE.length, ng = r.ngp / ne, nn = mod.X.length, acc = new Float64Array(nn * 4), cnt = new Float64Array(nn);
for (let e = 0; e < ne; e++) { const m = [0, 0, 0, 0]; for (let q = 0; q < ng; q++) for (let i = 0; i < 4; i++) m[i] += r.sig1[(e * ng + q) * 4 + i] / ng; for (const k of mod.ELE[e]) { for (let i = 0; i < 4; i++) acc[k * 4 + i] += m[i]; cnt[k]++; } }
const pn = presionNodal(mod as any, agua as any), TOTAL = process.argv[2] !== "ef";   // el Restart de GEO5 guarda tensión TOTAL (σ = σ' − m·p); `ef` compara con la efectiva
let n = 0; const dif = [0, 0, 0, 0], mx = [0, 0, 0, 0], esc = [0, 0, 0, 0];
for (let i = 0; i < nn; i++) {
  const s = g5.get(`${mod.X[i].toFixed(4)},${mod.Y[i].toFixed(4)}`); if (!s || !cnt[i]) continue;
  const gt = [acc[i * 4] / cnt[i], acc[i * 4 + 1] / cnt[i], acc[i * 4 + 3] / cnt[i], acc[i * 4 + 2] / cnt[i]];   // σx σy τxy σz (orden GEO5)
  if (TOTAL) { gt[0] -= pn[i]; gt[1] -= pn[i]; gt[3] -= pn[i]; }
  n++; for (let k = 0; k < 4; k++) { const d = Math.abs(gt[k] - s[k]); dif[k] += d; mx[k] = Math.max(mx[k], d); esc[k] = Math.max(esc[k], Math.abs(s[k])); }
}
const nom = ["σx", "σy", "τxy", "σz"];
console.log(`nudos comparados ${n} de ${nn} (GEO5: ${g5.size}); FS ${r.fs}; ${TOTAL ? "tensión TOTAL (σ' − p)" : "tensión efectiva"}`);
for (let k = 0; k < 4; k++) console.log(`${nom[k].padEnd(4)} |dif| medio ${(dif[k] / n).toFixed(3)}  máx ${mx[k].toFixed(3)}  (máx |GEO5| ${esc[k].toFixed(1)} kPa → ${(100 * (dif[k] / n) / esc[k]).toFixed(2)} % medio)`);
if (process.env.COL) {
  const xs = +process.env.COL; console.log(`columna x≈${xs}: y | p | GEO5 σx σy σz | Geotechnic efectiva σx σy σz`);
  const filas: number[][] = []; for (let i = 0; i < nn; i++) if (Math.abs(mod.X[i] - xs) < 0.05) { const s = g5.get(`${mod.X[i].toFixed(4)},${mod.Y[i].toFixed(4)}`)!; filas.push([mod.Y[i], pn[i], s[0], s[1], s[3], acc[i * 4] / cnt[i], acc[i * 4 + 1] / cnt[i], acc[i * 4 + 2] / cnt[i]]); }
  filas.sort((a, b) => b[0] - a[0]); for (const f of filas.filter((_, j) => j % 3 == 0)) console.log(f.map((v) => v.toFixed(1).padStart(7)).join(" "));
}
