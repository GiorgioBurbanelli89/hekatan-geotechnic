# -*- coding: utf-8 -*-
# Empuje sobre el trasdós del fuste desde Abaqus: -sum(NFORC1) de los elementos de ELSET CARA en los nudos de NSET TRASDOS,
# en el estático de peso (job muro_peso) y en cada incremento del dinámico (job muro_empuje).
#   abaqus python tools/dinamico/leer_abaqus_empuje.py <carpeta> <salida.json>
import sys, os, json
from odbAccess import openOdb

carpeta, salida = sys.argv[1], sys.argv[2]


def empuje(fr, tras):
    h = 0.0
    for v in fr.fieldOutputs['NFORC1'].values:
        if v.nodeLabel in tras: h -= float(v.data)
    return h


res = {'fuente': 'Abaqus/Standard 2017: -sum NFORC1 de ELSET CARA en NSET TRASDOS (jobs muro_peso y muro_empuje)'}
o = openOdb(os.path.join(carpeta, 'muro_peso.odb'), readOnly=True)
tras = set(n.label for n in o.rootAssembly.instances['PART-1-1'].nodeSets['TRASDOS'].nodes)
res['peso'] = empuje(o.steps['PESO'].frames[-1], tras)
o.close()
o = openOdb(os.path.join(carpeta, 'muro_empuje.odb'), readOnly=True)
fr = o.steps['SISMO'].frames
res['t'] = [f.frameValue for f in fr]
res['dinamico'] = [empuje(f, tras) for f in fr]
o.close()
json.dump(res, open(salida, 'w'))
print('peso', res['peso'], 'frames', len(res['t']), 'max |din|', max(abs(x) for x in res['dinamico']))
