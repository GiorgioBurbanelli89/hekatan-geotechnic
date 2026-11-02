# -*- coding: utf-8 -*-
"""Tanda 14: solver REAL GEO5 2024 (geo5_solver, sin GUI) + Frida en las tangentes de Mohr-Coulomb de FRGeoFEM.exe 2024
(FRGeoFEM24_main_decomp.c, base 0x400000): FUN_00561b60 = TangentOperator_Mohr-Coulomb_rp, FUN_00565f20 = _tc.
Para el elemento EL (número de GEO5, 1-based) vuelca en <carpeta>/tg.txt: función, paso (escrituras de Restart_Step),
banderas del PG (+0x280 del registro), σ de entrada (*(p2+0x38)) y la D 6×6 de salida (param_3: 6 filas de 6 dobles).
Corta al terminar el paso KMAX.   Uso: python fr14.py <carpeta> [EL=521] [KMAX=3]"""
import sys, os, frida
sys.path.insert(0, os.path.expanduser("~") + r"\Documents\Hekatan Calc 1.0.0\ingenieria-inversa\hekatan-geo5-bridge\tools")
import geo5_solver as G
d = os.path.abspath(sys.argv[1]); EL = int(sys.argv[2]) if len(sys.argv) > 2 else 521; KMAX = int(sys.argv[3]) if len(sys.argv) > 3 else 3
JS = r"""
'use strict';
var base = Process.getModuleByName('FRGeoFEM.exe').base;
function A(x) { return base.add(x - 0x400000); }
var fp = new File("__OUT__", 'w'); var paso = 0;
send("cadena rp: " + A(0x60d1c8).readCString());
function rd(p, k) { var a = []; for (var i = 0; i < k; i++) a.push(p.add(i * 8).readDouble().toExponential(16)); return a.join(" "); }
var nprobe = 0;
send("ins: " + [0,1,2,3,4,5,6,7].map(function(k){ try { var i = Instruction.parse(k===0?A(0x561b60):this_); return ""; } catch(e) { return ""; } }).join(""));
(function(){ var p = A(0x561b60); var out = []; for (var k = 0; k < 12; k++) { var ins = Instruction.parse(p); out.push(ins.toString()); p = ins.next; } send("rp: " + out.join(" ; ")); })();
function hook(addr, nom) {
  Interceptor.attach(A(addr), {
    onEnter: function (a) { this.p1 = this.context.ecx; this.p2 = this.context.edx; this.p3 = this.context.esp.add(4).readPointer(); try { this.el = this.p1.add(0x4c).readS32(); } catch (e) { this.el = -1; }
      if (nprobe < 6) { nprobe++; var e = this.context.esp; send(nom + " ecx " + this.context.ecx + " edx " + this.context.edx + " s1 " + e.add(4).readPointer() + " s2 " + e.add(8).readPointer() + " s3 " + e.add(12).readPointer() + " eax " + this.context.eax + " el " + this.el); } },
    onLeave: function (r) {
      try {
        if (this.el !== __EL__) return;
        function T(f) { try { return f(); } catch (e) { return "X"; } }
        var p2 = this.p2, p3 = this.p3;
        var fl = T(function () { return p2.add(0x340 + 0x280).readU32().toString(16); }), fl2 = T(function () { return p2.add(0xc8 + 0x280).readU32().toString(16); });
        var w = []; for (var i = 0; i < 24; i++) w.push(T(function () { return p2.add(0x30 + 4 * i).readU32().toString(16); }));
        var s38 = T(function () { return rd(p2.add(0x38).readPointer(), 4); }), s44 = T(function () { return rd(p2.add(0x44).readPointer(), 4); });
        var ph = T(function () { return p2.add(0x340 + 0x48).readDouble(); }), ph2 = T(function () { return p2.add(0xc8 + 0x48).readDouble(); });
        var D = []; for (var i = 0; i < 6; i++) D.push(T(function () { return rd(p3.add(4 * i).readPointer(), 6); }));
        fp.write(nom + " paso " + paso + " fl " + fl + " fl2 " + fl2 + " phi " + ph + " phi2 " + ph2 + " s38 " + s38 + " s44 " + s44 + " W " + w.join(",") + " D " + D.join(" ") + "\n");
      } catch (e) { fp.write("ERR " + e + "\n"); }
    }
  });
}
hook(0x561b60, "rp"); hook(0x565f20, "tc");
recv('paso', function onMsg(m) { paso = m.payload; fp.flush(); recv('paso', onMsg); });
send("armado");
"""
inp = os.path.join(d, "Input.txt"); G.rutas_a_su_carpeta(inp)
s = G.Geo5Solver(cwd=d); st = {"h": None, "n": 0}
def mirar():
    try: h = os.stat(os.path.join(d, "Restart_Step.bin")).st_mtime_ns
    except OSError: return False
    if h != st["h"]:
        st["h"] = h; st["n"] += 1; sc.post({"type": "paso", "payload": st["n"]})
    return st["n"] > KMAX
try:
    s.start()
    ses = frida.attach(s.proc.pid)
    sc = ses.create_script(JS.replace("__OUT__", os.path.join(d, "tg.txt").replace("\\", "/")).replace("__EL__", str(EL)))
    sc.on("message", lambda m, dd: print("  frida:", m.get("payload", m), flush=True)); sc.load()
    s.calcular(inp, os.path.join(d, "OutputFile.txt"), "", 3600, cancelar=mirar)
finally:
    try: sc.unload(); ses.detach()
    except Exception: pass
    s.close()
