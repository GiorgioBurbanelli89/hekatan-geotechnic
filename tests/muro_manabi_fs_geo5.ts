// Muro de Manabí con la malla EXACTA de GEO5 en modo GEO5 (115): FS = 1.362360 como GEO5 (registros/2026-11-01_geo5_mapas_vs_geotechnic.md).
// Guarda contra regresiones: el 11-nov (9a1caf5) la regla de energía del dinámico entró en el SRM estático y el FS pasó a 2.15 sin que
// ninguna prueba lo viera (encontrado el 20-nov por bisección de commits).
import { readFileSync } from "node:fs";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
const model = JSON.parse(readFileSync("examples/geofem_muro_manabi_malla.json", "utf-8")); model.srmContinua = 115;
const t0 = Date.now(); const fem = await GeoFemWasm.create(model, () => {}); const fs = fem.run(model, [0])[0].fs;
const ok = Math.abs(fs - 1.36236) < 5e-6;
console.log(`${ok ? "✓" : "✗"} muro de Manabí modo GEO5: FS = ${fs.toFixed(6)} (GEO5 1.362360) [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
if (!ok) process.exit(1);
