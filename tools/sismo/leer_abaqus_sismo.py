# -*- coding: utf-8 -*-
# Lee U y RF de todos los nudos del job muro_sismo (Abaqus/Standard 2017) → tests/datos/muro_sismo_abaqus.json.
#   abaqus python tools/sismo/leer_abaqus_sismo.py <carpeta_del_job> <salida.json>
import sys, os, json
from odbAccess import openOdb

carpeta, salida = sys.argv[1], sys.argv[2]
odb = openOdb(os.path.join(carpeta, 'muro_sismo.odb'), readOnly=True)
fr = odb.steps['SISMO'].frames[-1]
u, rf = {}, {}
for v in fr.fieldOutputs['U'].values: u[v.nodeLabel] = [float(v.data[0]), float(v.data[1])]   # float32 del .odb (ruido ~1e-7 relativo)
for v in fr.fieldOutputs['RF'].values: rf[v.nodeLabel] = [float(v.data[0]), float(v.data[1])]
n = max(u.keys())
res = {'fuente': 'Abaqus/Standard 2017, CPE6, *STATIC, *DLOAD BX = kh*gamma (job muro_sismo)',
       'ux': [u[i][0] for i in range(1, n + 1)], 'uy': [u[i][1] for i in range(1, n + 1)],
       'rfx_total': sum(r[0] for r in rf.values()), 'rfy_total': sum(r[1] for r in rf.values())}
odb.close()
json.dump(res, open(salida, 'w'))
print('nudos', n, 'max |ux|', max(abs(x) for x in res['ux']), 'sum RFx', res['rfx_total'])
