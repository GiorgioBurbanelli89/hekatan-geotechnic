# -*- coding: utf-8 -*-
"""Lector mínimo del .hgeo de Hekatan Geotechnic (mismo DSL que src/model/dsl.ts) para las herramientas Python
(hgeo_to_geo5.py: teclear el modelo en la GUI de GEO5 FEM y que GEO5 grabe el .gmk con su checksum)."""
import re

def _pts(toks):
    out = []
    for t in toks:
        if "," not in t: continue
        x, z = t.split(",")[:2]; out.append((float(x), float(z)))
    return out

def _kv(toks):
    d = {}
    for t in toks:
        if "=" in t: k, v = t.split("=", 1); d[k.lower()] = v
    return d

def parse_hgeo(text):
    m = {"margins": None, "interfaces": [], "lines": [], "soils": [], "assign": [], "h": 2.5, "stages": [], "title": ""}
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if raw.strip().startswith("#") and not m["title"]: m["title"] = raw.strip("# ").strip()
        if not line: continue
        toks = line.split(); cmd = toks[0].lower()
        if cmd in ("margenes", "márgenes"):
            o = _kv(toks[1:]); m["margins"] = {"xmin": float(o.get("xmin", 0)), "xmax": float(o.get("xmax", 40)), "bottom": float(o.get("fondo", o.get("bottom", -20)))}
        elif cmd in ("interfaz", "interface"): m["interfaces"].append(_pts(toks[1:]))
        elif cmd in ("linea", "línea", "line", "libre"): m["lines"].append(_pts(toks[1:]))
        elif cmd == "suelo":
            o = _kv(toks[2:]); m["soils"].append({"name": toks[1], "E": float(o.get("e", 20000)), "nu": float(o.get("nu", 0.3)), "phi": float(o.get("phi", 25)), "c": float(o.get("c", 5)), "gamma": float(o.get("gamma", 18))})
        elif cmd == "asignar":
            i = toks.index("en"); m["assign"].append({"soil": toks[1], "p": _pts([toks[i + 1]])[0]})
        elif cmd == "malla": m["h"] = float(toks[1])
        elif cmd == "etapa":
            nm = []; i = 1
            while i < len(toks) and "=" not in toks[i]: nm.append(toks[i]); i += 1
            st = {"name": " ".join(nm) or "etapa%d" % (len(m["stages"]) + 1), "surcharges": [], "anchors": []}
            rest = toks[i:]
            for j, t in enumerate(rest):
                if t.lower().startswith("q="):
                    en = rest.index("en", j); a = _pts([rest[en + 1]])[0]; b = _pts([rest[en + 3]])[0]; st["surcharges"].append({"q": float(t[2:]), "a": a, "b": b})
                elif t.lower().startswith("f="):
                    en = rest.index("en", j); p = _pts([rest[en + 1]])[0]; o = _kv(rest[en + 2:en + 4]); st["anchors"].append({"F": float(t[2:]), "p": p, "ang": float(o.get("ang", 0))})
            m["stages"].append(st)
    if not m["stages"]: m["stages"].append({"name": "peso propio", "surcharges": [], "anchors": []})
    elif m["stages"][0]["name"].startswith("+"): m["stages"].insert(0, {"name": "peso propio", "surcharges": [], "anchors": []})
    if m["margins"] is None: m["margins"] = {"xmin": 0.0, "xmax": 40.0, "bottom": -20.0}
    return m

if __name__ == "__main__":
    import sys, json
    print(json.dumps(parse_hgeo(open(sys.argv[1], encoding="utf-8").read()), indent=1, ensure_ascii=False))

# ---- geometría como la exige GEO5: una capa no puede solaparse con el terreno ("Input line is partially overlapping
# other line"): se manda solo el tramo estrictamente por DEBAJO, cortado en el cruce exacto (termina en el terreno). ----
def interface_y(P, x):
    if x <= P[0][0]: return P[0][1]
    for i in range(len(P) - 1):
        if x <= P[i + 1][0]:
            t = (x - P[i][0]) / ((P[i + 1][0] - P[i][0]) or 1.0); return P[i][1] + t * (P[i + 1][1] - P[i][1])
    return P[-1][1]

def span(P, xmin, xmax):
    P = sorted(P, key=lambda p: p[0]); out = list(P)
    if out[0][0] > xmin + 1e-9: out.insert(0, (xmin, out[0][1]))
    if out[-1][0] < xmax - 1e-9: out.append((xmax, out[-1][1]))
    return out

def below_terrain(layer, terr):
    """tramos de la capa estrictamente bajo el terreno; los extremos que tocan el terreno son el cruce exacto"""
    if len(layer) < 2: return []
    x0, x1 = layer[0][0], layer[-1][0]
    xs = sorted(set([p[0] for p in layer] + [p[0] for p in terr if x0 + 1e-9 < p[0] < x1 - 1e-9]))
    f = lambda x: interface_y(layer, x) - interface_y(terr, x)
    pts = []
    def put(x):
        d = f(x); pts.append((x, interface_y(layer, x) if d < 0 else interface_y(terr, x), d < -1e-6))
    for i, x in enumerate(xs):
        put(x)
        if i + 1 < len(xs):
            a, b = f(x), f(xs[i + 1])
            if (a < 0 < b) or (a > 0 > b): put(x + (xs[i + 1] - x) * a / (a - b))
    out, cur = [], []
    for i, (x, y, below) in enumerate(pts):
        prevb = pts[i - 1][2] if i > 0 else False; nextb = pts[i + 1][2] if i + 1 < len(pts) else False
        if below or prevb or nextb: cur.append((round(x, 3), round(y, 3)))
        if not below and cur and not nextb:
            if len(cur) >= 2: out.append(cur)
            cur = []
    if len(cur) >= 2: out.append(cur)
    return out

def geo5_interfaces(m):
    """[terreno de margen a margen] + tramos bajo el terreno de cada capa"""
    mg = m["margins"]; terr = span(m["interfaces"][0], mg["xmin"], mg["xmax"]); out = [terr]
    for lay in m["interfaces"][1:]:
        for ch in below_terrain(span(lay, mg["xmin"], mg["xmax"]), terr): out.append(ch)
    return out

def region_at(m, x, y):
    mg = m["margins"]; return sum(1 for it in m["interfaces"] if interface_y(span(it, mg["xmin"], mg["xmax"]), x) > y + 1e-9)

def complete_assign(m):
    """GEO5 exige suelo en TODAS las regiones. Regiones por interfaces (1 = bajo el terreno, k+1 = bajo la capa k):
    las que no tengan punto `asignar` reciben: región 1 → primer suelo; las demás → siguiente suelo libre (como la app).
    El punto va en la x de máximo espesor. Las regiones de líneas libres solo entran si el .hgeo trae su `asignar`."""
    mg = m["margins"]; spans = [span(it, mg["xmin"], mg["xmax"]) for it in m["interfaces"]]
    out = list(m["assign"]); usados = set(a["soil"] for a in out)
    libres = [s["name"] for s in m["soils"] if s["name"] not in usados]
    for k in range(len(spans)):
        region = k + 1
        if any(region_at(m, a["p"][0], a["p"][1]) == region for a in out): continue
        best = None
        for i in range(1, 100):
            x = mg["xmin"] + (mg["xmax"] - mg["xmin"]) * i / 100.0
            top = interface_y(spans[k], x); bot = interface_y(spans[k + 1], x) if k + 1 < len(spans) else mg["bottom"]
            if top - bot > 0.2 and (best is None or top - bot > best[2]): best = (x, (top + bot) / 2.0, top - bot)
        if best is None: continue
        soil = m["soils"][0]["name"] if region == 1 and m["soils"][0]["name"] not in usados else (libres.pop(0) if libres else m["soils"][0]["name"])
        if soil in libres: libres.remove(soil)
        usados.add(soil); out.append({"soil": soil, "p": (round(best[0], 2), round(best[1], 2))})
    return out
