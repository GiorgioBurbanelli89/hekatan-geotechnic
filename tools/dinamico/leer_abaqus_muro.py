# -*- coding: utf-8 -*-
# Lee el .odb y el .dat del muro LINEAL de Abaqus y deja tests/datos/muro_din_abaqus.json.
#   abaqus python tools/dinamico/leer_abaqus_muro.py <carpeta_del_job> <salida.json>
# (Python 2.7 de Abaqus 2017: odbAccess.) Nudos que se miran: NSET MIRA (orden de WATCH en muro_din_malla.json).
import sys, os, re, json
from odbAccess import openOdb

carpeta, salida = sys.argv[1], sys.argv[2]
odb = openOdb(os.path.join(carpeta, 'muro_lineal.odb'), readOnly=True)
res = {'fuente': 'Abaqus/Standard 2017, CPE6, job muro_lineal (Lanczos + *DYNAMIC ALPHA=0 DIRECT dt=0.01, Rayleigh)'}
ha = odb.steps['MODOS'].historyRegions['Assembly Assembly-1'].historyOutputs
res['f'] = [p[1] for p in ha['EIGFREQ'].data]
res['masa_efectiva_x_odb'] = [p[1] for p in ha['EM1'].data]
st = odb.steps['SISMO']
res['nudos'] = {}
for reg in st.historyRegions.keys():
    if not reg.startswith('Node'): continue
    ho = st.historyRegions[reg].historyOutputs
    n = int(reg.split('.')[-1])
    res['nudos'][str(n)] = {'t': [p[0] for p in ho['U1'].data], 'ux': [p[1] for p in ho['U1'].data], 'ax': [p[1] for p in ho['A1'].data]}
odb.close()
dat = open(os.path.join(carpeta, 'muro_lineal.dat')).read()
m = re.search(r'TOTAL MASS OF MODEL\s+([-\d.E+]+)', dat)
res['masa_total'] = float(m.group(1))
json.dump(res, open(salida, 'w'))
print('f', res['f'][:3], 'masa', res['masa_total'], 'nudos', sorted(res['nudos'].keys()))
