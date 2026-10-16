// Ru: variantes de aplicar u = Ru·σv, contra GEO5 GeoFEM (talud_gwt sin freático, Ru=0.3 → FS 1.42; sin agua 1.98).
//   npx tsx tests/run_ru.ts examples/talud_gwt.hgeo 0.3
import { readFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFem } from "../src/geofem/solver";
import { cargaRu } from "../src/geofem/agua";
const def = parseHgeo(readFileSync(process.argv[2], "utf-8")), ru = parseFloat(process.argv[3] || "0.3");
const { model } = meshSlope(def);
const terr = def.interfaces[0].map((p) => [p[0], p[1]] as [number, number]);
{ // variante «peso»: γ·(1−Ru), sin presión de poros
  const { Fg } = cargaRu(model, 0, terr, "gauss");
  const m = { ...model, agua: undefined, Fg: Array.from(Fg, (v) => v * (1 - ru)), recomputeGravity: false };
  const res = new GeoFem(m, () => {}).run(m); console.log(`Ru=${ru} (peso γ(1−Ru)): FS = ${res[0].fs.toFixed(4)}`);
}
const gs = model.agua?.gammaSat ?? [20.5];
for (const [tag, gp, gv] of [["peso γ, σv γ", undefined, undefined], ["peso γsat, σv γ", (k: number) => gs[k], undefined], ["peso γsat, σv γsat", (k: number) => gs[k], (k: number) => gs[k]], ["peso γ, σv γsat", undefined, (k: number) => gs[k]]] as const) {
  const { Fg, Fp } = cargaRu(model, ru, terr, "gauss", gp, gv);
  const m = { ...model, agua: undefined, Fg: Array.from(Fg, (v, i) => v + Fp[i]), recomputeGravity: false };
  const res = new GeoFem(m, (l) => { if (process.env.V) console.log(l); }).run(m);
  console.log(`Ru=${ru} (${tag}): FS = ${res[0].fs.toFixed(4)}`);
}

{ // σv del MEF elástico (peso seco, tensión vertical total por punto de Gauss) en vez de γ·profundidad
  const { Fg } = cargaRu(model, 0, terr, "gauss");
  const fem0 = new GeoFem({ ...model, agua: undefined, Fg: Array.from(Fg), recomputeGravity: false }, () => {});
  const sg = fem0.elasticStress(fem0.elasticSolve(Fg));
  const pg = new Float64Array(model.ELE.length * 7); for (let k = 0; k < pg.length; k++) pg[k] = ru * Math.max(0, -sg[k * 4 + 1]);
  const r = cargaRu(model, ru, terr, "gauss", undefined, undefined, pg);
  const m = { ...model, agua: undefined, Fg: Array.from(r.Fg, (v, i) => v + r.Fp[i]), recomputeGravity: false };
  const res = new GeoFem(m, () => {}).run(m); console.log(`Ru=${ru} (σv del MEF elástico): FS = ${res[0].fs.toFixed(4)}`);
}
