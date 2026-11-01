// main nativo del caso de UN T6 (caso.txt de mk_caso.py) con el MISMO código de Geotechnic (copia geofem_x87.cpp, REAL = double).
//   ./mc1e.exe <dir> [bits srm = 19] [modelo 1 = MC]   -> log de iteraciones por stdout, y al final u, u_el y σ por punto de Gauss
#include <cstdio>
#include <vector>
#include <string>
int main(int argc, char** argv) {
  std::string dir = argv[1]; int mode = argc > 2 ? atoi(argv[2]) : 19; int mdl = argc > 3 ? atoi(argv[3]) : 1;
  FILE* f = fopen((dir + "/caso.txt").c_str(), "r"); int nn, ne, nf; fscanf(f, "%d %d %d", &nn, &ne, &nf);
  std::vector<REAL> X(nn), Y(nn), MAT(6); std::vector<int> ELE(6 * ne), EM(ne, 1), FX(nf);
  auto rd = [&](REAL& v) { double d; fscanf(f, "%lf", &d); v = d; };
  for (auto& v : X) rd(v); for (auto& v : Y) rd(v); for (auto& v : ELE) fscanf(f, "%d", &v); for (auto& v : FX) fscanf(f, "%d", &v);
  for (auto& v : MAT) rd(v);
  int ndof = 2 * nn; std::vector<REAL> Fs(ndof); for (auto& v : Fs) rd(v); fclose(f);
  int h = geofem_create(nn, ne, X.data(), Y.data(), ELE.data(), EM.data(), nf, FX.data(), 1, MAT.data());
  int RG = 0; geofem_set_rigid(h, &RG, 1); geofem_set_srm(h, mode); geofem_set_model(h, &mdl, 1);
  std::vector<REAL> F(ndof), U(ndof), UE(ndof), SR(64), SU(64 * (size_t)ndof);
  REAL* g = geofem_gravity(h); for (int d = 0; d < ndof; d++) F[d] = g[d] + Fs[d];
  REAL fs = geofem_run_stage(h, F.data(), U.data(), UE.data(), SR.data(), SU.data(), 64);
  printf("FS_FINAL %.6f\n", (double)fs);
  for (int i = 0; i < nn; i++) printf("U %d %.10e %.10e  UEL %.10e %.10e\n", i + 1, (double)U[2 * i], (double)U[2 * i + 1], (double)UE[2 * i], (double)UE[2 * i + 1]);
  GeoFem* G = handles[h];
  for (int q = 0; q < NG; q++) printf("SIG1 gp%d %.8f %.8f %.8f %.8f\n", q, (double)G->SIG1[q * 4], (double)G->SIG1[q * 4 + 1], (double)G->SIG1[q * 4 + 2], (double)G->SIG1[q * 4 + 3]);
  for (int q = 0; q < NG; q++) printf("SIGF gp%d %.8f %.8f %.8f %.8f\n", q, (double)G->SIG[q * 4], (double)G->SIG[q * 4 + 1], (double)G->SIG[q * 4 + 2], (double)G->SIG[q * 4 + 3]);
  printf("REGIONES MC (llamadas al retorno): cara %ld  arista s2=s3 %ld  arista s1=s2 %ld  apice %ld\n", g_reg[1], g_reg[2], g_reg[4], g_reg[3]);
  return 0;
}
