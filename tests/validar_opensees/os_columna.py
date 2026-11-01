# -*- coding: utf-8 -*-
"""Caso 1 · la MISMA columna elástica (2 x 10 m, E 20000, nu 0.3, gamma 18; lados sin ux, base fija) en OpenSees con cuatro elementos.
Gravedad como cargas nodales tributarias (igual para todos los elementos). Exacto: u_y(cima) = -gamma H^2 / (2 M), sy(y) = -gamma (H - y)."""
import json, sys
import openseespy.opensees as ops
W, H, E, nu, gam = 2.0, 10.0, 20000.0, 0.3, 18.0
nx, ny = 2, 10
M = E * (1 - nu) / ((1 + nu) * (1 - 2 * nu)); uex = -gam * H * H / (2 * M)
res = {"uy_cima_exacto": uex}
for tipo in ("quad", "bbarQuad", "tri31", "SSPquad"):
    ops.wipe(); ops.model('basic', '-ndm', 2, '-ndf', 2)
    ops.nDMaterial('ElasticIsotropic', 1, E, nu)
    nid = lambda i, j: j * (nx + 1) + i + 1
    for j in range(ny + 1):
        for i in range(nx + 1): ops.node(nid(i, j), i * W / nx, j * H / ny)
    for j in range(ny + 1):
        for i in range(nx + 1):
            fx = 1 if (i == 0 or i == nx or j == 0) else 0
            fy = 1 if j == 0 else 0
            if fx or fy: ops.fix(nid(i, j), fx, fy)
    dx, dy = W / nx, H / ny; F = {}
    def carga(n, f): F[n] = F.get(n, 0.0) + f
    e = 0
    for j in range(ny):
        for i in range(nx):
            a, b, c, d = nid(i, j), nid(i + 1, j), nid(i + 1, j + 1), nid(i, j + 1)
            if tipo == "quad": e += 1; ops.element('quad', e, a, b, c, d, 1.0, 'PlaneStrain', 1)
            elif tipo == "bbarQuad": e += 1; ops.element('bbarQuad', e, a, b, c, d, 1.0, 1)
            elif tipo == "SSPquad": e += 1; ops.element('SSPquad', e, a, b, c, d, 1, 'PlaneStrain', 1.0)
            else:
                e += 1; ops.element('tri31', e, a, b, c, 1.0, 'PlaneStrain', 1)
                e += 1; ops.element('tri31', e, a, c, d, 1.0, 'PlaneStrain', 1)
            for n in (a, b, c, d): carga(n, -gam * dx * dy / 4)
    ops.timeSeries('Linear', 1); ops.pattern('Plain', 1, 1)
    for n, f in F.items(): ops.load(n, 0.0, f)
    ops.constraints('Plain'); ops.numberer('RCM'); ops.system('BandGeneral'); ops.test('NormDispIncr', 1e-12, 10); ops.algorithm('Newton')
    ops.integrator('LoadControl', 1.0); ops.analysis('Static'); r = ops.analyze(1)
    uy = sum(ops.nodeDisp(nid(i, ny), 2) for i in range(nx + 1)) / (nx + 1)
    dmax = 0.0; vistos = 0
    for k in range(1, e + 1):
        st = None
        for nombre in ('stress', 'stresses'):
            try:
                st = ops.eleResponse(k, nombre)
                if st: break
            except Exception: pass
        if not st:
            try: st = ops.eleResponse(k, 'material', 1, 'stress')
            except Exception: st = None
        if not st: continue
        nq = len(st) // 3 if len(st) % 3 == 0 else 1
        sy_el = sum(st[3 * q + 1] for q in range(nq)) / nq                  # media de los puntos de Gauss del elemento
        nodos = ops.eleNodes(k); yc = sum(ops.nodeCoord(n)[1] for n in nodos) / len(nodos)
        dmax = max(dmax, abs(sy_el - (-gam * (H - yc)))); vistos += 1
    res[tipo] = {"ok": r == 0, "uy_cima": uy, "dif_sy_media_elemento": dmax if vistos else None, "elementos_con_tension": vistos}
    print("%-9s ok=%s  uy cima %.6f (exacto %.6f)  dif sy (media por elemento) %s  [%d elementos]" % (tipo, r == 0, uy, uex, ("%.2e" % dmax) if vistos else "sin tensiones", vistos))
json.dump(res, open(sys.argv[1], "w"))
