// SRM del muro de Manabí (malla EXACTA de GeoFEM) con el motor de Geotechnic en «modo GEO5» (srmContinua = bits 19),
// log en el formato de cmp_iterlogs_key.py → tests/out/srm_muro_<motor>.log, para compararlo con el Log_File de GEO5.
//   npx tsx tests/srm_muro_log.ts [ts|wasm]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { GeoFem, GeoModel } from "../src/geofem/solver";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
const engine = (process.argv[2] || "ts") as "ts" | "wasm";
const model = JSON.parse(readFileSync(new URL("../examples/geofem_muro_manabi_malla.json", import.meta.url), "utf-8")) as GeoModel;
(model as any).srmContinua = 19;
const lines: string[] = [];
const fem = engine === "wasm" ? await GeoFemWasm.create(model, (l: string) => lines.push(l)) : new GeoFem(model, (l: string) => lines.push(l));
const t0 = performance.now();
const r = fem.run(model, [0])[0];
console.log(`${engine}: FS = ${r.fs.toFixed(4)}  (${((performance.now() - t0) / 1000).toFixed(1)} s)  iteraciones ${lines.filter((l) => l.includes(" it=")).length}`);
mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
writeFileSync(new URL(`./out/srm_muro_${engine}.log`, import.meta.url), lines.join("\n") + "\n", "utf-8");
