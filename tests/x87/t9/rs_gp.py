# -*- coding: utf-8 -*-
r"""Tanda 9: lector del Restart_Step.bin / Restart_In de GeoFEM POR PUNTO DE GAUSS (muro de Manabi, malla SRM 5537 nudos).
Medido en 160304_Restart_Step.bin: bloque por elemento de suelo = 192 B (cabecera: 6 dobles + fe[12] fuerzas internas del elemento)
+ 7 x 212 B por PG:  +0 eps[4] (ex ey gxy ez) · +32 sig[4] (sx sy txy sz) · +64 1 doble · +112 int banderas · +116 c · +124 phi · +132 psi
· +164 eps_p[4]. Elementos 24..2684 (los 23 rigidos no tienen PG). Primer bloque en 306624."""
import struct, numpy as np, json, os, sys
AQUI = os.path.dirname(os.path.abspath(__file__))
H0, BLK, HDR, REC = 306624, 1676, 192, 212
def lee(fn, ne=2684, nrig=23):
    b = open(fn, "rb").read(); n = ne - nrig
    eps = np.zeros((n, 7, 4)); sig = np.zeros((n, 7, 4)); epl = np.zeros((n, 7, 4)); fl = np.zeros((n, 7), int); cphi = np.zeros((n, 7, 3)); fe = np.zeros((n, 12)); x64 = np.zeros((n, 7))
    for k in range(n):
        o = H0 + k * BLK; fe[k] = struct.unpack_from("<12d", b, o + 96)
        for q in range(7):
            r = o + HDR + q * REC
            eps[k, q] = struct.unpack_from("<4d", b, r); sig[k, q] = struct.unpack_from("<4d", b, r + 32); x64[k, q] = struct.unpack_from("<d", b, r + 64)[0]
            fl[k, q] = struct.unpack_from("<i", b, r + 112)[0]; cphi[k, q] = struct.unpack_from("<3d", b, r + 116); epl[k, q] = struct.unpack_from("<4d", b, r + 164)
    nd = (len(b) - 0)
    return dict(eps=eps, sig=sig, epl=epl, fl=fl, cphi=cphi, fe=fe, x64=x64, raw=b)
if __name__ == "__main__":
    d = lee(sys.argv[1]); print("phi rango", np.degrees(d["cphi"][:, :, 1]).min(), np.degrees(d["cphi"][:, :, 1]).max(), "banderas", np.unique(d["fl"], return_counts=True))
    print("sig[0]", d["sig"][0], "fe[0]", d["fe"][0])
