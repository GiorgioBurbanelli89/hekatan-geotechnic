# -*- coding: utf-8 -*-
"""Los InputFile.txt de TODAS las etapas de GeoFEM (capturados en ~Ge*.tmp) → un modelo POR ETAPAS de Hekatan Geotechnic con la
MISMA malla de GEO5 (nudo a nudo) y la misma activación de elementos de cada etapa.

    python tools/geofem_etapas_a_modelo.py <carpeta con *_InputFile.txt> <salida.json> "SOIL_57D6=ARENA_SP:18.5" "SOIL_F9BE=ARENA_SPSM:17.5" "RIGID=HORMIGON:2.5e10:0.2:23"

· Cada InputFile trae solo los nudos y elementos ACTIVOS de su etapa (título «PHASE n»); el de la última los trae todos.
· La etapa 1 («terreno») no se capturó: sus elementos son los de la etapa 2 que están por debajo de z = Z1 (base del muro).
· Los apoyos MX/MY salen del InputFile de la última etapa. El cuerpo rígido (`rigidbody`) no trae módulo: se da E.
"""
import json, os, re, sys

carpeta, out = sys.argv[1], sys.argv[2]
extra = dict(a.split("=", 1) for a in sys.argv[3:])
Z1 = float(os.environ.get("Z1", "-3.9"))


def leer(path):
    return open(path, encoding="latin-1").read().splitlines()


def section(L, name):
    s = None
    for i, l in enumerate(L):
        if s is None and re.match(r"\s*%s\s*$" % re.escape(name), l): s = i + 1
        elif s is not None and re.match(r"\s*end\s*$", l): return L[s:i]
    return []


def expand(rng):
    r = []
    for p in rng.split(","):
        p = p.strip()
        if "-" in p: a, b = p.split("-"); r += list(range(int(a), int(b) + 1))
        elif p: r.append(int(p))
    return r


# --- un InputFile por etapa (el último de cada «PHASE n»)
por_etapa = {}
for f in sorted(os.listdir(carpeta)):
    if not f.endswith("_InputFile.txt"): continue
    L = leer(os.path.join(carpeta, f))
    t = next((l for l in L if "title=" in l), "")
    m = re.search(r"PHASE (\d+)", t)
    if m: por_etapa[int(m.group(1))] = (f, L)
etapas = sorted(por_etapa)
print("etapas capturadas:", etapas, [por_etapa[k][0][:6] for k in etapas])
Lf = por_etapa[etapas[-1]][1]

# --- malla de la última etapa (todos los nudos y elementos)
nid0, XY = {}, []
for l in section(Lf, "nodes"):
    m = re.match(r"\s*(\d+)\s+x=([-0-9.E+]+)\s+y=([-0-9.E+]+)", l)
    if m: nid0[int(m.group(1))] = len(XY); XY.append((float(m.group(2)), float(m.group(3))))
# nudos de `multi_nodes`: GEO5 los trata como UNO (las regiones se mallan por separado y se unen aquí)
parent = list(range(len(XY)))
def find(i):
    while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
    return i
nmulti = 0
for l in section(Lf, "multi_nodes"):
    m = re.search(r"multi_node=\[([0-9,]+)\]", l)
    if not m: continue
    g = [nid0[int(x)] for x in m.group(1).split(",") if int(x) in nid0]
    for b in g[1:]:
        ra, rb = find(g[0]), find(b)
        if ra != rb: parent[max(ra, rb)] = min(ra, rb); nmulti += 1
roots = sorted(set(find(i) for i in range(len(XY))))
newi = {r: k for k, r in enumerate(roots)}
nid = {gn: newi[find(i)] for gn, i in nid0.items()}
X = [XY[r][0] for r in roots]; Y = [XY[r][1] for r in roots]
ELE, EID, EGID = [], {}, []
for l in section(Lf, "elements"):
    m = re.match(r"\s*(\d+)\s+nodes=\[([0-9,]+)\]", l)
    if m and m.group(2).count(",") == 5: EID[int(m.group(1))] = len(ELE); EGID.append(int(m.group(1))); ELE.append([nid[int(x)] for x in m.group(2).split(",")])
nflip = 0
for e, c in enumerate(ELE):
    if (X[c[1]] - X[c[0]]) * (Y[c[2]] - Y[c[0]]) - (X[c[2]] - X[c[0]]) * (Y[c[1]] - Y[c[0]]) < 0:
        ELE[e] = [c[0], c[2], c[1], c[5], c[4], c[3]]; nflip += 1

# --- materiales
tipos = {}
for l in section(Lf, "material_types"):
    m = re.search(r'type="([^"]+)"\s+(\w+)(.*)', l)
    if m: tipos[m.group(1)] = (m.group(2), dict(re.findall(r"(\w+)=([-0-9.E+]+)", m.group(3))))
MAT, NAMES, RIGID, MODEL = [], [], [], []
EMAT = [0] * len(ELE)
k = 0
for l in section(Lf, "materials"):
    m = re.search(r'"([^"]+)"\s+elements=\[([0-9\- ,]+)\]', l)
    if not m: continue
    t = m.group(1); k += 1
    modelo, p = tipos[t]
    clave = next((c for c in extra if t.startswith(c) or c in t), None)
    if modelo == "rigidbody":
        nom, E, nu, g = (extra.get(clave) or "HORMIGON:2.5e10:0.2:23").split(":")
        MAT.append([float(E), float(nu), 0.0, 0.0, float(g), 0.0]); RIGID.append(True); MODEL.append(0)
    else:
        nom, g = (extra.get(clave) or t + ":18").split(":")
        MAT.append([float(p["E"]), float(p["nu"]), float(p["phi_in"]), float(p["c_in"]), float(g), float(p.get("psi", 0))])
        RIGID.append(False); MODEL.append(1 if modelo == "mohrcoulomb" else 0)
    NAMES.append(nom)
    for eid in expand(m.group(2)):
        if eid in EID: EMAT[EID[eid]] = k

# --- apoyos
FIXED = set()
for l in section(Lf, "constraints"):
    m = re.search(r'"(MX|MY)"\s+nodes=\[([0-9\- ,]+)\]', l)
    if m:
        for gn in expand(m.group(2)):
            j = nid.get(gn)
            if j is not None: FIXED.add(2 * j if m.group(1) == "MX" else 2 * j + 1)

# --- activación por etapa
def ids_activos(L):
    s = set()
    for l in section(L, "elements"):
        m = re.match(r"\s*(\d+)\s+nodes=\[([0-9,]+)\]", l)
        if m and m.group(2).count(",") == 5: s.add(int(m.group(1)))
    return s


act = {k: ids_activos(por_etapa[k][1]) for k in etapas}
cy = [sum(Y[n] for n in c[:3]) / 3 for c in ELE]
stages = []
e1 = [1 if (EGID[i] in act[etapas[0]] and cy[i] < Z1) else 0 for i in range(len(ELE))]
stages.append(dict(name="terreno", loads=["Fg"], active=e1))
for k in etapas:
    stages.append(dict(name="etapa %d" % k, loads=["Fg"], active=[1 if EGID[i] in act[k] else 0 for i in range(len(ELE))]))
nd = 2 * len(X)
model = dict(name="GEO5 etapas (malla de GEO5)", X=X, Y=Y, ELE=ELE, EMAT=EMAT, FIXED=sorted(FIXED), Fg=[0] * nd, Fs=[0] * nd, Fa=[0] * nd,
             MAT=MAT, MATNAMES=NAMES, RIGID=RIGID, recomputeGravity=True, stages=stages, staged=True, MODEL=MODEL,
             REGK=[0] * len(ELE))
json.dump(model, open(out, "w"))
print("%d nudos, %d T6 (%d reordenados), %d gdl fijos, materiales %s, %d etapas; activos por etapa: %s"
      % (len(X), len(ELE), nflip, len(FIXED), list(zip(NAMES, MODEL, RIGID)), len(stages), [sum(s["active"]) for s in stages]))
