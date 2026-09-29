// Frecuencias del dinámico de un .hgeo SIN navegador, por el mismo camino que la interfaz (meshSlope con el tope de la
// interfaz → modeloDinamico con los Vs del .hgeo → GeoFem.modes). Lo usa tests/check_dinamico.mjs para comparar.
//   npx tsx tools/dinamico/frecuencias_hgeo.ts modelo.hgeo   → JSON {nudos, f, T, mefx, masa}
import { readFileSync } from "node:fs";
import { parseHgeo } from "../../src/model/dsl";
import { meshSlope } from "../../src/mesh/mesher";
import { modosDe } from "../../src/dyn/dinamico";

const def = parseHgeo(readFileSync(process.argv[2], "utf-8"), { draft: true });
const { model } = meshSlope(def, { topeMs: 90000 });
model.MATNAMES = def.soils.map((s) => s.name);
const r = modosDe(model, def.soils.map((s) => s.vs ?? null), 3);
console.log(JSON.stringify({ nudos: model.X.length, f: r.f, T: r.T, mefx: r.mefx, masa: r.masa }));
