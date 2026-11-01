# -*- coding: utf-8 -*-
"""Caso 2 · UN punto de Gauss con Drucker-Prager «extension» de GeoFEM, en OpenSees (openseespy 3.7.1).
Un elemento tri31 (deformación constante) con los 3 nudos PRESCRITOS (manejador Penalty 1e12): la deformación es la que se pide, en plano (ezz = 0).
  python os_punto_dp.py trayectoria.json salida.json
trayectoria.json = {"E","nu","phi","c","paso":[[dexx,deyy,dgxy],...]}  (incrementos TOTALES de deformación por paso; gxy ingenieril)
Parámetros de OpenSees (UWmaterials/DruckerPrager.cpp:408, f = ||dev|| + rho*I1 - sqrt(2/3)*sigmaY, tracción positiva):
  GeoFEM: f = J + alpha*I1 - k,  alpha = 2 sin(phi)/(sqrt(3)(3+sin(phi))),  k = 2 sqrt(3) c cos(phi)/(3+sin(phi)), psi = 0
  ||dev|| = sqrt(2) J  =>  rho = sqrt(2) alpha,  sigmaY = sqrt(3) k = 6 c cos(phi)/(3+sin(phi)),  rho_bar = 0 (psi = 0)
Salida: por paso [sxx, syy, szz, txy] (tracción positiva).
"""
import sys, json, math
import openseespy.opensees as ops
d = json.load(open(sys.argv[1]))
E, nu, phi, c = d["E"], d["nu"], math.radians(d["phi"]), d["c"]
K, G = E / (3 * (1 - 2 * nu)), E / (2 * (1 + nu))
s = math.sin(phi); al = 2 * s / (math.sqrt(3) * (3 + s)); k = 2 * math.sqrt(3) * c * math.cos(phi) / (3 + s)
rho, sy = math.sqrt(2) * al, math.sqrt(3) * k
ops.wipe(); ops.model('basic', '-ndm', 2, '-ndf', 2)
# DruckerPrager tag K G sigma_y rho rho_bar Kinf Ko delta1 delta2 H theta  (sin endurecimiento: perfectamente plástico)
ops.nDMaterial('DruckerPrager', 1, K, G, sy, rho, 0.0, sy, sy, 0.0, 0.0, 0.0, 0.0)
ops.node(1, 0, 0); ops.node(2, 1, 0); ops.node(3, 0, 1)
ops.element('tri31', 1, 1, 2, 3, 1.0, 'PlaneStrain', 1)
cum = [[0.0], [0.0], [0.0]]
for inc in d["paso"]:
    for i in range(3): cum[i].append(cum[i][-1] + inc[i])
tag = 1
for i in range(3):
    ops.timeSeries('Path', i + 1, '-dt', 1.0, '-values', *cum[i], '-factor', 1.0)
    ops.pattern('Plain', i + 1, i + 1)
    if i == 0: ops.sp(2, 1, 1.0)                     # exx : ux = exx * x
    if i == 1: ops.sp(3, 2, 1.0)                     # eyy : uy = eyy * y
    if i == 2: ops.sp(2, 2, 0.5); ops.sp(3, 1, 0.5)  # gxy : ux = g/2 y, uy = g/2 x (sin giro)
ops.sp(1, 1, 0.0); ops.sp(1, 2, 0.0)
ops.constraints('Penalty', 1e12, 1e12); ops.numberer('Plain'); ops.system('BandGeneral'); ops.test('NormDispIncr', 1e-13, 30); ops.algorithm('Newton')
ops.integrator('LoadControl', 1.0); ops.analysis('Static')
out = []
for n in range(len(d["paso"])):
    r = ops.analyze(1)
    st = ops.eleResponse(1, 'material', 1, 'stress')
    if len(st) == 3: st = [st[0], st[1], float('nan'), st[2]]
    elif len(st) == 4: st = [st[0], st[1], st[2], st[3]]
    out.append({"paso": n + 1, "ok": r == 0, "sig": st})
json.dump(out, open(sys.argv[2], "w"))
print("OpenSees: %d pasos, %d con fallo" % (len(out), sum(0 if o["ok"] else 1 for o in out)), "| material stress len:", len(ops.eleResponse(1, 'material', 1, 'stress')))
