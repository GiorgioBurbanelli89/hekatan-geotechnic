# -*- coding: utf-8 -*-
"""PNG del mecanismo de rotura de cada corrida de tools/variaciones_muro_manabi.ts (matplotlib, SIN ventana).

    python tools/variaciones_muro_manabi_png.py [id ...]

Lee tools/variaciones_muro_manabi/<id>_malla.json (malla de Geotechnic + incremento Δu entre los dos últimos
peldaños convergidos de la SRM) y dibuja: arriba la deformación de corte γ del incremento por elemento (la banda
es la superficie de rotura), abajo la malla con |Δu| y las flechas. El dibujo es de matplotlib; los números son
los que salen del programa. Geotechnic solo dibuja en el navegador (canvas), no tiene salida PNG por consola.
"""
import glob, json, os, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.tri as mtri
import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(AQUI, "variaciones_muro_manabi")


def dibujar(f):
    d = json.load(open(f, encoding="utf-8"))
    X, Y, T = np.array(d["X"]), np.array(d["Y"]), np.array(d["T"])
    gam, du = np.array(d["gam"]), np.array(d["du"])
    tri = mtri.Triangulation(X, Y, T)
    fig, ax = plt.subplots(2, 1, figsize=(12, 7.6), facecolor="black")
    for a in ax:
        a.set_facecolor("black"); a.set_aspect("equal"); a.tick_params(colors="w"); a.set_xlim(0, 30); a.set_ylim(-12, 0.5)
        for s in a.spines.values(): s.set_color("#666")
    g = gam / gam.max() if gam.max() > 0 else gam
    pc = ax[0].tripcolor(tri, facecolors=g, cmap="jet", vmin=0, vmax=1)
    ax[0].set_title(f"{d['id']}: {d['que']} · FS = {d['fs']:.3f}\ndeformación de corte del incremento (γ / γmáx): la banda es la rotura", color="w", fontsize=10)
    fig.colorbar(pc, ax=ax[0], fraction=0.02).ax.tick_params(colors="w")
    ax[1].triplot(tri, color="#444", lw=0.3)
    pc2 = ax[1].tripcolor(tri, du / du.max(), shading="gouraud", cmap="jet", vmin=0, vmax=1, alpha=0.85)
    k = np.arange(0, len(X), max(1, len(X) // 700))
    ax[1].quiver(X[k], Y[k], np.array(d["dux"])[k], np.array(d["duy"])[k], color="w", scale=None, width=0.0012)
    ax[1].set_title(f"|Δu| / |Δu|máx entre los dos últimos peldaños de la SRM y malla ({len(X)} nudos, {len(T)} T6)", color="w", fontsize=10)
    fig.colorbar(pc2, ax=ax[1], fraction=0.02).ax.tick_params(colors="w")
    rig = np.array([bool(d["rigido"][m - 1]) for m in d["M"]])
    for a in ax:   # el muro: sus T6 en blanco
        a.triplot(mtri.Triangulation(X, Y, T[rig]), color="w", lw=0.6)
    fig.text(0.5, 0.5, "Hekatan Engineers", color="w", alpha=0.10, fontsize=48, ha="center", va="center")
    fig.tight_layout()
    out = f.replace("_malla.json", ".png")
    fig.savefig(out, dpi=110, facecolor="black"); plt.close(fig)
    print(out)


if __name__ == "__main__":
    ids = sys.argv[1:]
    fs = [os.path.join(D, f"{i}_malla.json") for i in ids] if ids else sorted(glob.glob(os.path.join(D, "*_malla.json")))
    for f in fs: dibujar(f)
