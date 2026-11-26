// Columna excéntrica (GEO5 «Stress in the Footing Bottom»: e = (M + H·t + N·p)/Q). Comprueba:
//  1) x_c = y_c = 0 → idéntico al caso de Guerra (σ 15.589 / 10.621);
//  2) x_c ≠ 0 ≡ columna centrada con My' = My − N·x_c (y_c ≡ Mx' = Mx + N·y_c), en TODOS los resultados.
//   npx tsx tests/zapata_columna_excentrica.ts
import { calcularZapata, ZAPATA_GUERRA } from "../src/footing/zapata";
let fallos = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "OK  " : "FALLA"} ${m}`); if (!c) fallos++; };
const r0 = calcularZapata({ ...ZAPATA_GUERRA });
ok(Math.abs(r0.sigMax - 15.589) < 5e-4 && Math.abs(r0.sigMin - 10.621) < 5e-4, `centrada: σ ${r0.sigMax.toFixed(4)} / ${r0.sigMin.toFixed(4)}`);
const comp = (a: ReturnType<typeof calcularZapata>, b: ReturnType<typeof calcularZapata>) => {
  let m = 0; for (const k of ["V", "ex", "ey", "sigEf", "sigMax", "sigMin", "Rd", "FS", "ert", "bef", "lef"] as const) m = Math.max(m, Math.abs((a[k] as number) - (b[k] as number)) / Math.max(1, Math.abs(b[k] as number)));
  m = Math.max(m, Math.abs((a.asiento?.s ?? 0) - (b.asiento?.s ?? 0)), Math.abs((a.winkler?.sMax ?? 0) - (b.winkler?.sMax ?? 0)));
  return m;
};
for (const [xc, yc] of [[0.3, 0], [-0.5, 0], [0, 0.4], [0.25, -0.35], [(3.45 - 0.45) / 2, 0]]) {
  const N = ZAPATA_GUERRA.N, a = calcularZapata({ ...ZAPATA_GUERRA, xc, yc });
  const b = calcularZapata({ ...ZAPATA_GUERRA, My: ZAPATA_GUERRA.My - N * xc, Mx: ZAPATA_GUERRA.Mx + N * yc });
  const m = comp(a, b);
  ok(m < 1e-9, `x_c ${xc} y_c ${yc}: e = (${a.ex.toFixed(4)}, ${a.ey.toFixed(4)}) σ ${a.sigMax.toFixed(3)}/${a.sigMin.toFixed(3)} FS ${a.FS.toFixed(3)} ≡ My' ${(ZAPATA_GUERRA.My - N * xc).toFixed(2)} Mx' ${(N * yc).toFixed(2)} (dif rel ${m.toExponential(1)})`);
}
console.log(fallos ? `${fallos} FALLAS` : "columna excéntrica: todo OK"); if (fallos) process.exit(1);
