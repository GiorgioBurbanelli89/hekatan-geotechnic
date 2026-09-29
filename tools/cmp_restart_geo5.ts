// Estado SRF = 1 de Geotechnic contra el Restart_In.bin de GEO5, nudo a nudo (σx σy τ σz, promedio de los elementos del nudo).
//   npx tsx tools/cmp_restart_geo5.ts <bits srm> <nudos_geo5.json>   (el JSON se saca del .bin: registro de 144 B, 4 doubles al final)
import { readFileSync, writeFileSync } from "node:fs";
import { type GeoModel } from "../src/geofem/solver";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
const model = JSON.parse(readFileSync("examples/geofem_muro_manabi_malla.json", "utf-8")) as GeoModel;
model.srmContinua = parseInt(process.argv[2] ?? "9");
const g5 = JSON.parse(readFileSync(process.argv[3], "utf-8")) as Record<string, [number, number, number[]]>;
const fem = await GeoFemWasm.create(model, () => {});
const r = fem.run(model)[0] as any;
const ne = model.ELE.length, ng = r.ngp / ne, nn = model.X.length;
const acc = new Float64Array(nn * 4), cnt = new Float64Array(nn);
for (let e = 0; e < ne; e++) {
  const m = [0, 0, 0, 0]; for (let q = 0; q < ng; q++) for (let i = 0; i < 4; i++) m[i] += r.sig1[(e * ng + q) * 4 + i] / ng;
  for (const k of model.ELE[e]) { for (let i = 0; i < 4; i++) acc[k * 4 + i] += m[i]; cnt[k]++; }
}
const key = (x: number, y: number) => `${x.toFixed(4)},${y.toFixed(4)}`;
const idx = new Map<string, number>(); for (let i = 0; i < nn; i++) idx.set(key(model.X[i], model.Y[i]), i);
const out: any[] = []; let n = 0; const dif = [0, 0, 0, 0];
for (const [x, y, s] of Object.values(g5)) {
  const i = idx.get(key(x, y)); if (i === undefined || !cnt[i]) continue;
  const gt = [acc[i * 4] / cnt[i], acc[i * 4 + 1] / cnt[i], acc[i * 4 + 3] / cnt[i], acc[i * 4 + 2] / cnt[i]];   // σx σy τ σz (orden GEO5)
  n++; for (let k = 0; k < 4; k++) dif[k] += Math.abs(gt[k] - s[k]);
  out.push([x, y, s, gt]);
}
console.log(`nudos comparados ${n}; |dif| medio σx ${(dif[0] / n).toFixed(3)} σy ${(dif[1] / n).toFixed(3)} τ ${(dif[2] / n).toFixed(3)} σz ${(dif[3] / n).toFixed(3)} kPa; FS ${r.fs}`);
out.sort((a, b) => Math.abs(b[3][1] - b[2][1]) - Math.abs(a[3][1] - a[2][1]));
for (const o of out.slice(0, 8)) console.log(o[0], o[1], "G5", o[2].map((v: number) => v.toFixed(1)).join(" "), "| GT", o[3].map((v: number) => v.toFixed(1)).join(" "));
for (const o of out.filter((o) => Math.abs(o[0] - 20) < 0.01).sort((a, b) => a[1] - b[1]).filter((_, j) => j % 4 == 0)) console.log("x=20", o[1], "G5", o[2].map((v: number) => v.toFixed(1)).join(" "), "| GT", o[3].map((v: number) => v.toFixed(1)).join(" "));
