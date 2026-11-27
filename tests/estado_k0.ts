// ESTADO INICIAL: carga por gravedad (FEM) vs procedimiento K0 (27-nov-2026, aprobado por Jorge). Comprobaciones a mano:
//   (1) terreno PLANO (sin talud): gravedad elástica → σz = γz y σx = ν/(1−ν)·γz; K0 (Jaky) → σx = (1 − sinφ)·γz EXACTO;
//       K0 con k0 = ν/(1−ν) → igual que la gravedad.
//   (2) asiento por peso propio en la superficie (fase inicial por gravedad, se muestra aunque luego se reinicie): γH²/(2M),
//       M = E(1−ν)/((1+ν)(1−2ν)) (edométrico, base fija y bordes lisos = 1D exacto en elástico).
//   (3) talud de la plantilla excavación + muro: σx a 2/6/10 m bajo la corona con los tres estados iniciales y el FS final de cada uno.
//   npx tsx tests/estado_k0.ts
import { parseHgeo } from "../src/model/dsl";
import { hgeoPlantilla } from "../src/model/plantillas";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFem, GP, t6, type GeoModel, type StageResult } from "../src/geofem/solver";

let bad = 0; const ok = (c: boolean, t: string) => { console.log((c ? "  ✓ " : "  ✗ ") + t); if (!c) bad++; };
/** σ (compresión +) en el punto de Gauss más cercano a (x, z) */
function sigEn(m: GeoModel, r: StageResult, x: number, z: number) {
  let best = Infinity, s: number[] = [];
  m.ELE.forEach((el, e) => { if (m.stages[0].active && !m.stages[0].active[e]) return; GP.forEach((g, q) => { const [N] = t6(g[0], g[1]); let gx = 0, gz = 0; for (let k = 0; k < 6; k++) { gx += N[k] * m.X[el[k]]; gz += N[k] * m.Y[el[k]]; } const d = Math.hypot(gx - x, gz - z); if (d < best) { best = d; const o = (e * 7 + q) * 4; s = [-r.sig1![o], -r.sig1![o + 1], gz]; } }); });
  return { sx: s[0], sz: s[1], z: s[2] };
}
const correr = (txt: string) => { const { model } = meshSlope(parseHgeo(txt)); const f = new GeoFem(model, () => {}); return { model, res: f.run(model) }; };

const E = 20000, nu = 0.3, g = 19, phi = 30, H = 10;
const plano = (ini: string, k0 = "") => `margenes xmin=0 xmax=20 fondo=-${H}\ninterfaz 0,0 20,0\nsuelo S E=${E} nu=${nu} phi=${phi} c=50 gamma=${g}${k0}\nasignar S en 10,-5\nmalla 0.8\ninicial ${ini}\netapa inicial\n`;
console.log("\n(1) terreno plano: σ a 3 profundidades (x = 10, compresión +)");
const Kel = nu / (1 - nu), Kj = 1 - Math.sin((phi * Math.PI) / 180);
const G = correr(plano("gravedad")), K = correr(plano("k0")), Kn = correr(plano("k0", ` k0=${Kel}`));
console.log("   z      γz      grav σz   grav σx (ν/(1−ν)γz)   K0 Jaky σz   σx (Jaky γz)      K0=ν/(1−ν) σx");
for (const zq of [-2, -5, -8]) {
  const a = sigEn(G.model, G.res[0], 10, zq), b = sigEn(K.model, K.res[0], 10, zq), c = sigEn(Kn.model, Kn.res[0], 10, zq), gz = g * -a.z, gzb = g * -b.z, gzc = g * -c.z;
  console.log(`   ${a.z.toFixed(2).padStart(6)} ${gz.toFixed(2).padStart(7)} ${a.sz.toFixed(2).padStart(9)} ${a.sx.toFixed(2).padStart(9)} (${(Kel * gz).toFixed(2)})   ${b.sz.toFixed(3).padStart(9)} ${b.sx.toFixed(3).padStart(9)} (${(Kj * gzb).toFixed(3)})   ${c.sx.toFixed(3)} (${(Kel * gzc).toFixed(3)})`);
  ok(Math.abs(a.sz / gz - 1) < 0.01 && Math.abs(a.sx / (Kel * gz) - 1) < 0.01, `gravedad a z ${a.z.toFixed(2)}: σz = γz y σx = ν/(1−ν)·γz (1 %)`);
  ok(Math.abs(b.sz - gzb) < 1e-9 && Math.abs(b.sx - Kj * gzb) < 1e-9, `K0 Jaky a z ${b.z.toFixed(2)}: σz = γz y σx = (1 − sinφ)·γz exactos`);
  ok(Math.abs(c.sx - Kel * gzc) < 1e-9, `K0 = ν/(1−ν) da lo mismo que la gravedad elástica`);
}
ok((K.res[0].desequilibrio?.max ?? 1) < 1e-6, `K0 en terreno plano está en equilibrio (desequilibrio máx ${K.res[0].desequilibrio?.max.toExponential(2)} kN)`);
console.log("\n(2) asiento por peso propio en la superficie (fase inicial por gravedad)");
{
  const M = (E * (1 - nu)) / ((1 + nu) * (1 - 2 * nu)), an = (g * H * H) / (2 * M);
  const m = G.model, u = G.res[0].uIni!; let k = 0, d = Infinity; for (let i = 0; i < m.X.length; i++) { const q = Math.hypot(m.X[i] - 10, m.Y[i]); if (q < d) { d = q; k = i; } }
  console.log(`   FEM ${(-u[2 * k + 1] * 1e3).toFixed(3)} mm · γH²/(2M) = ${(an * 1e3).toFixed(3)} mm (M = ${M.toFixed(0)} kPa) · d_x ${(u[2 * k] * 1e3).toExponential(2)} mm`);
  ok(Math.abs(-u[2 * k + 1] / an - 1) < 0.005, "asiento = γH²/(2M) (0.5 %)");
  ok(!K.res[0].uIni, "con K0 no hay desplazamientos (sin cálculo)");
}
console.log("\n(3) talud excavación + muro: σx bajo la corona (x = 33) y FS final con cada estado inicial");
for (const [ini, nom] of [[0, "gravedad"], [1, "K0 Jaky"], [2, "K0 + paso nulo"]] as [number, string][]) {
  const { model, res } = correr(hgeoPlantilla("excavacion_muro", { h: 1, ini }));
  const fila = [6, 2, -2].map((zq) => { const s = sigEn(model, res[0], 33, zq); return `${(8 - s.z).toFixed(1)} m: σz ${s.sz.toFixed(1)} σx ${s.sx.toFixed(1)}`; }).join(" · ");
  const des = res[0].desequilibrio; const fin = res[res.length - 1];
  console.log(`   ${nom.padEnd(15)} ${fila} · desequilibrio ${des ? des.max.toFixed(2) + " kN" : "—"} · FS final ${fin.fs.toFixed(4)} · excavación converge ${res.every((r) => (r.alcanzada ?? 1) === 1)}`);
}
console.log(bad ? `\n✗ ${bad} fallaron` : "\n✓ estado inicial K0 / gravedad: todo bien");
process.exit(bad ? 1 : 0);
