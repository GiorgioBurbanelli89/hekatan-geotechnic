# -*- coding: utf-8 -*-
"""Nivel 3 de VALIDACION: talud de Geotechnic (tipo simple / berma) -> InputFile de GEO5 -> SOLVER REAL de GEO5 (FRGeoFEM.exe,
sin interfaz, tools/geo5_solver.py) y la MISMA malla en Geotechnic (geofem_input_a_modelo.py + srm_modelo.ts). Ademas el FS de
Geotechnic con su malla propia (srm_hgeo.ts).

    python tests/validacion/geo5_vs_geotechnic.py [simple berma ...] [--nx 45 --nz 16] [--work CARPETA]

Malla comun: estructurada de T6 (columnas fondo->terreno), la de tools/hgeo_a_geofem_input.py. Un suelo, Drucker-Prager
«extension» de GEO5, SRM por c-phi, escalera 0.9 con 3 relajaciones (los parametros del generador).
Salida: tests/validacion/geo5_vs_geotechnic.json (+ Input/Output de GEO5 copiados en tests/validacion/geo5/<caso>/).
"""
import json, os, re, shutil, subprocess, sys, time

AQUI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(AQUI, "..", ".."))
BRIDGE = os.path.abspath(os.path.join(REPO, "..", "ingenieria-inversa", "hekatan-geo5-bridge", "tools"))
sys.path.insert(0, os.path.join(REPO, "tools")); sys.path.insert(0, BRIDGE)
import hgeo_a_geofem_input as gen          # noqa: E402
import geo5_solver                         # noqa: E402

SIN_PROPIA, SUFIJO = False, ""   # --sin-propia: no correr la malla propia; --sufijo: nombre del caso (estudio de malla)
TSX = ["node", os.path.join(REPO, "node_modules", "tsx", "dist", "cli.mjs")]   # sin npx.cmd: cmd.exe parte las rutas con espacios


def sh(args, **kw):
    r = subprocess.run(args, cwd=REPO, capture_output=True, text=True, encoding="utf-8", errors="replace", **kw)
    if r.returncode: raise RuntimeError("%s\n%s%s" % (" ".join(args), r.stdout[-2000:], r.stderr[-2000:]))
    return r.stdout


def fs_de(txt):
    m = re.findall(r"FS = ([-+0-9.eE]+)", txt)   # GEO5 escribe 6.561000e-01
    return float(m[-1]) if m else None


def rangos(ids):
    """[1,2,3,7,9,10] -> '1-3,7,9-10' (la sintaxis de listas de un InputFile real de GEO5)."""
    r, i = [], 0
    while i < len(ids):
        j = i
        while j + 1 < len(ids) and ids[j + 1] == ids[j] + 1: j += 1
        r.append(str(ids[i]) if i == j else "%d-%d" % (ids[i], ids[j])); i = j + 1
    return ",".join(r)


def varios_suelos(txt, hg, soils, d):
    """VARIOS suelos: cada T6 de la malla estructurada recibe el suelo que Geotechnic asigna en su centroide (regiones del
    .hgeo, material_en_puntos.ts); material_types / materials / gravity por suelo, con la sintaxis de un InputFile real de
    GEO5 de dos suelos (geofem_capture/files/013559_InputFile.txt: `"SOIL_2" elements=[77-287]`, `gravity rho=… elements=[…]`)."""
    XY, cen, ids = {}, [], []
    for ln in txt.split("\r\n"):
        m = re.match(r"\s+(\d+) x=([-0-9.E+]+) y=([-0-9.E+]+)$", ln)
        if m: XY[int(m.group(1))] = (float(m.group(2)), float(m.group(3)))
        m = re.match(r"\s+(\d+) nodes=\[(\d+),(\d+),(\d+),", ln)
        if m:
            p = [XY[int(m.group(k))] for k in (2, 3, 4)]
            cen.append([sum(q[0] for q in p) / 3, sum(q[1] for q in p) / 3]); ids.append(int(m.group(1)))
    pj = os.path.join(d, "centroides.json"); json.dump(cen, open(pj, "w"))
    mats = json.loads(sh(TSX + ["tests/validacion/material_en_puntos.ts", hg, pj]).strip().splitlines()[-1])
    usados = sorted(set(mats))
    lt, lm, lg, args = [], [], [], []
    for k in usados:
        so = soils[k - 1]
        mod = "mohrcoulomb" if so.get("modelo") == "mc" else "druckerprager extension"
        lt.append('    type="SOIL_%d" %s E=%.6E nu=%.2f alpha_biot=1.00 Eur=%.6E phi_in=%.5f c_in=%.6E psi=%.2f'
                  % (k, mod, so["E"], so["nu"], so["E"], so["phi"], so["c"], float(so.get("psi", 0))))
        el = rangos([i for i, mk in zip(ids, mats) if mk == k])
        lm.append('    "SOIL_%d" elements=[%s]' % (k, el))
        lg.append("    gravity rho=-%.6E elements=[%s]" % (so["gamma"], el))
        args.append("SOIL_%d=%s:%s" % (k, so["name"], so["gamma"]))
    txt = re.sub(r'    type="SOIL_1" [^\r\n]*', lambda _m: "\r\n".join(lt), txt, count=1)
    txt = re.sub(r'    "SOIL_1" elements=\[[^\]]*\]', lambda _m: "\r\n".join(lm), txt, count=1)
    txt = re.sub(r"    gravity rho=[^\r\n]*", lambda _m: "\r\n".join(lg), txt, count=1)
    print("  suelos por T6:", {soils[k - 1]["name"]: mats.count(k) for k in usados}, flush=True)
    return txt, args


CRLF = chr(13) + chr(10)
KH_RHO = os.environ.get("KH_RHO", "-")   # signo de rho en pseudo_earthquake (como en gravity rho=-γ); se MIDE con el solver


def sismo_geo5(txt, sis):
    """Una línea pseudo_earthquake por cada línea gravity (mismo rho y mismos elementos). borde 0: todos los elementos."""
    assert not sis.get("borde"), "solo borde=0"
    out = []
    for ln in txt.split(CRLF):
        out.append(ln)
        m = re.match(r"    gravity rho=-([-0-9.E+]+) elements=\[([^\]]*)\]$", ln)
        if m:
            out.append("    pseudo_earthquake rho=%s%s kh=%.6E kv=%.6E elements=[%s]" % (KH_RHO, m.group(1), sis["kh"], sis.get("kv", 0), m.group(2)))
    return CRLF.join(out)


def sismo_modelo(mj, sis):
    """Misma carga en Geotechnic (seismicLoad de mesher.ts, borde 0): T6 de lados rectos -> kh·γ·A/3 en cada nudo de lado medio."""
    m = json.load(open(mj)); X, Y = m["X"], m["Y"]; F = [0.0] * (2 * len(X))
    for e, k in zip(m["ELE"], m["EMAT"]):
        a, b, c = e[:3]; A = abs((X[b] - X[a]) * (Y[c] - Y[a]) - (X[c] - X[a]) * (Y[b] - Y[a])) / 2; g = m["MAT"][k - 1][4]
        for n in e[3:]: F[2 * n] += sis["kh"] * g * A / 3; F[2 * n + 1] += -sis.get("kv", 0) * g * A / 3
    m["Fs"] = F; m["stages"] = [dict(name="peso propio + sismo", loads=["Fg", "Fs"])]
    json.dump(m, open(mj, "w"))


def un_caso(caso, nx, nz, work):
    if caso.endswith(".hgeo"):            # cualquier .hgeo de UN suelo (p. ej. un benchmark): ruta relativa a REPO
        hg, caso = caso, os.path.basename(caso)[:-5] + SUFIJO
    else:
        hg = os.path.join("tests", "validacion", "casos", "geo5_%s.hgeo" % caso)   # relativa a REPO (cwd de sh)
    d = os.path.join(work, caso); os.makedirs(d, exist_ok=True)
    t = json.loads(sh(TSX + ["tests/validacion/terreno_json.ts", hg]).strip().splitlines()[-1])
    mg, s = t["margins"], t["soils"][0]
    # el generador espera xmin/xmax/bottom planos (hgeo_parse los anida en "margins"): se le da el modelo ya armado
    gen.parse_hgeo = lambda _txt: {"xmin": mg["xmin"], "xmax": mg["xmax"], "bottom": mg["bottom"],
                                   "interfaces": [[tuple(p) for p in t["interfaces"][0]]], "soils": [s]}
    inp = os.path.join(d, "Input.txt")
    nn, ne = gen.escribe(hg, inp, nx, nz)
    # el generador (sep-2026) no lleva lo que el solver 2024 exige: sin `debug_section` FRGeoFEM.exe muere (0xC0000005, medido).
    # Se ajusta al InputFile real de una sola corrida c-phi de 2024 (geofem_capture/files24b/0_InputFile.txt).
    txt = open(inp, encoding="mbcs", newline="").read()   # newline="": conservar CRLF
    txt = txt.replace('title="TALUD HEKATAN - REDUCCION C-PHI"', 'title="PHASE 1, INPUT STABILITY, CALCULATION PLASTIC"')
    txt = txt.replace("\r\nend\r\n\r\nactive_fields", "\r\nend\r\n\r\ndebug_section\r\nend\r\n\r\nactive_fields", 1)
    txt = txt.replace('    type="MY" fixed ct_y=c\r\n', '    type="MY" fixed ct_y=c\r\n    type="RZ" fixed cr_z=c\r\n', 1)
    txt = txt.replace("time_step_relaxation_factor=2\r\n", "time_step_relaxation_factor=2.00\r\n")
    # CARAS: en el InputFile real cada T6 lleva `faces=[a,b,c]` (aristas [esq, esq, medio], compartidas, esquinas en orden
    # creciente) y `face_types` las declara FL3. El generador no las escribe -> el solver muere. Se añaden.
    caras, lin_e = {}, []
    for ln in txt.split("\r\n"):
        m = re.match(r"(\s+)(\d+) nodes=\[(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\]$", ln)
        if m:
            n1, n2, n3, m12, m23, m31 = map(int, m.groups()[2:])
            fs = []
            for a, b, mm in ((n1, n2, m12), (n2, n3, m23), (n3, n1, m31)):
                k = (min(a, b), max(a, b))
                if k not in caras: caras[k] = (len(caras) + 1, mm)
                fs.append(caras[k][0])
            ln = "%s faces=[%d,%d,%d]" % (ln, *fs)
        lin_e.append(ln)
    txt = "\r\n".join(lin_e)
    cuerpo = "".join("    %d nodes=[%d,%d,%d]\r\n" % (i, a, b, mm) for (a, b), (i, mm) in sorted(caras.items(), key=lambda kv: kv[1][0]))
    txt = txt.replace("  faces\r\n  end\r\n", "  faces\r\n" + cuerpo + "  end\r\n", 1)
    txt = txt.replace("  face_types\r\n  end\r\n", '  face_types\r\n    type="FL3" faces=[1-%d]\r\n  end\r\n' % len(caras), 1)
    if s.get("modelo") == "mc":           # Mohr-Coulomb: la línea de material de un InputFile real de 2024 (files_muro_agua)
        txt = txt.replace('" druckerprager extension E=', '" mohrcoulomb E=', 1)
    txt = re.sub(r"(phi_in=[\d.]+ c_in=[-0-9.E+]+ psi=)[\d.]+", lambda m: m.group(1) + "%.2f" % float(s.get("psi", 0)), txt)
    mat_args = ["SOIL_1=%s:%s" % (s["name"], s["gamma"])]
    if len(t["soils"]) > 1:
        txt, mat_args = varios_suelos(txt, hg, t["soils"], d)
    sis = next((st["sismo"] for st in reversed(t.get("stages") or []) if st.get("sismo")), None)
    if sis:   # sismo seudoestático: la línea que escribe la GUI de GEO5 (GeoFEM_5.dll 2024: «pseudo_earthquake rho=%s kh=%s kv=%s elements=[%s]»)
        txt = sismo_geo5(txt, sis)
    open(inp, "w", encoding="mbcs", newline="").write(txt)
    # 1) GEO5 real
    t0 = time.time()
    rc = geo5_solver.main([inp, os.path.join(d, "OutputFile.txt"), "--aqui", "--quiet", "--timeout", "1200"])
    t_g5 = time.time() - t0
    out_txt = open(os.path.join(d, "OutputFile.txt"), errors="ignore").read() if os.path.exists(os.path.join(d, "OutputFile.txt")) else ""
    fs_g5 = fs_de(out_txt)
    # 2) Geotechnic con la MISMA malla
    mj = os.path.join(d, "modelo.json")
    sh([sys.executable, "tools/geofem_input_a_modelo.py", inp, mj] + mat_args)
    if sis: sismo_modelo(mj, sis)
    o_mismo = sh(TSX + ["tools/srm_modelo.ts", mj, "wasm"], timeout=1800)
    # 3) Geotechnic con su malla propia (la que ve el usuario)
    o_propia = "" if SIN_PROPIA else sh(TSX + ["tools/srm_hgeo.ts", hg, "wasm"], timeout=1800)
    fila = dict(caso=caso, hgeo=hg.replace(os.sep, "/"), modelo=s.get("modelo", "dp"), malla_comun="%d nudos, %d T6 (nx %d, nz %d)" % (nn, ne, nx, nz), FS_GEO5=fs_g5, rc_geo5=rc,
                s_geo5=round(t_g5), FS_geotechnic_misma_malla=fs_de(o_mismo), FS_geotechnic_malla_propia=fs_de(o_propia),
                malla_propia=(re.search(r"malla (\d+ nudos, \d+ T6)", o_propia) or [None, None])[1])
    if fs_g5 and fila["FS_geotechnic_misma_malla"]:
        fila["dif_misma_malla"] = round(fila["FS_geotechnic_misma_malla"] - fs_g5, 4)
        if fila["FS_geotechnic_malla_propia"]:
            fila["dif_malla_propia_pct"] = round(100 * (fila["FS_geotechnic_malla_propia"] - fs_g5) / fs_g5, 2)
    # copia lo pequeño al repo (los .bin se quedan en la carpeta de trabajo)
    dst = os.path.join(AQUI, "geo5", caso); os.makedirs(dst, exist_ok=True)
    for f in ("Input.txt", "OutputFile.txt", "Log_File.txt"):
        if os.path.exists(os.path.join(d, f)): shutil.copy(os.path.join(d, f), dst)
    open(os.path.join(dst, "geotechnic_misma_malla.txt"), "w", encoding="utf-8").write(o_mismo)
    if o_propia: open(os.path.join(dst, "geotechnic_malla_propia.txt"), "w", encoding="utf-8").write(o_propia)
    print(json.dumps(fila, ensure_ascii=False), flush=True)
    return fila


if __name__ == "__main__":
    a = sys.argv[1:]
    def opt(k, v):
        if k in a: i = a.index(k); x = a[i + 1]; del a[i:i + 2]; return x
        return v
    nx, nz = int(opt("--nx", 45)), int(opt("--nz", 16))
    SIN_PROPIA = "--sin-propia" in a
    if SIN_PROPIA: a.remove("--sin-propia")
    SUFIJO = opt("--sufijo", "")
    work = opt("--work", os.path.join(AQUI, "_trabajo_geo5"))
    casos = a or ["simple", "berma"]
    filas = [un_caso(c, nx, nz, work) for c in casos]
    p = os.path.join(AQUI, "geo5_vs_geotechnic.json")
    prev = json.load(open(p)) if os.path.exists(p) else []
    hechos = {f["caso"] for f in filas}
    prev = [f for f in prev if f["caso"] not in hechos] + filas
    json.dump(prev, open(p, "w"), indent=1, ensure_ascii=False)
