# -*- coding: utf-8 -*-
"""Compara peldaño a peldaño de la SRM el Log_File de GEO5 con el log del motor nativo (nat.log).
   python comparar.py <dir> [--todo]   ->  tabla: SRF, n.º de iteraciones, eta, |gi| por iteración, y si converge."""
import re, sys, os
d = sys.argv[1]; todo = "--todo" in sys.argv
def geo5(path):
    txt = open(path, errors="ignore").read(); out = []
    for blk in txt.split("===== REDUCTION STEP =====")[1:]:
        its = [tuple(float(x) for x in m.groups()) for m in re.finditer(r"Iteration process:\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)", blk)]
        sf = re.search(r"Safety Factor\s*=\s*(\S+)", blk); rf = re.search(r"Reduction factor\s*=\s*(\S+)", blk)
        out.append({"sf": float(sf.group(1)) if sf else None, "red": float(rf.group(1)), "its": its, "fallo": "FAILURE" in blk or "EXCEEDED" in blk or not sf, "txt": blk})
    return out
def nat(path):
    out, cur = [], []
    for l in open(path, errors="ignore"):
        m = re.search(r"RS=(\d+) SRF=(\S+) it=\s*(\d+) eta=(\S+) DNorm=(\S+) OBFNorm=(\S+) ENorm=(\S+) \|gi\|=(\S+)", l)
        if m: cur.append((int(m.group(3)), float(m.group(4)), float(m.group(5)), float(m.group(6)), float(m.group(7)), float(m.group(8)), float(m.group(2)))); continue
        m = re.search(r"SRM rs(\d+) paso=(\S+) SRF=(\S+) (CONVERGE|DIVERGE)", l)
        if m: out.append({"sf": float(m.group(3)), "its": cur, "fallo": m.group(4) == "DIVERGE"}); cur = []
    return out
G, N = geo5(os.path.join(d, "Log_File.txt")), nat(os.path.join(d, "nat.log"))
# GEO5: un peldaño que falla no imprime «Safety Factor»; su SRF = el del peldaño anterior convergido / reducción
racc = 1.0
for g in G:
    g["trial"] = 1.0 if not g["its"] or g is G[0] else racc / g["red"]
    if g is G[0]: g["trial"] = 1.0
    if not g["fallo"]: racc = g["trial"]
fmt = lambda it: " ".join("%.2f/%.3e" % (x[1], x[5]) for x in it)
print("%-8s | %-55s | %-55s" % ("SRF", "GEO5: n it  eta/|gi|", "Geotechnic: n it  eta/|gi|"))
for k in range(max(len(G), len(N))):
    g = G[k] if k < len(G) else None; n = N[k] if k < len(N) else None
    srf = (g["trial"] if g else n["sf"])
    gs = ("%s %2d  %s" % ("DIV" if g["fallo"] else "ok ", len(g["its"]), fmt(g["its"] if todo else g["its"][:4]))) if g else "-"
    ns = ("%s %2d  %s" % ("DIV" if n["fallo"] else "ok ", len(n["its"]), fmt(n["its"] if todo else n["its"][-4:] if k == 0 else n["its"][:4]))) if n else "-"
    print("%-8.4f | %-55s | %-55s%s" % (srf, gs, ns, "" if not n or abs(n["sf"] - srf) < 1e-3 else "  (nat SRF %.4f)" % n["sf"]))
