// Comprueba SIN navegador que el módulo de la interfaz (src/dyn) da lo mismo que lo validado contra Abaqus:
//   - leerAcelerograma(RENAC) + ventana(8, 30) = registro() de muro_manabi_dinamico.ts, valor a valor;
//   - muroDe(malla del muro) = los nudos del trasdós (FUSTE) y los T6 de la cara validados;
//   - correrDinamico: masa, f, u_x coronación y empuje = los de tests/datos/muro_din_abaqus.json / muro_empuje_abaqus.json.
//   npx tsx tools/dinamico/dyn_ui_check.ts
import { readFileSync } from "node:fs";
import { leerAcelerograma, ventana } from "../../src/dyn/acelerograma";
import { correrDinamico, muroDe } from "../../src/dyn/dinamico";
import { loadMalla, registro, caraElems } from "./muro_manabi_dinamico";

const REG = process.env.MURO_REGISTRO ?? "C:\\Users\\j-b-j\\Downloads\\Registros sismicos\\Registros Sismicos 16A\\Portoviejo\\APO1_201604162359_N_100.txt";
let fallos = 0; const ok = (c: boolean, t: string) => { console.log(`${c ? "OK   " : "FALLA"} ${t}`); if (!c) fallos++; };
const a = ventana(leerAcelerograma(readFileSync(REG, "latin1"), "cm/s2", "APO1"), 8, 30), r = registro();
let d = 0; for (let i = 0; i < r.length; i++) d = Math.max(d, Math.abs(a.pares[i] - r[i]));
ok(a.pares.length === r.length && d < 1e-12, `acelerograma RENAC: ${a.pares.length / 2} puntos, máx dif ${d.toExponential(1)} (${a.fuente})`);
const m = loadMalla(), mu = muroDe(m)!;
const fu = new Set(m.FUSTE), ce = new Set(caraElems(m));
ok(mu.nodos.length === fu.size && mu.nodos.every((n) => fu.has(n)), `trasdós: ${mu.nodos.length} nudos (validado ${fu.size})`);
ok(mu.elems.length === ce.size && mu.elems.every((e) => ce.has(e)), `cara: ${mu.elems.length} T6 (validado ${ce.size})`);
ok(mu.corona === m.WATCH.corona, `coronación: nudo ${mu.corona + 1} (validado ${m.WATCH.corona + 1})`);
const A = JSON.parse(readFileSync(new URL("../../tests/datos/muro_din_abaqus.json", import.meta.url), "utf-8"));
const E = JSON.parse(readFileSync(new URL("../../tests/datos/muro_empuje_abaqus.json", import.meta.url), "utf-8"));
const t0 = performance.now();
const o = correrDinamico(m, { acc: r, dt: 0.01, tEnd: 22, alpha: 0, xi: 0.05, modosRayleigh: [1, 3], vs: m.MAT.map(() => null) });
console.log(`correrDinamico: ${((performance.now() - t0) / 1000).toFixed(1)} s`);
ok(Math.abs(o.masa - A.masa_total) < 5e-5, `masa ${o.masa.toFixed(4)} (Abaqus ${A.masa_total.toFixed(4)})`);
for (let k = 0; k < 3; k++) ok(Math.abs(o.f[k] - A.f[k]) < 5e-5, `f${k + 1} ${o.f[k].toFixed(4)} (Abaqus ${A.f[k].toFixed(4)})`);
const ux = o.watch[0].ux, ua = A.nudos[String(m.WATCH.corona + 1)].ux as number[];
let du = 0; for (let s = 0; s < ux.length; s++) du = Math.max(du, Math.abs(ux[s] - ua[s]) * 1e3);
ok(du < 5e-5, `u_x coronación, ${ux.length} instantes: máx dif ${du.toExponential(1)} mm`);
let de = 0, im = 0; for (let s = 0; s < E.dinamico.length; s++) { de = Math.max(de, Math.abs(o.empuje!.din[s] - E.dinamico[s])); if (Math.abs(o.empuje!.peso + o.empuje!.din[s]) > Math.abs(o.empuje!.peso + o.empuje!.din[im])) im = s; }
ok(Math.abs(o.empuje!.peso - E.peso) < 5e-5 && de < 5e-5, `empuje: peso ${o.empuje!.peso.toFixed(4)} (Abaqus ${E.peso.toFixed(4)}), máx ${(o.empuje!.peso + o.empuje!.din[im]).toFixed(4)} kN/m en t = ${o.t[im].toFixed(2)} s, historia máx dif ${de.toExponential(1)}`);
console.log(fallos ? `${fallos} FALLOS` : "módulo de la interfaz = lo validado contra Abaqus");
if (fallos) process.exit(1);
