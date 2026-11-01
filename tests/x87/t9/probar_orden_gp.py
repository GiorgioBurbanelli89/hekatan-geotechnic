import sys, itertools, numpy as np, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),"orden_gp.py"),encoding="utf-8").read().split('if __name__')[0])
d=lee(sys.argv[1]); nn=len(X); ndof=2*nn
G=np.array(GP)
# 1) ajuste lineal de eps
def fitres(p):
    A=np.c_[np.ones(7),G[:,0],G[:,1]]; r=0
    for k in range(0,2661,29):
        v=d["eps"][k][p,:3]; c,*_=np.linalg.lstsq(A,v,rcond=None); r+=np.abs(A@c-v).max()/np.abs(v).max()
    return r
cands=[]
for A_,B_ in (((0,1,2),(3,4,5)),((3,4,5),(0,1,2))):
    for pa in itertools.permutations(A_):
        for pb in itertools.permutations(B_):
            p=[6]+list(pa)+list(pb); cands.append((fitres(p),p))
cands.sort(); print("ajuste lineal:", [(round(a,8),p) for a,p in cands[:8]])
good=[p for a,p in cands if a<1e-3]
fixed=set(m["FIXED"]); rig=set()
for e in range(23): rig|=set(ELE[e])
Fg=np.array(m["Fg"]) if len(m["Fg"])==ndof else None
BW=[Bw(e) for e in range(2684)]
grav=np.zeros(ndof)
for e in range(2684):
    rho=-m["MAT"][m["EMAT"][e]-1][4]
    for B,w,N in BW[e]: grav[2*ELE[e]+1]+=N*rho*w
for p in good:
    F=np.zeros(ndof)
    for k in range(2661):
        e=k+23; s=d["sig"][k]
        for q,(B,w,N) in enumerate(BW[e]):
            sq=s[p[q]]; f=B.T@np.array([sq[0],sq[1],sq[2]])*w
            F[0::2][ELE[e]]+=f[0::2]; F[1::2][ELE[e]]+=f[1::2]
    free=np.array([i for i in range(ndof) if i not in fixed]); nonrig=np.array([i for i in free if i//2 not in rig])
    R=grav-F
    print(p, "|F_int suelo| libres %.4f"%np.linalg.norm(F[free]), "|Fg-Fint| (sin nudos del rigido) %.4f"%np.linalg.norm(R[nonrig]), "|Fg| %.4f"%np.linalg.norm(grav[free]))
