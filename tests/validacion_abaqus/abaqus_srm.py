# -*- coding: utf-8 -*-
"""Abaqus/Standard 2017 como TERCER JUEZ de la SRM (GEO5 | Geotechnic | Abaqus), con la MISMA malla T6 del solver real de GEO5.

    python tests/validacion_abaqus/abaqus_srm.py simple [berma g1_slope64_ex1 a1_acads_1a] [--s0 1 --s1 3] [--fijo 1.5,2.0] [--releer]

Lee tests/validacion/geo5/<caso>/Input.txt (nudos, T6, apoyos MX/MY, peso, material) y escribe un .inp:
  - CPE6 (deformación plana, 6 nudos, 3 puntos de Gauss). El T6 de GEO5 ya va como el CPE6: esquinas antihorario + medios 12-23-31.
  - Drucker-Prager «extensión» de GEO5 (f = √J2 + α·I1 − k) → DP lineal de Abaqus con K = 1: tanβ = 3√3·α, d = √3·k
    (*DRUCKER PRAGER HARDENING, TYPE=SHEAR), ψ = 0 → ángulo de dilatación 0 (no asociado, UNSYMM).
  - Mohr-Coulomb de GEO5 → *MOHR COULOMB (φ, ψ) + *MOHR COULOMB HARDENING (c).
  - SRM con la VARIABLE DE CAMPO 1 = SRF: tanφ_f = tanφ/SRF, c_f = c/SRF tabulados cada 0.005 (interpolación lineal).
    Paso 1 GRAVEDAD (*STATIC, SRF = s0); paso 2 SRM (*STATIC, campo en rampa s0 → s1). FS = SRF del último incremento
    convergido (Abaqus corta el incremento hasta el mínimo, Δt 1e-4 = ΔSRF 2e-4, y para: con 1e-7 se arrastra cientos de incrementos sin avanzar, medido en simple). --fijo: además, un trabajo por SRF fijo (desplazamiento vs SRF).
Salida: tests/validacion_abaqus/resultados/<caso>.json + <caso>_mecanismo.png (la carpeta _trabajo/ con el .odb no va a git).
"""
import json, math, os, re, subprocess, sys, time

AQUI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(AQUI, "..", ".."))
G5 = os.path.join(REPO, "tests", "validacion", "geo5")
TRAB = os.path.join(AQUI, "_trabajo")
RES = os.path.join(AQUI, "resultados")
ABQ = r"C:\SIMULIA\Commands\abaqus.bat"
CRESTA = {"simple": (21.009122, -2.5), "berma": (30.858785, 0.0), "g1_slope64_ex1": (32.0, 10.0), "a1_acads_1a": (50.0, 35.0)}


def lee_input(caso):
    txt = open(os.path.join(G5, caso, "Input.txt"), encoding="mbcs", errors="replace").read()
    nod = {int(a): (float(x), float(y)) for a, x, y in re.findall(r"^\s+(\d+) x=(\S+) y=(\S+)", txt, re.M)}
    ele = {int(m[0]): list(map(int, m[1:])) for m in re.findall(r"^\s+(\d+) nodes=\[(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\]", txt, re.M)}
    def conj(nombre):
        s = re.search(r'"%s" nodes=\[([^\]]*)\]' % nombre, txt).group(1)
        out = []
        for p in s.split(","):
            if "-" in p: a, b = map(int, p.split("-")); out += range(a, b + 1)
            elif p: out.append(int(p))
        return out
    m = re.search(r'type="SOIL_1" (druckerprager extension|mohrcoulomb) E=(\S+) nu=(\S+) .*phi_in=(\S+) c_in=(\S+) psi=(\S+)', txt)
    gam = -float(re.search(r"gravity rho=(\S+)", txt).group(1))
    mat = dict(modelo="dp" if m.group(1).startswith("drucker") else "mc", E=float(m.group(2)), nu=float(m.group(3)),
               phi=float(m.group(4)), c=float(m.group(5)), psi=float(m.group(6)), gamma=gam)
    return nod, ele, conj("MX"), conj("MY"), mat


def area(nod, e):
    (x1, y1), (x2, y2), (x3, y3) = nod[e[0]], nod[e[1]], nod[e[2]]
    return 0.5 * ((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1))


def red(mat, srf):
    phi = math.atan(math.tan(math.radians(mat["phi"])) / srf); c = mat["c"] / srf
    return phi, c


def tabla_material(mat, smin, smax, ds=0.005):
    L = []
    n = int(round((smax - smin) / ds))
    srfs = [smin + i * ds for i in range(n + 1)]
    if mat["modelo"] == "dp":
        r3 = math.sqrt(3.0)
        L.append("*DRUCKER PRAGER, SHEAR CRITERION=LINEAR, DEPENDENCIES=1")
        for s in srfs:
            phi, c = red(mat, s); sp = math.sin(phi)
            al = 2 * sp / (r3 * (3 + sp))
            L.append("%.10f, 1.0, %.4f, , %.5f" % (math.degrees(math.atan(3 * r3 * al)), mat["psi"], s))   # ψ_DP = 0 si ψ = 0
        L.append("*DRUCKER PRAGER HARDENING, TYPE=SHEAR, DEPENDENCIES=1")
        for s in srfs:
            phi, c = red(mat, s); sp = math.sin(phi)
            k = 6 * c * math.cos(phi) / (r3 * (3 + sp))
            L.append("%.10f, 0., , %.5f" % (r3 * k, s))           # d, εp, T, campo 1 (sin columna de tasa: medido en el eco del .dat)
    else:
        L.append("*MOHR COULOMB, DEPENDENCIES=1")
        for s in srfs:
            phi, c = red(mat, s)
            L.append("%.10f, %.4f, , %.5f" % (math.degrees(phi), mat["psi"], s))
        L.append("*MOHR COULOMB HARDENING, DEPENDENCIES=1")
        for s in srfs:
            phi, c = red(mat, s)
            L.append("%.10f, 0., , %.5f" % (c, s))                # c, εp, T, campo 1
    return L


def escribe_inp(caso, ruta, s0, s1, fijo=None, dtmin=1e-4):
    nod, ele, mx, my, mat = lee_input(caso)
    neg = [k for k, e in ele.items() if area(nod, e) <= 0]
    if neg: raise SystemExit("%d T6 con área <= 0 (orden de nudos distinto del CPE6)" % len(neg))
    xc, yc = CRESTA[caso]
    cr = min(nod, key=lambda k: (nod[k][0] - xc) ** 2 + (nod[k][1] - yc) ** 2)
    L = ["*HEADING", "SRM %s: malla del InputFile de GEO5 (%d nudos, %d T6), %s" % (caso, len(nod), len(ele), mat),
         "*PREPRINT, ECHO=NO, MODEL=NO, HISTORY=NO, CONTACT=NO", "*NODE"]
    L += ["%d, %.9f, %.9f" % (k, x, y) for k, (x, y) in sorted(nod.items())]
    L.append("*ELEMENT, TYPE=CPE6, ELSET=SUELO")
    L += ["%d, %s" % (k, ", ".join(map(str, e))) for k, e in sorted(ele.items())]
    def nset(nombre, lst):
        out = ["*NSET, NSET=%s" % nombre]
        for i in range(0, len(lst), 12): out.append(", ".join(map(str, lst[i:i + 12])))
        return out
    L += nset("MX", sorted(set(mx))) + nset("MY", sorted(set(my))) + nset("CRESTA", [cr])
    L += ["*NSET, NSET=NALL, GENERATE", "1, %d, 1" % max(nod), "*SOLID SECTION, ELSET=SUELO, MATERIAL=SUELO", "1.0,",
          "*MATERIAL, NAME=SUELO", "*DENSITY", "%g," % mat["gamma"], "*ELASTIC", "%g, %g" % (mat["E"], mat["nu"])]
    smin = min(s0, 0.5); smax = max(s1, fijo or 0) + 0.05
    L += tabla_material(mat, smin, smax)
    L += ["*INITIAL CONDITIONS, TYPE=FIELD, VARIABLE=1", "NALL, %g" % s0,
          "*AMPLITUDE, NAME=RAMPA", "0., %g, 1., %g" % (s0, s1 if fijo is None else fijo),
          "*STEP, NAME=GRAVEDAD, NLGEOM=NO, INC=1000, UNSYMM=YES", "*STATIC", "0.1, 1., 1e-06, 0.25",
          "*BOUNDARY", "MX, 1, 1", "MY, 2, 2", "*DLOAD", "SUELO, GRAV, 1., 0., -1.",
          "*OUTPUT, FIELD, FREQUENCY=1000", "*NODE OUTPUT", "U,", "*ELEMENT OUTPUT", "S, PEEQ",
          "*OUTPUT, HISTORY, FREQUENCY=1", "*NODE OUTPUT, NSET=CRESTA", "U1, U2", "*END STEP"]
    L += ["*STEP, NAME=SRM, NLGEOM=NO, INC=100000, UNSYMM=YES", "*STATIC",
          ("0.0025, 1., %g, 0.0025" % dtmin if fijo is None else "0.05, 1., %g, 0.1" % dtmin),
          "*CONTROLS, PARAMETERS=TIME INCREMENTATION", "4, 8, 9, 16, 10, 4, 12, 10",
          "*FIELD, VARIABLE=1, AMPLITUDE=RAMPA", "NALL, 1.0",
          "*OUTPUT, FIELD, FREQUENCY=1", "*NODE OUTPUT", "U,", "*ELEMENT OUTPUT", "PEEQ,",
          "*OUTPUT, HISTORY, FREQUENCY=1", "*NODE OUTPUT, NSET=CRESTA", "U1, U2", "*END STEP"]
    open(ruta, "w").write("\n".join(L) + "\n")
    return dict(nudos=len(nod), t6=len(ele), cresta=cr, cresta_xy=nod[cr], material=mat)


def correr(job, d):
    t0 = time.time()
    r = subprocess.run('"%s" job=%s cpus=1 interactive ask_delete=OFF' % (ABQ, job), cwd=d, shell=True,
                       capture_output=True, text=True, errors="replace")
    return time.time() - t0, r.stdout[-1500:] + r.stderr[-800:]


def lee_sta(d, job, s0, s1):
    """Último incremento CONVERGIDO del paso 2: columnas STEP INC ATT SEVERE EQUIL TOTAL TOTALTIME STEPTIME INCTIME."""
    p = os.path.join(d, job + ".sta")
    if not os.path.exists(p): return None, None, ""
    txt = open(p, errors="replace").read()
    ult = {1: None, 2: None}
    for ln in txt.splitlines():
        m = re.match(r"\s+([12])\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)", ln)
        if m: ult[int(m.group(1))] = float(m.group(8))
    fin = "COMPLETED SUCCESSFULLY" if "COMPLETED SUCCESSFULLY" in txt else ("NOT BEEN COMPLETED" if "NOT BEEN COMPLETED" in txt else txt.strip().splitlines()[-1])
    return ult[1], ult[2], fin


def main():
    a = sys.argv[1:]
    def opt(k, v):
        if k in a: i = a.index(k); x = a[i + 1]; del a[i:i + 2]; return x
        return v
    s0, s1 = float(opt("--s0", 1.0)), float(opt("--s1", 3.0))
    fijos = [float(x) for x in opt("--fijo", "").split(",") if x]
    dtmin = float(opt("--dtmin", 1e-4))       # incremento mínimo del paso SRM (tiempo 0..1): 1e-4 = ΔSRF 2e-4 con la rampa 1 → 3
    sufijo = opt("--sufijo", "")              # otro nombre de trabajo/resultado (p. ej. __dt1e-6; el doble guion bajo lo usa graficas_srm.py) para no pisar la corrida base
    releer = "--releer" in a                 # no vuelve a correr Abaqus si ya está el .odb: solo relee
    if releer: a.remove("--releer")
    os.makedirs(RES, exist_ok=True)
    for caso in a or ["simple", "berma"]:
        d = os.path.join(TRAB, caso); os.makedirs(d, exist_ok=True)
        job = "srm_" + caso + sufijo
        info = escribe_inp(caso, os.path.join(d, job + ".inp"), s0, s1, dtmin=dtmin)
        if releer and os.path.exists(os.path.join(d, job + ".odb")): seg = json.load(open(os.path.join(RES, caso + ".json"))).get("segundos", 0)
        else: seg, log = correr(job, d)
        t1, t2, fin = lee_sta(d, job, s0, s1)
        fs = None if t2 is None else s0 + (s1 - s0) * t2
        fila = dict(caso=caso, malla="%d nudos, %d CPE6" % (info["nudos"], info["t6"]), material=info["material"],
                    cresta=info["cresta"], cresta_xy=info["cresta_xy"], s0=s0, s1=s1, gravedad_t=t1, srm_t=t2,
                    FS_abaqus=None if fs is None else round(fs, 4), fin=fin, segundos=round(seg))
        if t1 is None or t1 < 1.0: fila["nota"] = "el paso GRAVEDAD con SRF %g no termina" % s0
        # mecanismo y curva de la cresta desde el .odb (abaqus python)
        r = subprocess.run('"%s" python "%s" %s.odb %s.json' % (ABQ, os.path.join(AQUI, "leer_odb_srm.py"), job, job), cwd=d,
                           shell=True, capture_output=True, text=True, errors="replace")
        if r.returncode: fila["odb_error"] = (r.stdout + r.stderr)[-600:]
        pj = os.path.join(d, job + ".json")
        if os.path.exists(pj):                  # el .sta da el tiempo con 3 cifras: el tiempo exacto sale de la historia del .odb
            h = json.load(open(pj))["pasos"].get("SRM", {}).get("hist", {}).get("U1")
            if h:
                fila["srm_t"] = h[-1][0]; fila["FS_abaqus"] = round(s0 + (s1 - s0) * h[-1][0], 4)
                fila["cresta_u_mm"] = round(1000 * h[-1][1], 2)
        g = {f["caso"]: f for f in json.load(open(os.path.join(REPO, "tests", "validacion", "geo5_vs_geotechnic.json")))}
        if caso in g: fila["FS_GEO5"] = g[caso]["FS_GEO5"]; fila["FS_geotechnic"] = g[caso]["FS_geotechnic_misma_malla"]
        fila["fijos"] = []
        for sf in fijos:
            jf = "fijo_%s_%s" % (caso, ("%.3f" % sf).replace(".", "p"))
            escribe_inp(caso, os.path.join(d, jf + ".inp"), s0, s1, fijo=sf, dtmin=dtmin)
            sg, _ = correr(jf, d)
            _, tf, ff = lee_sta(d, jf, s0, sf)
            ucr = None
            subprocess.run('"%s" python "%s" %s.odb %s.json' % (ABQ, os.path.join(AQUI, "leer_odb_srm.py"), jf, jf), cwd=d,
                           shell=True, capture_output=True, text=True, errors="replace")
            pj = os.path.join(d, jf + ".json")
            if os.path.exists(pj):
                o = json.load(open(pj)); ucr = o.get("cresta_srm_ultimo")
            fila["fijos"].append(dict(SRF=sf, converge=(tf == 1.0), t=tf, cresta_u=ucr, fin=ff, segundos=round(sg)))
        fila["dtmin"] = dtmin; fila["caso"] = caso + sufijo
        json.dump(fila, open(os.path.join(RES, caso + sufijo + ".json"), "w"), indent=1, ensure_ascii=False)
        print(json.dumps({k: v for k, v in fila.items() if k != "material"}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
