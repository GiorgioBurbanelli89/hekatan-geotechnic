# -*- coding: utf-8 -*-
r"""Extrae los sigma NODALES (sx sy txy sz) de un Restart_In.bin de GEO5 (mismo lector que tests/muro_agua_vs_geo5.ts: registro localizado por la marca
04000000 01000000, x e y antes, 4 doubles a +8..+32 de la marca) y los asigna a los nudos de modelo.txt por coordenada (4 decimales).
Escribe semilla.txt: una linea por nudo del modelo: sx sy sz txy flag   (orden de SIG de Geotechnic: xx yy zz xy)."""
import struct, json, os, sys
AQUI = os.path.dirname(os.path.abspath(__file__))
rin = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~") + r"\Documents\Hekatan Calc 1.0.0\ingenieria-inversa\hekatan-geo5-bridge\geofem_capture\files_muro\160304_Restart_In.bin"
b = open(rin, "rb").read(); MARC = bytes.fromhex("0400000001000000")
cnt = struct.unpack_from("<i", b, 12)[0]; o = 16; g5 = {}
for k in range(cnt):
    m = b.find(MARC, o)
    if m < 0: break
    x, y = struct.unpack_from("<2d", b, o + 4)
    s = struct.unpack_from("<4d", b, m + 8)            # sx sy txy sz
    g5["%.4f,%.4f" % (x, y)] = s; o = m + 40
m = json.load(open(os.path.join(AQUI, "..", "..", "examples", "geofem_muro_manabi_malla.json"), encoding="utf-8"))
n = 0; out = []
for x, y in zip(m["X"], m["Y"]):
    s = g5.get("%.4f,%.4f" % (x, y))
    if s: n += 1; out.append("%r %r %r %r 1" % (s[0], s[1], s[3], s[2]))
    else: out.append("0 0 0 0 0")
open(os.path.join(AQUI, "semilla.txt"), "w").write("\n".join(out) + "\n")
print("registros del .bin:", cnt, "leidos:", len(g5), "| nudos del modelo con sigma de GEO5:", n, "/", len(m["X"]))
print("ejemplo nudo 0:", out[0], "| nudo 3000:", out[3000])
