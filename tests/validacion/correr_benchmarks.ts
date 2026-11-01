// Nivel 2 de VALIDACION: benchmarks PUBLICADOS (slope64 de Griffiths, ACADS de Giam & Donald) corridos en Geotechnic.
//   npx tsx tests/validacion/correr_benchmarks.ts [filtro]      -> tests/validacion/benchmarks_resultado.json
// FS = ultimo SRF que converge con la escalera de GEO5 (paso 0.9, relajaciones hasta 0.99); «cota sup.» = menor SRF que diverge
// por encima (el FS real esta entre los dos). Valores publicados: ver docs/VALIDACION.md (fuente + cita).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHgeo } from "../../src/model/dsl";
import { meshSlope } from "../../src/mesh/mesher";
import { GeoFemWasm } from "../../src/geofem/geofemWasm";

const AQUI = dirname(fileURLToPath(import.meta.url));
const PUB: Record<string, { ref: number; fuente: string }> = {
  g0_griffiths_lane_ex1: { ref: 1.4, fuente: "Griffiths & Lane 1999 ej.1 via Rocscience (Bishop 1.38); H=10 supuesto" },
  g1_slope64_ex1: { ref: 1.56, fuente: "slope64 manual, Example 1" },
  g2_slope64_ex2: { ref: 1.22, fuente: "slope64 manual, Example 2" },
  g3_slope64_ex3: { ref: 2.0, fuente: "slope64 manual, Example 3" },
  g4_slope64_ex7: { ref: 1.41, fuente: "slope64 manual, Example 7 (kh 0.25)" },
  a1_acads_1a: { ref: 1.0, fuente: "ACADS EX1(a) Giam & Donald (FELA exacto 0.981)" },
  a2_acads_1b: { ref: 1.359, fuente: "ACADS EX1(b) FELA OptumG2 (Spencer 1.375)" },
  a3_acads_1c: { ref: 1.039, fuente: "ACADS EX1(c) FELA OptumG2 (kh 0.15)" },
};
const filtro = process.argv[2] ?? "";
const dir = join(AQUI, "casos");
const out: Record<string, unknown>[] = [];
for (const f of readdirSync(dir).filter((n) => n.endsWith(".hgeo") && !n.startsWith("geo5_") && n.includes(filtro)).sort()) {
  const id = f.replace(".hgeo", "");
  const { model, stats } = meshSlope(parseHgeo(readFileSync(join(dir, f), "utf-8")), { topeMs: 300000, maxIter: 60000 });
  const lineas: string[] = [];
  const t0 = performance.now();
  const r = (await GeoFemWasm.create(model, (l: string) => lineas.push(l))).run(model);
  const fs = r[r.length - 1].fs;                       // ultima etapa (con sismo si lo hay)
  // cota superior: el menor SRF que diverge en la ultima etapa, por encima del FS
  const ult = lineas.slice(lineas.map((l) => /rs00/.test(l)).lastIndexOf(true));
  const div = ult.map((l) => /SRF=([\d.]+) DIVERGE/.exec(l)).filter(Boolean).map((m) => +m![1]).filter((s) => s > fs);
  const sup = div.length ? Math.min(...div) : NaN;
  const srf1 = ult.find((l) => /rs00/.test(l)) ?? "";
  const noConv1 = /DIVERGE/.test(srf1);                 // SRF = 1 no converge: GEO5/Geotechnic informan 1.0000, pero es «FS < 1 o no converge»
  const p = PUB[id];
  const fila = { caso: id, nudos: stats.nodes, t6: stats.elements, srf1_converge: !noConv1, it_srf1: +(/it=(\d+)/.exec(srf1)?.[1] ?? 0), FS: +fs.toFixed(4), cota_sup: +sup.toFixed(4),
    FS_medio: +((fs + sup) / 2).toFixed(4), publicado: p?.ref, fuente: p?.fuente,
    dif_pct: p ? +((100 * (fs - p.ref)) / p.ref).toFixed(2) : null,
    dif_medio_pct: p ? +((100 * ((fs + sup) / 2 - p.ref)) / p.ref).toFixed(2) : null,
    s: +((performance.now() - t0) / 1000).toFixed(0) };
  console.log(JSON.stringify(fila));
  out.push(fila);
}
const pj = join(AQUI, "benchmarks_resultado.json");
let prev: Record<string, unknown>[] = []; try { prev = JSON.parse(readFileSync(pj, "utf-8")); } catch { /* primera vez */ }
const hechos = new Set(out.map((f) => f.caso));
writeFileSync(pj, JSON.stringify([...prev.filter((f) => !hechos.has(f.caso)), ...out].sort((a, b) => String(a.caso).localeCompare(String(b.caso))), null, 1));
