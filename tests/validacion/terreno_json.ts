// Terreno y suelos de un .hgeo (con `talud tipo=…` ya expandido a polilinea) en JSON, para las herramientas Python.
//   npx tsx tests/validacion/terreno_json.ts X.hgeo
import { readFileSync } from "node:fs";
import { parseHgeo } from "../../src/model/dsl";
const d = parseHgeo(readFileSync(process.argv[2], "utf-8")) as unknown as Record<string, unknown>;
console.log(JSON.stringify({ margins: d.margins ?? null, interfaces: d.interfaces, soils: d.soils, assign: d.assign, h: d.h }));
