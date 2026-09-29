// Barrido de kh con el SRM (WASM, malla 0.8): ¿hasta qué kh converge SRF = 1 y qué FS da? Con el muro y SIN el muro
// (terreno horizontal de 2 capas, mismos suelos), para separar «rompe el muro» de «rompe el terreno con Drucker-Prager».
//   npx tsx tools/sismo/barrido_kh.ts
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHgeo } from "../../src/model/dsl";
import { meshSlope } from "../../src/mesh/mesher";
import { GeoFemWasm } from "../../src/geofem/geofemWasm";
import { hgeo } from "./muro_sismo";

const AQUI = dirname(fileURLToPath(import.meta.url));
const sinMuro = (kh: number) => ["margenes xmin=0 xmax=30 fondo=-12", "interfaz 0,0 30,0", "interfaz 0,-3 30,-3",
  "suelo ARENA_SP E=25000 nu=0.28 phi=30 c=0 gamma=18.5", "suelo ARENA_SPSM E=15500 nu=0.30 phi=29.97 c=0 gamma=17.5",
  "asignar ARENA_SP en 15,-1.5", "asignar ARENA_SPSM en 15,-8", "malla 0.8", "etapa peso propio", `sismo kh=${kh} kv=0`].join("\n");
const out: string[] = [];
for (const [nom, txt] of [["con muro", (kh: number) => hgeo(0.8).replace(/sismo kh=\S+/, `sismo kh=${kh}`)], ["sin muro", sinMuro]] as [string, (kh: number) => string][]) {
  for (const kh of [-0.05, -0.1, -0.15, -0.2, -0.25, -0.3, -0.336]) {
    const { model } = meshSlope(parseHgeo(txt(kh)), { topeMs: 300000, maxIter: 40000 });
    const pel: string[] = [];
    const fem = await GeoFemWasm.create(model, (l) => { if (l.includes("SRM rs")) pel.push(l.trim()); });
    const r = fem.run(model, [1])[0];
    const conv = pel[0]?.includes("CONVERGE");
    const l = `${nom}  kh=${kh}: SRF=1 ${conv ? "converge" : "NO converge"} · FS = ${conv ? r.fs.toFixed(4) : "—"} (${model.X.length} nudos)`;
    console.log(l); out.push(l);
  }
}
writeFileSync(join(AQUI, "barrido_kh.txt"), out.join("\n") + "\n");
