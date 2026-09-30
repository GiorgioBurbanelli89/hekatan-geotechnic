// Vuelca malla, regiones activas y desplazamientos de cada etapa (para los dibujos del vídeo de etapas).
//   npx tsx tools/dump_etapas.ts examples/muro_lindero_etapas_mc.hgeo salida.json
import { readFileSync, writeFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
const [f, out] = process.argv.slice(2);
const { model } = meshSlope(parseHgeo(readFileSync(f, "utf-8")), { topeMs: 120000, maxIter: 40000 });
const fem = await GeoFemWasm.create(model);
const etapas: unknown[] = [];
fem.runStaged(model, (r, si) => {
  const per = Math.round(r.ngp / model.ELE.length);
  const edpl = model.ELE.map((_, e) => { let m = 0; for (let q = 0; q < per; q++) m = Math.max(m, Math.abs(r.epl1?.[(e * per + q) * 4] ?? 0)); return m; });
  etapas.push({ nombre: r.name, activa: model.stages[si].active, u: Array.from(r.u, (v) => Math.round(v * 1e6) / 1e6), sz: model.ELE.map((_, e) => { let s = 0; for (let q = 0; q < per; q++) s += r.sig1![(e * per + q) * 4 + 1]; return Math.round(-s / per * 100) / 100; }) });
  void edpl;
});
writeFileSync(out, JSON.stringify({ X: model.X, Y: model.Y, ELE: model.ELE.map((e) => e.slice(0, 3)), EMAT: model.EMAT, etapas }));
console.log("ok", model.ELE.length, "elementos,", etapas.length, "etapas");
