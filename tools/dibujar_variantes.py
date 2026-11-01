# Dibujos de docs/TALUDES_PARAMETRIZADOS.md: cada variante (color) superpuesta al talud BASE (gris a trazos), con los estratos,
# el pie y la cresta del base y su zona de cambio. Lee tests/out/variantes.json (lo escribe `npx tsx tests/taludes_variantes.ts`).
#   python tools/dibujar_variantes.py
import json, os, re
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = json.load(open(os.path.join(RAIZ, "tests", "out", "variantes.json"), encoding="utf-8"))
OUT = os.path.join(RAIZ, "docs", "img"); os.makedirs(OUT, exist_ok=True)
M = D["margenes"]; base = D["base"]; fs0 = D["filas"][0]["fs"]

def slug(s):
    s = s.lower().replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u").replace("′", "").replace("−", "m")
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")

def fs_txt(v): return f"{v:.4f}" if v else "<1"

def panel(ax, f, grande=True):
    xs, zs = zip(*base)
    for it in D["interfaces"]:
        a, b = zip(*it); ax.plot(a, b, color="#2c7be5", lw=1.2, ls=(0, (6, 4)))
    ax.fill_between([p[0] for p in f["terreno"]], [p[1] for p in f["terreno"]], M["bottom"], color="#f3e3cf", zorder=0)
    ax.plot(xs, zs, color="#5a5a5a", lw=2.2, ls=(0, (7, 5)), label="talud base", zorder=3)
    if f["suf"]:
        a, b = zip(*f["terreno"]); ax.plot(a, b, color="#e0561b", lw=2.4, label="variante", zorder=4)
        z0, z1 = f["zona"]
        if z0 is not None and z1 is not None and z1 - z0 < 1e3: ax.axvspan(max(z0, M["xmin"]), min(z1, M["xmax"]), color="#e0561b", alpha=0.07, zorder=0)
    ax.plot(*D["pie"], "o", color="#0a6e3a", ms=6, zorder=5); ax.plot(*D["cresta"], "s", color="#0a6e3a", ms=6, zorder=5)
    if grande:
        ax.annotate("pie", D["pie"], xytext=(-28, 8), textcoords="offset points", color="#0a6e3a", fontsize=9)
        ax.annotate("cresta", D["cresta"], xytext=(-14, 10), textcoords="offset points", color="#0a6e3a", fontsize=9)
    fs = f["fs"]; d = (fs[0] / fs0[0] - 1) * 100 if fs and fs[0] and f["suf"] else None
    ax.set_title(f"{f['nombre']}\nFS {' / '.join(fs_txt(v) for v in fs)}" + (f"   (etapa 1: {d:+.1f} %)" if d is not None else ""), fontsize=10 if grande else 8.5)
    ax.set_xlim(M["xmin"], M["xmax"]); ax.set_ylim(-14, 1.5); ax.set_aspect("equal"); ax.grid(alpha=0.25)
    ax.tick_params(labelsize=7 if not grande else 8)
    ax.text(0.5, 0.45, "Hekatan Engineers", transform=ax.transAxes, ha="center", va="center", fontsize=22 if grande else 13, color="#000", alpha=0.07, rotation=0, zorder=1)

for f in D["filas"]:
    fig, ax = plt.subplots(figsize=(8.4, 3.6), dpi=130)
    panel(ax, f); ax.set_xlabel("x [m]", fontsize=8); ax.set_ylabel("z [m]", fontsize=8)
    if f["suf"]: ax.legend(loc="lower right", fontsize=8)
    fig.tight_layout(); fig.savefig(os.path.join(OUT, f"variante_{slug(f['nombre'])}.png")); plt.close(fig)

n = len(D["filas"]); cols = 3; rows = (n + cols - 1) // cols
fig, axs = plt.subplots(rows, cols, figsize=(15, 2.75 * rows), dpi=110)
for i, ax in enumerate(axs.flat):
    if i < n: panel(ax, D["filas"][i], grande=False)
    else: ax.axis("off")
fig.suptitle("El MISMO talud (Demo04 de GEO5): base en gris a trazos, variante en naranja · pie ● y cresta ■ del base · FS etapas 1/2/3", fontsize=11)
fig.tight_layout(); fig.savefig(os.path.join(OUT, "variantes_todas.png")); plt.close(fig)
print("PNG en", OUT, ":", len(D["filas"]) + 1)
