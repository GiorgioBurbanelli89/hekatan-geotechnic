# -*- coding: utf-8 -*-
"""InputFile.txt del solver de GeoFEM (capturado en ~Ge*.tmp) → modelo de Hekatan Geotechnic (JSON, GeoModel).

    python tools/geofem_input_a_modelo.py <InputFile.txt> <salida.json> "SOIL_x=NOMBRE:gamma" ... [RIGID_x=NOMBRE:E:nu:gamma]

La MISMA malla de GEO5 nudo a nudo (como la fixture de Demo04): nudos de `multi_nodes` unidos (grupos de 2 o más: GEO5 los
trata como un solo nudo), T6 reordenados a antihorario, apoyos MX / MY, materiales de `material_types` (mohrcoulomb o
druckerprager: E, ν, φ, c, ψ). El InputFile del cálculo de ESTABILIDAD no trae los pesos (arranca de Restart_In.bin), así que
γ se da en la línea de órdenes; el cuerpo rígido (`rigidbody`) no trae rigidez: se da E y ν (región elástica que la SRM no reduce).
"""
import json, re, sys

src, out = sys.argv[1], sys.argv[2]
extra = dict(a.split("=", 1) for a in sys.argv[3:])
L = open(src, encoding="latin-1").read().splitlines()


def section(name):
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


nid0, XY = {}, []
for l in section("nodes"):
    m = re.match(r"\s*(\d+)\s+x=([-0-9.E+]+)\s+y=([-0-9.E+]+)", l)
    if m: nid0[int(m.group(1))] = len(XY); XY.append((float(m.group(2)), float(m.group(3))))
parent = list(range(len(XY)))


def find(i):
    while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
    return i


nmulti = 0
for l in section("multi_nodes"):
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

ELE, EID = [], {}
for l in section("elements"):
    m = re.match(r"\s*(\d+)\s+nodes=\[([0-9,]+)\]", l)
    if m: EID[int(m.group(1))] = len(ELE); ELE.append([nid[int(x)] for x in m.group(2).split(",")])
nflip = 0
for e, c in enumerate(ELE):
    if (X[c[1]] - X[c[0]]) * (Y[c[2]] - Y[c[0]]) - (X[c[2]] - X[c[0]]) * (Y[c[1]] - Y[c[0]]) < 0:
        ELE[e] = [c[0], c[2], c[1], c[5], c[4], c[3]]; nflip += 1

tipos = {}
for l in section("material_types"):
    m = re.search(r'type="([^"]+)"\s+(\w+)(.*)', l)
    if m: tipos[m.group(1)] = (m.group(2), dict(re.findall(r"(\w+)=([-0-9.E+]+)", m.group(3))))
orden, MAT, NAMES, RIGID, MODEL = [], [], [], [], []
EMAT = [0] * len(ELE)
for l in section("materials"):
    m = re.search(r'"([^"]+)"\s+elements=\[([0-9\- ,]+)\]', l)
    if not m: continue
    t = m.group(1); orden.append(t); k = len(orden)
    modelo, p = tipos[t]
    clave = next((c for c in extra if t.startswith(c) or c in t), None)
    if modelo == "rigidbody":
        nom, E, nu, g = (extra.get(clave) or "HORMIGON:21166510:0.2:23").split(":")
        MAT.append([float(E), float(nu), 0.0, 0.0, float(g), 0.0]); RIGID.append(True); MODEL.append(0)
    else:
        nom, g = (extra.get(clave) or t + ":18").split(":")
        MAT.append([float(p["E"]), float(p["nu"]), float(p["phi_in"]), float(p["c_in"]), float(g), float(p.get("psi", 0))])
        RIGID.append(False); MODEL.append(1 if modelo == "mohrcoulomb" else 0)
    NAMES.append(nom)
    for eid in expand(m.group(2)):
        if eid in EID: EMAT[EID[eid]] = k
FIXED = set()
for l in section("constraints"):
    m = re.search(r'"(MX|MY)"\s+nodes=\[([0-9\- ,]+)\]', l)
    if m:
        for gn in expand(m.group(2)):
            j = nid.get(gn)
            if j is not None: FIXED.add(2 * j if m.group(1) == "MX" else 2 * j + 1)
nd = 2 * len(X)
model = dict(name="GEO5 " + src.split("\\")[-1].split("/")[-1], X=X, Y=Y, ELE=ELE, EMAT=EMAT, FIXED=sorted(FIXED), Fg=[0] * nd, Fs=[0] * nd, Fa=[0] * nd,
             MAT=MAT, MATNAMES=NAMES, RIGID=RIGID, recomputeGravity=True, stages=[dict(name="peso propio", loads=["Fg"])])
if any(MODEL): model["MODEL"] = MODEL
json.dump(model, open(out, "w"))
print("%d nudos (de %d; %d unidos por multi_nodes), %d T6 (%d reordenados), %d gdl fijos, materiales %s"
      % (len(X), len(XY), nmulti, len(ELE), nflip, len(FIXED), [(n, "MC" if mo else ("rígido" if r else "DP")) for n, mo, r in zip(NAMES, MODEL, RIGID)]))
