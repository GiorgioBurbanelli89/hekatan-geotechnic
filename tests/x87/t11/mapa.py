# Tanda 11: mapa nudos del InputFile de GEO5 (5686, orden del Restart_Step) -> nudos del JSON (5537); en nudos coincidentes manda el del SUELO (el lado medio del rigido no se actualiza). a_json(v) -> vector 2*nn.
import numpy as np, re, json
from scipy.spatial import cKDTree
txt=open((__import__("os").environ.get("T11_INPUT","g5ex/Input.txt")),encoding="mbcs").read()
nod=re.findall(r"^\s+(\d+) x=(\S+) y=(\S+)\s*$", txt.split("\n  faces")[0], re.M)
XY=np.array([[float(a),float(b)] for _,a,b in nod])
el=txt.split("\n  elements")[1].split("\n  end")[0]
E=[list(map(int,m.split(","))) for m in re.findall(r"nodes=\[([\d,]+)\]",el)]
suelo=set(i for e in E[23:] for i in e)
m=json.load(open(r"C:\Users\j-b-j\Documents\Hekatan Calc 1.0.0\hekatan-geotechnic\examples\geofem_muro_manabi_malla.json",encoding="utf-8"))
X=np.array(m["X"]);Y=np.array(m["Y"]); nn=len(X)
t=cKDTree(XY); cands=t.query_ball_point(np.stack([X,Y],1), 1e-9)
IDX=np.array([ (sorted([c for c in cs if c+1 in suelo]) or sorted(cs))[0] for cs in cands])
def a_json(v):  # v (5686,2) -> (2nn,)
    o=np.zeros(2*nn); o[0::2]=v[IDX,0]; o[1::2]=v[IDX,1]; return o
def check(v):
    return max(np.abs(v[[c for c in cs if c+1 in suelo]]-v[IDX[k]]).max() if [c for c in cs if c+1 in suelo] else 0 for k,cs in enumerate(cands))
