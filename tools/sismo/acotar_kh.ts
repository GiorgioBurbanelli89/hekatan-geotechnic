// Acota por qué el SRM no converge con sismo: terreno horizontal de 2 capas (sin muro), malla 0.8, variando c y kh.
//   npx tsx tools/sismo/acotar_kh.ts
import { parseHgeo } from "../../src/model/dsl";
import { meshSlope } from "../../src/mesh/mesher";
import { GeoFemWasm } from "../../src/geofem/geofemWasm";

const T = (c: number, kh: number, extra = "") => ["margenes xmin=0 xmax=30 fondo=-12", "interfaz 0,0 30,0", "interfaz 0,-3 30,-3",
  `suelo A E=25000 nu=0.28 phi=30 c=${c} gamma=18.5`, `suelo B E=15500 nu=0.30 phi=29.97 c=${c} gamma=17.5`,
  "asignar A en 15,-1.5", "asignar B en 15,-8", "malla 0.8", "etapa peso propio", `sismo kh=${kh} kv=0 ${extra}`].join("\n");
const casos = (process.argv[2] ? JSON.parse(process.argv[2]) : [[0, 0, ""], [0, -0.01, ""], [1, -0.1, ""], [5, -0.1, ""], [20, -0.1, ""], [5, -0.1, "borde=0"]]) as [number, number, string][];
for (const [c, kh, ex] of casos) {
  const { model } = meshSlope(parseHgeo(T(c, kh, ex)), { topeMs: 300000 });
  const pel: string[] = [];
  const fem = await GeoFemWasm.create(model, (l) => { if (l.includes("RS=0 ") || l.includes("SRM rs")) pel.push(l.trim()); });
  const r = fem.run(model, [1])[0];
  const rs0 = pel.filter((l) => l.startsWith("RS=0"));
  console.log(`c=${c} kh=${kh} ${ex}: ${pel.find((l) => l.startsWith("SRM rs00"))} · FS=${r.fs.toFixed(4)}\n    última iteración de SRF=1: ${rs0[rs0.length - 1]}`);
}
