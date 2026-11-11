// Datos del talud de la hoja de Math Studio «Un talud como lo hace GeoFEM»: malla común con GEO5 (275 nudos, 120 T6) y escalera SRM de Geotechnic.
//   npx tsx tests/_datos_talud_hoja.ts <salida.json>
import { readFileSync, writeFileSync } from "node:fs";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
import type { GeoModel } from "../src/geofem/solver";
const model = JSON.parse(readFileSync(new URL("./datos/talud_hoja_malla.json", import.meta.url), "utf-8")) as GeoModel;
const w = await GeoFemWasm.create(model, () => {});
const r = w.run(model)[0];
const maxu = (u: Float64Array) => { let m = 0; for (let i = 0; i < model.X.length; i++) m = Math.max(m, Math.hypot(u[2 * i], u[2 * i + 1])); return m; };
const out = { X: model.X, Y: model.Y, ELE: model.ELE.map((e) => e.slice(0, 3)), FS: r.fs, steps: r.steps.map((s) => ({ srf: s.srf, umax: maxu(s.u) })),
  uFinal: Array.from(r.steps[r.steps.length - 1].u), srfFinal: r.steps[r.steps.length - 1].srf };
writeFileSync(process.argv[2], JSON.stringify(out));
console.log("FS", r.fs.toFixed(6), "pasos convergidos:", r.steps.length, r.steps.map((s) => s.srf.toFixed(4)).join(" "));
console.log("umax (mm):", r.steps.map((s) => (maxu(s.u) * 1000).toFixed(1)).join(" "));
