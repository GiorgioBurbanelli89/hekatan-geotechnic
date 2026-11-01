// Cada llamada al retorno de Mohr-Coulomb de GEO5 (FUN_005a67e0, mohrcoulomb_rp.cpp; FRGeoFEM.exe 5.2022, base 0x400000):
// σ de prueba al entrar y σ devuelta al salir (xx yy xy zz, 17 cifras) + palabra de banderas (DAT_007227a4)+0x220 + error (DAT_0071e384)+0x354.
// NORMS = cada llamada a FUN_005eb0a0 (normas de una iteración de Newton).
'use strict';
var base = Process.getModuleByName('FRGeoFEM.exe').base;
var fp = new File("__OUT__", 'w'); var ncall = 0, niter = 0;
function rd(p, k) { var a = []; for (var i = 0; i < k; i++) a.push(p.add(i * 8).readDouble().toExponential(16)); return a.join(" "); }
var G1 = base.add(0x7227a4 - 0x400000), G2 = base.add(0x71e384 - 0x400000);
Interceptor.attach(base.add(0x5eb0a0 - 0x400000), { onEnter: function (a) { niter++; fp.write("NORMS " + niter + " " + ncall + "\n"); } });
Interceptor.attach(base.add(0x5a67e0 - 0x400000), {
  onEnter: function (a) { this.k = ncall++; this.p = a[0]; this.t = rd(a[0], 4);
    try { G1.readPointer().add(0x220).writeU32(G1.readPointer().add(0x220).readU32()); } catch (e) {} },
  onLeave: function (r) { var fl = -1, er = -1; try { fl = G1.readPointer().add(0x220).readU32(); } catch (e) {} try { er = G2.readPointer().add(0x354).readU32(); } catch (e) {}
    fp.write("MC " + this.k + " " + this.t + " | " + rd(this.p, 4) + " | " + fl.toString(16) + " " + er + "\n"); }
});
// tangente: FUN_005a8680(p1, gp, out) -> out = 4 punteros a filas de 4 dobles (xx yy xy zz), copiada por FUN_0062d5b0
Interceptor.attach(base.add(0x5a8680 - 0x400000), {
  onEnter: function (a) { this.o = a[2]; },
  onLeave: function (r) { var t = []; try { for (var i = 0; i < 4; i++) { var row = this.o.add(4 * i).readPointer(); for (var j = 0; j < 4; j++) t.push(row.add(8 * j).readDouble().toExponential(12)); } } catch (e) { t.push("ERR"); }
    fp.write("TG " + ncall + " " + t.join(" ") + "\n"); }
});
send("mc_dump armado");
