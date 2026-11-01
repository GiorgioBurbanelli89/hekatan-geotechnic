# -*- coding: utf-8 -*-
"""PNG del mecanismo de Abaqus: |u_SRM − u_gravedad| en el último incremento convergido (izq.) y desplazamiento de la cresta
contra el SRF (der.).   python tests/validacion_abaqus/graficas_srm.py simple [berma ...]"""
import json, os, sys
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.tri as mtri

AQUI = os.path.dirname(os.path.abspath(__file__))


def una(caso):
    d = os.path.join(AQUI, "_trabajo", caso.split("__")[0])   # sufijo de variante: caso__dt1e-6
    o = json.load(open(os.path.join(d, "srm_%s.json" % caso)))
    fila = json.load(open(os.path.join(AQUI, "resultados", caso + ".json")))
    s0, s1 = fila["s0"], fila["s1"]
    lab = sorted(o["xy"], key=int); idx = {k: i for i, k in enumerate(lab)}
    x = [o["xy"][k][0] for k in lab]; y = [o["xy"][k][1] for k in lab]
    tri = []
    for e, c in o["con"].items():                       # T6 → 4 triángulos de 3 nudos (esquinas + medios)
        a, b, cc, m1, m2, m3 = [idx[str(n)] for n in c]
        tri += [[a, m1, m3], [m1, b, m2], [m3, m2, cc], [m1, m2, m3]]
    ug, us = o["pasos"]["GRAVEDAD"]["U"], o["pasos"]["SRM"]["U"]
    du = [((us[k][0] - ug[k][0]) ** 2 + (us[k][1] - ug[k][1]) ** 2) ** 0.5 * 1000 for k in lab]
    t = o["pasos"]["SRM"]["t_ultimo_frame"]
    fig, (ax, bx) = plt.subplots(1, 2, figsize=(14, 5), gridspec_kw=dict(width_ratios=[2.2, 1]))
    T = mtri.Triangulation(x, y, tri)
    cf = ax.tricontourf(T, du, 20, cmap="jet")
    ax.triplot(T, lw=0.08, color="k", alpha=0.3)
    plt.colorbar(cf, ax=ax, label="|Δu| SRM (mm)")
    cx, cy = fila["cresta_xy"]; ax.plot([cx], [cy], "wo", mec="k")
    ax.set_aspect("equal"); ax.set_title("Abaqus 2017 CPE6, %s: último SRF convergido %.4f" % (caso, s0 + (s1 - s0) * t))
    h = o["pasos"]["SRM"]["hist"]
    srf = [s0 + (s1 - s0) * a for a, _ in h["U1"]]
    um = [1000 * ((p[1] ** 2 + q[1] ** 2) ** 0.5) for p, q in zip(h["U1"], h["U2"])]
    bx.plot(srf, um, "b.-", ms=2, label="Abaqus (rampa)")
    for f in fila.get("fijos", []):
        if f.get("cresta_u"): bx.plot([f["SRF"]], [1000 * (f["cresta_u"][0] ** 2 + f["cresta_u"][1] ** 2) ** 0.5], "rs")
    for nom, v, col, ls, lw in (("GEO5", fila.get("FS_GEO5"), "g", "-", 3), ("Geotechnic", fila.get("FS_geotechnic"), "m", "--", 1.5)):
        if v: bx.axvline(v, color=col, ls=ls, lw=lw, alpha=0.7, label="%s %.4f" % (nom, v))
    bx.set_xlabel("SRF"); bx.set_ylabel("|u| cresta (mm)"); bx.grid(alpha=0.3); bx.legend(fontsize=8)
    bx.set_title("cresta nudo %s" % fila["cresta"])
    fig.tight_layout()
    p = os.path.join(AQUI, "resultados", caso + "_mecanismo.png"); fig.savefig(p, dpi=110); plt.close(fig)
    print("escrito", p)


if __name__ == "__main__":
    for c in sys.argv[1:]: una(c)
