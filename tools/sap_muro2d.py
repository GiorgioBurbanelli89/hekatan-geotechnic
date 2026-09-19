# -*- coding: utf-8 -*-
"""El MURO 2D de Hekatan Geotechnic (una sola área, deformación plana) armado en SAP2000 por OAPI,
con la MISMA malla nudo a nudo, las mismas cargas nodales, los mismos muelles y las mismas
restricciones. Se resuelve dos veces: elemento «Plane» con y sin modos incompatibles
(PropArea.SetPlane(..., Incompatible)), las dos variantes que tiene también el Q4 de Hekatan.

    python tools/sap_muro2d.py tests/out/muro2d_modelo.json tests/out/muro2d_sap.json

Plano XZ (y = 0). Todos los nudos: UY, RX, RY, RZ restringidos (el Plane no tiene giros).
Peso propio del material = 0: el peso va como cargas nodales (las mismas que carga Hekatan)."""
import json, os, sys
import comtypes.client
import comtypes.gen.SAP2000v1 as S
sys.stdout.reconfigure(encoding="utf-8")
entrada, salida = sys.argv[1], sys.argv[2]
M = json.load(open(entrada, encoding="utf-8"))

h = comtypes.client.CreateObject("SAP2000v1.Helper").QueryInterface(S.cHelper)
o = h.CreateObjectProgID("CSI.SAP2000.API.SapObject")
o.ApplicationStart()
sm = o.SapModel
sm.InitializeNewModel(6)                       # kN, m, C
sm.File.NewBlank()
sm.PropMaterial.SetMaterial("HORM", 2)
sm.PropMaterial.SetMPIsotropic("HORM", M["E"], M["nu"], 1e-5)
sm.PropMaterial.SetWeightAndMass("HORM", 1, 0.0)
sm.LoadPatterns.SetSelfWTMultiplier("DEAD", 0.0)

nombres = []
for i, (x, z) in enumerate(M["nodes"]):
    r = sm.PointObj.AddCartesian(float(x), 0.0, float(z), "", str(i + 1))
    nombres.append(r[0] if isinstance(r, (list, tuple)) else str(i + 1))
fijoX = set(M["fixX"])
for i, nm in enumerate(nombres):
    sm.PointObj.SetRestraint(nm, [i in fijoX, True, False, True, True, True])
for n, k in M["springs"]:
    sm.PointObj.SetSpring(nombres[n], [0.0, 0.0, float(k), 0.0, 0.0, 0.0], 0, False, True)
for n, fx, fz in M["loads"]:
    sm.PointObj.SetLoadForce(nombres[n], "DEAD", [float(fx), 0.0, float(fz), 0.0, 0.0, 0.0], True)

out = {"nudos": len(nombres), "areas": len(M["quads"])}
base = os.path.splitext(os.path.abspath(salida))[0]
for inc in (True, False):
    sm.SetModelIsLocked(False)
    sm.PropArea.SetPlane("PL", 2, "HORM", 0.0, float(M["espesor"]), inc)
    if not out.get("areas_hechas"):
        for q in M["quads"]:
            sm.AreaObj.AddByPoint(4, [nombres[a] for a in q], "", "PL", "")
        out["areas_hechas"] = True
    sm.Analyze.SetActiveDOF([True, False, True, False, True, False])
    sm.File.Save(base + ("_inc" if inc else "_noinc") + ".sdb")
    print("run", "incompatibles" if inc else "sin incompatibles", "->", sm.Analyze.RunAnalysis(), flush=True)
    sm.Results.Setup.DeselectAllCasesAndCombosForOutput()
    sm.Results.Setup.SetCaseSelectedForOutput("DEAD")
    u = []
    for nm in nombres:
        r = sm.Results.JointDispl(nm, 0, 0, [], [], [], [], [], [], [], [], [], [], [])
        u.append([float(r[6][0]), float(r[8][0])] if r[0] else [None, None])
    out["u_inc" if inc else "u_noinc"] = u
json.dump(out, open(salida, "w"), indent=0)
print("SAP2000 muro 2D:", out["nudos"], "nudos,", out["areas"], "áreas ->", salida, flush=True)
o.ApplicationExit(False)
