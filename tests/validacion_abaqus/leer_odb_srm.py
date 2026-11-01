# -*- coding: utf-8 -*-
"""abaqus python leer_odb_srm.py trabajo.odb salida.json  (Python 2.7 de Abaqus 2017)

Saca: coordenadas y conectividad, U al final de GRAVEDAD, U y PEEQ (media por elemento) en el último frame del paso SRM,
y la historia de la cresta (tiempo del paso, U1, U2) de los dos pasos.
"""
import json, sys
from odbAccess import openOdb

odb = openOdb(sys.argv[1], readOnly=True)
inst = odb.rootAssembly.instances.values()[0]
res = dict(xy={}, con={}, pasos={})
for n in inst.nodes: res["xy"][n.label] = [float(n.coordinates[0]), float(n.coordinates[1])]
for e in inst.elements: res["con"][e.label] = list(e.connectivity)
for nombre, paso in odb.steps.items():
    p = dict(frames=len(paso.frames), hist={})
    if len(paso.frames):
        fr = paso.frames[-1]
        p["t_ultimo_frame"] = float(fr.frameValue)
        p["U"] = dict((v.nodeLabel, [float(v.data[0]), float(v.data[1])]) for v in fr.fieldOutputs["U"].values)
        if "PEEQ" in fr.fieldOutputs.keys():
            acc = {}
            for v in fr.fieldOutputs["PEEQ"].values: acc.setdefault(v.elementLabel, []).append(float(v.data))
            p["PEEQ"] = dict((k, sum(x) / len(x)) for k, x in acc.items())
    for rn, reg in paso.historyRegions.items():
        for k, h in reg.historyOutputs.items():
            p["hist"][k] = [[float(a), float(b)] for a, b in h.data]
    res["pasos"][nombre] = p
if "SRM" in res["pasos"] and res["pasos"]["SRM"]["hist"].get("U1"):
    res["cresta_srm_ultimo"] = [res["pasos"]["SRM"]["hist"]["U1"][-1][1], res["pasos"]["SRM"]["hist"]["U2"][-1][1]]
json.dump(res, open(sys.argv[2], "w"))
print("escrito " + sys.argv[2])
