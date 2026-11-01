// main nativo: lee modelo.txt y corre el SRM del muro como tests/srm_muro_log.ts (srmContinua=19, etapa «peso propio» = Fg recalculada).
#include <cstdio>
#include <vector>
extern "C" {
int geofem_create(int, int, const REAL*, const REAL*, const int*, const int*, int, const int*, int, const REAL*);
void geofem_set_rigid(int, const int*, int); void geofem_set_srm(int, int); void geofem_set_model(int, const int*, int);
REAL* geofem_gravity(int); int geofem_nfree(int);
REAL geofem_run_stage(int, const REAL*, REAL*, REAL*, REAL*, REAL*, int);
}
int main(int argc, char** argv) {
  int mode = argc > 1 ? atoi(argv[1]) : 19; double pert = argc > 2 ? atof(argv[2]) : 0.0;   // pert: factor relativo sobre E de las dos arenas
  FILE* f = fopen("modelo.txt", "r"); int nn, ne, nm, nf; fscanf(f, "%d %d %d %d", &nn, &ne, &nm, &nf);
  std::vector<REAL> X(nn), Y(nn), MAT(6 * nm); std::vector<int> ELE(6 * ne), EM(ne), FX(nf), RG(nm), MD(nm);
  auto rd = [&](REAL& v) { double d; fscanf(f, "%lf", &d); v = d; };
  for (auto& v : X) rd(v); for (auto& v : Y) rd(v); for (auto& v : ELE) fscanf(f, "%d", &v); for (auto& v : EM) fscanf(f, "%d", &v);
  for (auto& v : FX) fscanf(f, "%d", &v); for (auto& v : MAT) rd(v); for (int m_ = 0; m_ < 2 && m_ < nm; m_++) MAT[6 * m_] *= (1 + (REAL)pert); for (auto& v : RG) fscanf(f, "%d", &v); for (auto& v : MD) fscanf(f, "%d", &v);
  int h = geofem_create(nn, ne, X.data(), Y.data(), ELE.data(), EM.data(), nf, FX.data(), nm, MAT.data());
  geofem_set_rigid(h, RG.data(), nm); geofem_set_srm(h, mode); geofem_set_model(h, MD.data(), nm);
  int ndof = 2 * nn; std::vector<REAL> F(ndof), U(ndof), UE(ndof), SR(12), SU(12 * (size_t)ndof);
  REAL* g = geofem_gravity(h); for (int d = 0; d < ndof; d++) F[d] = g[d];
  REAL fs = geofem_run_stage(h, F.data(), U.data(), UE.data(), SR.data(), SU.data(), 12);
  printf("FS_FINAL %.6f\n", (double)fs);
  return 0;
}
