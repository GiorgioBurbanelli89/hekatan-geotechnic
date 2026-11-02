# Tanda 12: mapa nudos del InputFile de GEO5 (5686, orden del Input = orden de la memoria y del Restart_Step) -> nudos del JSON (5537).
# CORRIGE t11/mapa.py: los IDs del Input NO son consecutivos (1..6122 con huecos); mapa.py usaba índice+1 como ID al elegir
# el nudo del SUELO entre coincidentes, y en los huecos cogía a veces la copia del RÍGIDO (lado medio sin actualizar).
import numpy as np, re, json, os
from scipy.spatial import cKDTree
txt = open(os.environ.get("T11_INPUT", "g5ex/Input.txt"), encoding="mbcs").read()
nod = re.findall(r"^\s+(\d+) x=(\S+) y=(\S+)\s*$", txt.split("\n  faces")[0], re.M)
IDS = np.array([int(a) for a, _, _ in nod]); POS = {i: k for k, i in enumerate(IDS)}
XY = np.array([[float(a), float(b)] for _, a, b in nod])
el = txt.split("\n  elements")[1].split("\n  end")[0]
E = [[POS[int(x)] for x in m.split(",")] for m in re.findall(r"nodes=\[([\d,]+)\]", el)]   # ÍNDICES (no IDs)
suelo = set(i for e in E[23:] for i in e); rig = set(i for e in E[:23] for i in e)
m = json.load(open(os.path.expanduser("~") + r"\Documents\Hekatan Calc 1.0.0\hekatan-geotechnic\examples\geofem_muro_manabi_malla.json", encoding="utf-8"))
X = np.array(m["X"]); Y = np.array(m["Y"]); nn = len(X)
t = cKDTree(XY); cands = t.query_ball_point(np.stack([X, Y], 1), 1e-9)
IDX = np.array([(sorted([c for c in cs if c in suelo]) or sorted(cs))[0] for cs in cands])
def a_json(v):  # v (5686,2) -> (2nn,)
    o = np.zeros(2 * nn); o[0::2] = v[IDX, 0]; o[1::2] = v[IDX, 1]; return o
