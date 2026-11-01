// Caso 2 · el MISMO punto de Gauss con el retorno Drucker-Prager de Hekatan Geotechnic (GeoFem.dpReturn, el que usa el solver).
//   npx tsx tests/validar_opensees/ts_punto_dp.ts tests/validar_opensees/trayectoria_dp.json tests/validar_opensees/ts_dp.json
import { readFileSync, writeFileSync } from "node:fs";
import { GeoFem, GeoModel } from "../../src/geofem/solver";
const d = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const model = JSON.parse(readFileSync(new URL("../../public/models/demo04.json", import.meta.url), "utf-8")) as GeoModel;
const fem: any = new GeoFem(model, () => {});
const { E, nu } = d, phi = d.phi * Math.PI / 180, c = d.c;
const G = E / (2 * (1 + nu)), K = E / (3 * (1 - 2 * nu));
const De = new Float64Array(16);
const a = K + 4 * G / 3, b = K - 2 * G / 3;
De.set([a, b, b, 0, b, a, b, 0, b, b, a, 0, 0, 0, 0, G]);
const s = Math.sin(phi), r3 = Math.sqrt(3);
const al = 2 * s / (r3 * (3 + s)), k = 2 * r3 * c * Math.cos(phi) / (3 + s);
let sig = new Float64Array(4), out: any[] = [];
d.paso.forEach((p: number[], i: number) => {
  const deps = Float64Array.from([p[0], p[1], 0, p[2]]);
  const nuevo = new Float64Array(4), dep = new Float64Array(16);
  fem.dpReturn(deps, al, k, De, false, sig, nuevo, dep);
  sig = nuevo;
  out.push({ paso: i + 1, sig: [sig[0], sig[1], sig[2], sig[3]] });
});
writeFileSync(process.argv[3], JSON.stringify(out));
console.log(`Geotechnic: ${out.length} pasos`);
