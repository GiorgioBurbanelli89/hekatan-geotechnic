# -*- coding: utf-8 -*-
# Lee el .odb, el .dat y el .mtx de la columna de Abaqus y deja tests/datos/columna_abaqus.json.
#   abaqus python tools/dinamico/leer_abaqus_columna.py <carpeta_del_job> <salida.json>
# (Python 2.7 de Abaqus 2017: odbAccess.)
import sys, os, re, json
from odbAccess import openOdb

carpeta, salida = sys.argv[1], sys.argv[2]
if len(sys.argv) > 3:
    # modo «casos»: solo la historia u_x de la coronación de cada job (Rayleigh, HHT…)
    #   abaqus python leer_abaqus_columna.py <carpeta> <salida.json> job1 job2 …
    out = {}
    for job in sys.argv[3:]:
        o = openOdb(os.path.join(carpeta, job + '.odb'), readOnly=True)
        st = o.steps['SISMO']
        reg = [k for k in st.historyRegions.keys() if k.startswith('Node')][0]
        hu = st.historyRegions[reg].historyOutputs['U1'].data
        inp = open(os.path.join(carpeta, job + '.inp')).read()
        out[job] = {'nudo_abaqus': reg, 't': [p[0] for p in hu], 'ux_corona': [p[1] for p in hu],
                    'damping': re.findall(r'\*DAMPING[^\r\n]*', inp), 'dynamic': re.findall(r'\*DYNAMIC[^\r\n]*', inp)}
        o.close()
        print(job, len(hu), max([p[1] for p in hu], key=abs))
    json.dump(out, open(salida, 'w'))
    sys.exit(0)
odb = openOdb(os.path.join(carpeta, 'columna.odb'), readOnly=True)
res = {'fuente': 'Abaqus/Standard 2017, CPE6, job columna (Lanczos + *DYNAMIC ALPHA=0 DIRECT dt=0.005)'}
# frecuencias: historia EIGFREQ (el frame.frequency viene redondeado a 5 cifras, como el .dat)
ha = odb.steps['MODOS'].historyRegions['Assembly Assembly-1'].historyOutputs
res['f'] = [p[1] for p in ha['EIGFREQ'].data]
res['masa_efectiva_x_odb'] = [p[1] for p in ha['EM1'].data]
# historia de la coronación
st = odb.steps['SISMO']
reg = [k for k in st.historyRegions.keys() if k.startswith('Node')][0]
hu = st.historyRegions[reg].historyOutputs['U1'].data
res['nudo_abaqus'] = reg
res['t'] = [p[0] for p in hu]
res['ux_corona'] = [p[1] for p in hu]
odb.close()
# masa total y masas efectivas del .dat
dat = open(os.path.join(carpeta, 'columna.dat')).read()
m = re.search(r'TOTAL MASS OF MODEL\s+([-\d.E+]+)', dat)
res['masa_total'] = float(m.group(1))
blk = dat.split('E F F E C T I V E   M A S S')[1].split('TOTAL')[0]
res['masa_efectiva_x'] = [float(l.split()[1]) for l in blk.splitlines() if re.match(r'\s+\d+\s', l)]
blk = dat.split('E I G E N V A L U E    O U T P U T')[1].split('P A R T I C I P')[0]
res['f_dat'] = [float(l.split()[3]) for l in blk.splitlines() if re.match(r'\s+\d+\s+[\d.]', l)]
# matrices de los elementos 1 y 2 (.mtx: triángulo inferior por filas)
txt = open(os.path.join(carpeta, 'columna_elem.mtx')).read()
for bloque in txt.split('** ELEMENT NUMBER')[1:]:
    ne = int(bloque.split()[0])
    if ne > 2: break
    for tipo, nom in (('STIFFNESS', 'Ke'), ('MASS', 'Me')):
        parte = bloque.split('*MATRIX,TYPE=' + tipo)[1].split('*')[0]
        v = [float(x) for x in parte.replace(',', ' ').split()]
        A = [[0.0] * 12 for _ in range(12)]
        k = 0
        for i in range(12):
            for j in range(i + 1):
                A[i][j] = A[j][i] = v[k]; k += 1
        res['%s%d' % (nom, ne)] = A
json.dump(res, open(salida, 'w'))
print('frecuencias', res['f'][:3], 'masa', res['masa_total'], 'n', len(res['t']), 'ux max', max(res['ux_corona'], key=abs))
