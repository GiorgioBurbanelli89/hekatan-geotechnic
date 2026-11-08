// Cimentaciones: el módulo de zapata contra GEO5 2024 Spread Footing.
//  (1) Demo01.gpa (ejemplo oficial de GEO5; valores del informe con «Partial results», hoja LISP 104)
//  (2) zapata de Guerra (cap. 5, ej. 1) con el suelo equivalente, corrida en GEO5 (registros/2026-11-08_geotechnic_cimentaciones.md)
import { calcularZapata, ZAPATA_GUERRA, type ZapataDatos } from "../src/footing/zapata";

let fallos = 0;
const chk = (n: string, h: number, g: number, dec: number, tolRel = 0) => {
  const hr = Math.round(h * 10 ** dec) / 10 ** dec, err = g !== 0 ? 100 * (hr / g - 1) : hr;
  const ok = Math.abs(hr - g) <= 1.0001 * 10 ** -dec || Math.abs(err) <= tolRel;   // igual al último decimal que imprime GEO5
  if (!ok) fallos++;
  console.log(`${ok ? "OK " : "XX "} ${n.padEnd(28)} Hekatan ${hr.toFixed(dec).padStart(10)}  GEO5 ${g.toFixed(dec).padStart(10)}  ${err.toFixed(4)} %`);
};

// (1) Demo01: 1.2×1.2, t 0.4, d 1.2, columna 0.4, γc 23, relleno 20; φd 40.21 y γ2 18.95 HOMOGENEIZADOS (dato de GEO5), γ1 17.5
const demo01: ZapataDatos = {
  ...ZAPATA_GUERRA, unidad: "kN", B: 1.2, L: 1.2, h: 0.4, Df: 1.2, cx: 0.4, cy: 0.4, gc: 23, gr: 20,
  gamma: 17.5, gammaBajo: 18.95, gsat: 20, phi: 40.21, c: 5, zw: Infinity, Edef: 0, ks: 0,
  N: 3000, Mx: -2, My: 70, Hx: 14, Hy: 5, FS: 1.5, metodo: "estandar",
};
console.log("== Demo01.gpa (GEO5 2024, Load No. 1) ==");
const r = calcularZapata(demo01);
chk("V [kN]", r.V, 3033.73, 2); chk("b_ef [m]", r.bef, 1.158, 3); chk("σ [kPa]", r.sigEf, 2184.03, 2);
chk("Nq", r.N.Nq, 66.102, 3); chk("Nc", r.N.Nc, 77.010, 3); chk("Nγ", r.N.Ng, 82.552, 3);
chk("sq", r.f.sq, 1.623, 3); chk("dq", r.f.dq, 1.101, 3); chk("i", r.f.iq, 0.990, 3);
chk("Rd [kPa]", r.Rd, 3594.345, 2, 0.001);   // φd entra con los 3 decimales que imprime GEO5 (40.210): 0.0004 %
 chk("FS", r.FS, 1.65, 2);
const r2 = calcularZapata({ ...demo01, N: 820, Mx: 0, My: -200, Hx: 0, Hy: 0 });
chk("σ Load 2 [kPa]", r2.sigEf, 972.62, 2); chk("Rd Load 2 [kPa]", r2.Rd, 3135.26, 2, 0.001); chk("e rel. Load 2", r2.erx, 0.195, 3);

// (2) Guerra cap. 5 ej. 1 con el suelo EQUIVALENTE, en kN (1 t = 9.80665 kN), corrido en GEO5 2024 el 8-nov-2026
//     (Documents/geo5_zapata_guerra/guerra.gpa): γ 17.65, φ 22.2, c 0, Eoed 121 MPa, ν 0.3, m 0.3, d = hz = 1.5,
//     t 0.45, 3.45×3.45, columna 0.45, γ hormigón 23.56, relleno 17.65, N 1186.60, My 166.71; Ecm 30000 (C20/25)
const guerraKN: ZapataDatos = {
  ...ZAPATA_GUERRA, unidad: "kN", gc: 23.56, gr: 17.65, gamma: 17.65, gsat: 19.61, N: 1186.6, My: 166.71,
  Edef: 121 * (1 - 2 * 0.3 ** 2 / 0.7), Ec: 30000, ks: 0,
};
for (const [m, Rd, FS] of [["meyerhof", 427.72, 3.12], ["estandar", 390.05, 2.84], ["vesic", 465.67, 3.39]] as const) {
  console.log(`== Guerra (suelo equivalente) · GEO5 «${m}» ==`);
  const g = calcularZapata({ ...guerraKN, metodo: m });
  chk("σ [kPa]", g.sigEf, 137.18, 2); chk("Rd [kPa]", g.Rd, Rd, 2); chk("FS", g.FS, FS, 2);
  chk("e_x relativa", g.erx, 0.032, 3); chk("b_ef [m]", g.bef, 3.23, 2); chk("Rdh [kN]", g.Rdh, 645.96, 2);
  if (m === "meyerhof") {
    const a = g.asiento!;
    chk("E_def medio [MPa]", guerraKN.Edef, 89.89, 2); chk("k rigidez", a.k, 0.74, 2);
    chk("asiento [mm]", a.s, 1.3, 1);
    chk("zona de influencia [m]", a.zInf, 3.44, 2, 0.3);    // 3.433: GEO5 integra por capas (no las imprime aquí), 0.2 %
    chk("giro x [‰]", Math.abs(a.giroX), 0.072, 3, 1.5);     // 0.0710: misma causa, 1.4 %
  }
}

console.log(fallos ? `\n${fallos} FALLOS` : "\ntodo igual a GEO5");
process.exit(fallos ? 1 : 0);
