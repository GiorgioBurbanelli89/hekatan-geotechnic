// Convergencia de malla del FS (SRM de Geotechnic, malla propia uniforme, motor WASM): mismo .hgeo con `malla h` distintos.
//   npx tsx tests/validacion/estudio_malla.ts casos/a1_acads_1a.hgeo 1.6,0.8,0.4 [...]   -> estudio_malla.json (se acumula)
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHgeo } from "../../src/model/dsl";
import { meshSlope } from "../../src/mesh/mesher";
import { GeoFemWasm } from "../../src/geofem/geofemWasm";

const AQUI = dirname(fileURLToPath(import.meta.url));
const pj = join(AQUI, "estudio_malla.json");
let prev: Record<string, unknown>[] = []; try { prev = JSON.parse(readFileSync(pj, "utf-8")); } catch { /* primera vez */ }
const args = process.argv.slice(2);
for (let i = 0; i + 1 < args.length; i += 2) {
  const f = args[i], hs = args[i + 1].split(",").map(Number), caso = basename(f, ".hgeo");
  for (const h of hs) {
    const def = parseHgeo(readFileSync(f, "utf-8")); def.h = h;
    const { model, stats } = meshSlope(def, { topeMs: 600000, maxIter: 200000 });
    const lin: string[] = []; const t0 = performance.now();
    const r = (await GeoFemWasm.create(model, (l: string) => { if (/SRM rs/.test(l)) lin.push(l.trim()); })).run(model);
    const fs = r[r.length - 1].fs, srf1 = !/DIVERGE/.test(lin.find((l) => /rs00/.test(l)) ?? "");
    const div = lin.map((l) => /SRF=([\d.]+) DIVERGE/.exec(l)).filter(Boolean).map((m) => +m![1]).filter((s) => s > fs);
    const fila = { caso, h, nudos: stats.nodes, t6: stats.elements, FS: +fs.toFixed(4), cota_sup: div.length ? +Math.min(...div).toFixed(4) : null,
      srf1_converge: srf1, s: +((performance.now() - t0) / 1000).toFixed(0) };
    console.log(JSON.stringify(fila));
    prev = prev.filter((p) => !(p.caso === caso && p.h === h)); prev.push(fila);
    writeFileSync(pj, JSON.stringify(prev, null, 1));
  }
}
