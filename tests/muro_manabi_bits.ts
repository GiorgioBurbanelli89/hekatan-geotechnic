// Muro en voladizo de Manabí (Portoviejo, kh 0.336) contra los valores INTERNOS de GEO5 leídos con Frida (20-nov-2026),
// bit a bit, y contra la ventana «In detail» de GEO5 2024 (dos decimales). Misma hoja: hekatan-lisp/ejemplos/172 …
import { muroGeo5, alfaBiseccionGeo5, kCoulomb, kMO } from "../src/wall/geo5Cantilever";

const r = muroGeo5(
  { k: 0.25, h: 2.6, xx: 0.4, v1: 0.7, v2: 1.9, s1: 17.33, gammaC: 23 },
  [{ nombre: "Arena SP", gamma: 18.5, phi: 30, deltaPared: 20, hasta: 3 }, { nombre: "Arena SP-SM", gamma: 17.5, phi: 29.97, deltaPared: 20, hasta: Infinity }],
  { kh: 0.336, kv: 0 },
);
const rad = (g: number) => (g * Math.PI) / 180, psi = Math.atan(0.336), a1 = rad(alfaBiseccionGeo5(30)), dK = rad(30) - 1e-4;
const est = r.fuerzas.find((f) => f.nombre === "Active pressure")!, sis = r.fuerzas.find((f) => f.nombre === "Earthq. - act.pressure")!;
let mal = 0;
const fila = (n: string, h: number, g: number, tol: number) => { const d = h - g, ok = Math.abs(d) <= tol; if (!ok) mal++; console.log(`${ok ? "OK " : "MAL"} ${n.padEnd(22)} Geotechnic ${h.toPrecision(17).padEnd(20)} GEO5 ${String(g).padEnd(20)} dif ${d.toExponential(2)}`); };
console.log("— bit a bit contra Frida (CantileverWall_5.dll) —");
fila("alfa cara virtual [°]", alfaBiseccionGeo5(30), 30.000915527343746, 1e-12);
for (const [phi, a] of [[27, 31.50054931640625], [33, 28.501281738281254], [34.5, 27.748718261718757], [36, 27.001647949218743]] as const) fila(`alfa con phi ${phi}`, alfaBiseccionGeo5(45 - phi / 2), a, 1e-12);
fila("Peso de la cuña", r.pesoCuna, 55.287195935578424, 1e-12);
fila("cuña x desde el fuste", r.xCuna - (0.7 + 0.25 + 2.6 / 17.33), 0.6563994871255965, 1e-12);
fila("cuña z desde arriba", r.Hterreno - r.yCuna, 1.5829687446284182, 1e-12);
fila("Ka cara virtual", kCoulomb(rad(30), dK, a1), 0.6666466332305437, 1e-14);
fila("Kae cara virtual", kMO(rad(30), dK, a1, psi), 1.594497947900209, 1e-14);
fila("Ka talón", kCoulomb(rad(30), rad(20), 0), 0.29731385720545084, 1e-14);
fila("Kae talón", kMO(rad(30), rad(20), 0, psi), 0.6246519605930702, 1e-14);
fila("Empuje Fx", est.Fx, 26.630959107165644, 1e-11);
fila("Empuje Fz", est.Fz, 38.20792194799549, 1e-11);
fila("Incremento sísmico Fx", sis.Fx, 38.389394942694004, 1e-11);
fila("Incremento sísmico Fz", sis.Fz, 65.87199689777745, 1e-11);
console.log("— contra la pantalla de GEO5 2024 (2 decimales) —");
fila("Peso del muro", r.pesoMuro, 47.04, 0.005); fila("Peso de la cuña", r.pesoCuna, 55.29, 0.005);
fila("M resistente", r.Mres, 388.96, 0.005); fila("M volcador", r.Movr, 143.34, 0.005);
fila("H resistente", r.Hres, 119.02, 0.005); fila("H actuante", r.Hact, 99.40, 0.005);
fila("FS vuelco", r.fsVuelco, 2.71, 0.005); fila("FS deslizamiento", r.fsDeslizamiento, 1.20, 0.005);
console.log(mal ? `${mal} MAL` : "todo OK"); if (mal) process.exit(1);
