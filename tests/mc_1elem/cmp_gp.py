# -*- coding: utf-8 -*-
"""Punto de Gauss a punto de Gauss: llamadas al retorno MC de GEO5 (g5_mc.txt, Frida) frente a las del nativo (nat_mc.txt).
   GEO5 solo llama al retorno en los puntos que plastifican; por eso cada llamada de GEO5 se empareja con la llamada del nativo
   de la MISMA iteración global (bloque entre dos NORMS) con la σ de prueba más cercana.
   python cmp_gp.py <dir> <iter0 (1-based)> [n_iter=1]"""
import sys, os
d = sys.argv[1]; K0 = int(sys.argv[2]) - 1; NI = int(sys.argv[3]) if len(sys.argv) > 3 else 1
def leer(f):
    it, cur = [], []
    for l in open(os.path.join(d, f)):
        if l.startswith("NORMS"): it.append(cur); cur = []; continue
        if l.startswith("MC"):
            a, b, c = l.split("|"); t = [float(x) for x in a.split()[2:]]; o = [float(x) for x in b.split()]
            cur.append((t, o, c.strip()))
    it.append(cur); return it
G, N = leer("g5_mc.txt"), leer("nat_mc.txt")
dist = lambda a, b: max(abs(x - y) for x, y in zip(a, b))
print("GEO5: banderas hex (0x80 cara, 0x200 arista F1F2, 0x400 arista F1F3, 0x10 vértice) · nativo: 0 elástico, 1 cara, 2 arista s2=s3, 4 arista s1=s2, 3 ápice")
for k in range(K0, min(K0 + NI, len(G), len(N))):
    nk = [c for c in N[k] if any(abs(v) > 0 for v in c[0])]
    print("iteración global %d: %d llamadas GEO5, %d nativo (sin las de du = 0)" % (k + 1, len(G[k]), len(nk)))
    for a in G[k]:
        b = min(nk, key=lambda c: dist(a[0], c[0]))
        print("  prueba %s  dif %.2e | dev G5 %s | dev NAT %s | dif %.2e | G5 %s NAT %s" % (" ".join("%9.4f" % x for x in a[0]), dist(a[0], b[0]),
              " ".join("%9.4f" % x for x in a[1]), " ".join("%9.4f" % x for x in b[1]), dist(a[1], b[1]), a[2].split()[0], b[2]))
