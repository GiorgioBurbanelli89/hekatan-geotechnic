// Prueba de los lectores de lo que exporta GEO5: DXF de malla y Output_File_Geo.bin (archivos REALES de GEO5 2024).
import { readFileSync } from "node:fs";
import { leerDxfGeo5, emparejarConModelo, leerOutputGeo } from "../src/import_geo5";
let mal = 0; const ok = (c: boolean, m: string) => { console.log((c ? "✓ " : "✗ ") + m); if (!c) mal++; };

const dxf = leerDxfGeo5(readFileSync("tests/data/geo5_export/muro_et7.dxf", "latin1"));
ok(dxf.lados.length === 4215, `DXF: 4215 lados de elemento (${dxf.lados.length})`);
ok(dxf.nudos.length === 1387, `DXF: 1387 nudos esquina distintos (${dxf.nudos.length})`);
ok(dxf.areas.length === 8, `DXF: 8 áreas activas (${dxf.areas.length})`);
ok(dxf.bbox.join() === "0,-12,30,0", `DXF: caja ${dxf.bbox.join(", ")} = el modelo 30 × 12 m`);
const m = JSON.parse(readFileSync("tests/data/muro_agua_geo5/modelo.json", "utf-8"));      // malla de GEO5 (5 decimales)
const par = emparejarConModelo(dxf, m.X, m.Y, 2e-4);
const n = par.filter((i) => i >= 0).length;
ok(n === 1387, `DXF ↔ malla del InputFile de GEO5: ${n}/1387 esquinas emparejadas a 0.2 mm`);
const esq = new Set<number>(); for (const e of m.ELE) for (const k of e.slice(0, 3)) esq.add(k);
ok([...par].every((i) => i < 0 || esq.has(i)), "las esquinas del DXF son los 3 primeros nudos de cada T6 del InputFile");

const out = leerOutputGeo(readFileSync("tests/data/geo5_export/demo04_Output_File_Geo.bin").buffer.slice(0) as ArrayBuffer);
ok(out.nudos === 191 && out.campos.length === 9, `Output_File_Geo.bin: 191 nudos, ${out.campos.length} campos`);
const dx = out.campos.find((c) => c.id === 0x66)!.valores;
const mm = Math.min(...dx) * 1000;
ok(Math.abs(mm - -5.9968) < 5e-4, `d_x mínimo ${mm.toFixed(4)} mm = −5.9968 (GEO5 GUI, geo5_dx_mapped.txt)`);
console.log(mal ? `\n${mal} fallos` : "\ntodo bien"); process.exit(mal ? 1 : 0);
