// GeoFEM de Hekatan Geotechnic en C++ → WASM. Mismo algoritmo, misma secuencia de operaciones que
// solver.ts (port fiel de talud_geo5_hek.py = GEO5 a 12 cifras). Sin Eigen: LU en banda no simétrica
// con Cuthill-McKee inverso, como el skyline de GEO5.
//
// API C (ver geofemWasm.ts):
//   int    geofem_create(nn, ne, X, Y, ELE(6*ne), EMAT(ne), nfixed, FIXED, nmat, MAT(6*nmat))
//   void   geofem_set_rigid(h, rigid(nmat), nmat)   // 1 = region elastica (muro: Rigid body de GEO5)
//   void   geofem_set_mat(h, MAT)                     // φ y c por corrida (E, ν, γ requieren create)
//   double geofem_run_stage(h, F(ndof), recomputeGravity, out_u, out_uel, out_steps_srf, out_steps_u, max_steps)
//          devuelve FS; escribe u, uel y los peldaños convergidos (n en geofem_nsteps)
//   int    geofem_nsteps(h); double* geofem_gravity(h); void geofem_destroy(h)
//   El log sale línea a línea por Module.geoLog(str) (EM_ASM).
#include <cmath>
#include <cstdio>
#include <cstdarg>
#include <cstdlib>
#include <cstring>
#include <vector>
#include <array>
#include <string>
#include <algorithm>
#include <emscripten.h>

using std::vector;

static void LOG(const std::string& s) {
  EM_ASM({ if (Module.geoLog) Module.geoLog(UTF8ToString($0)); }, s.c_str());
}
static std::string fmt(const char* f, ...) {
  char buf[512]; va_list ap; va_start(ap, f); vsnprintf(buf, sizeof buf, f, ap); va_end(ap); return buf;
}

// ---------------- banda ----------------
struct Band {
  int n = 0, b = 0, w = 0; vector<double> a;
  void init(int n_, int b_) { n = n_; b = b_; w = 2 * b + 1; a.assign((size_t)n * w, 0.0); }
  void clear() { std::fill(a.begin(), a.end(), 0.0); }
  inline void add(int i, int j, double v) { a[(size_t)i * w + (j - i + b)] += v; }
  bool factor() {
    for (int k = 0; k < n; k++) {
      double pk = a[(size_t)k * w + b];
      if (!(std::fabs(pk) > 1e-300) || !std::isfinite(pk)) return false;
      int iEnd = std::min(n - 1, k + b);
      double* rowK = &a[(size_t)k * w + (b - k)];
      for (int i = k + 1; i <= iEnd; i++) {
        double* rowI = &a[(size_t)i * w + (b - i)];
        double l = rowI[k] / pk;
        if (l == 0.0) continue;
        rowI[k] = l;
        for (int j = k + 1; j <= iEnd; j++) rowI[j] -= l * rowK[j];
      }
    }
    return true;
  }
  void solve(const double* rhs, double* x) const {
    for (int i = 0; i < n; i++) x[i] = rhs[i];
    for (int i = 0; i < n; i++) {
      const double* rowI = &a[(size_t)i * w + (b - i)];
      int j0 = std::max(0, i - b); double s = x[i];
      for (int j = j0; j < i; j++) s -= rowI[j] * x[j];
      x[i] = s;
    }
    for (int i = n - 1; i >= 0; i--) {
      const double* rowI = &a[(size_t)i * w + (b - i)];
      int j1 = std::min(n - 1, i + b); double s = x[i];
      for (int j = i + 1; j <= j1; j++) s -= rowI[j] * x[j];
      x[i] = s / rowI[i];
    }
  }
};

// ---------------- cuadratura ----------------
static const double c7 = 0.1012865073235, C7 = 0.7974269853531, e7 = 0.4701420641051, E7 = 0.0597158717898;
static const double GP[7][2] = {{1.0 / 3, 1.0 / 3}, {c7, c7}, {C7, c7}, {c7, C7}, {e7, e7}, {E7, e7}, {e7, E7}};
static const double GW[7] = {0.225 / 2, 0.1259391805448 / 2, 0.1259391805448 / 2, 0.1259391805448 / 2, 0.1323941527885 / 2, 0.1323941527885 / 2, 0.1323941527885 / 2};
static const int NG = 7;
static const double ONE[4] = {1, 1, 1, 0};

static void t6(double L1, double L2, double* N, double* dL1, double* dL2) {
  double L3 = 1 - L1 - L2;
  double n[6] = {L1 * (2 * L1 - 1), L2 * (2 * L2 - 1), L3 * (2 * L3 - 1), 4 * L1 * L2, 4 * L2 * L3, 4 * L3 * L1};
  double d1[6] = {4 * L1 - 1, 0, -(4 * L3 - 1), 4 * L2, -4 * L2, 4 * L3 - 4 * L1};
  double d2[6] = {0, 4 * L2 - 1, -(4 * L3 - 1), 4 * L1, 4 * L3 - 4 * L2, -4 * L1};
  for (int a = 0; a < 6; a++) { N[a] = n[a]; dL1[a] = d1[a]; dL2[a] = d2[a]; }
}
static double vnorm(const double* v, int n) { double s = 0; for (int i = 0; i < n; i++) s += v[i] * v[i]; return std::sqrt(s); }
static double vdot(const double* a, const double* b, int n) { double s = 0; for (int i = 0; i < n; i++) s += a[i] * b[i]; return s; }

struct GeoFem {
  int nn, ne, ndof, nfree, band;
  vector<double> X, Y; vector<int> ELE, EMAT; vector<double> MAT; int nmat;
  vector<int> rigid;        // 1 = material RÍGIDO (muro de hormigón = «Rigid body» de GEO5): región elástica, la SRM no lo reduce
  vector<int> free_, map_;
  vector<double> D4;        // (nmat+1)*16
  vector<double> Bc, dJw; vector<int> edof;
  Band Kel, Kt;
  vector<double> SIG, DEP; vector<unsigned char> hasDep;
  // estado de TENSIÓN (SRF=1, la «stress analysis» de GEO5) para los campos del visor: σ, ε total, ε plástica acumulada, u
  vector<double> EPL, Dinv, SIG1, EPL1, EPS1, U1;
  vector<double> Fg2;
  int nstepsOut = 0;

  void rcm(vector<int>& perm) {
    vector<vector<int>> adj(nn);
    for (int e = 0; e < ne; e++) for (int a = 0; a < 6; a++) for (int c = 0; c < 6; c++) {
      int p = ELE[e * 6 + a], q = ELE[e * 6 + c]; if (p == q) continue;
      if (std::find(adj[p].begin(), adj[p].end(), q) == adj[p].end()) adj[p].push_back(q);
    }
    // el Set de JS conserva orden de inserción: mismo criterio aquí (vector con inserción única)
    vector<int> deg(nn); for (int i = 0; i < nn; i++) deg[i] = (int)adj[i].size();
    vector<unsigned char> vis(nn, 0); vector<int> order; order.reserve(nn);
    while ((int)order.size() < nn) {
      int start = -1; for (int i = 0; i < nn; i++) if (!vis[i] && (start < 0 || deg[i] < deg[start])) start = i;
      vis[start] = 1; order.push_back(start);
      for (size_t h = order.size() - 1; h < order.size(); h++) {
        vector<int> nb; for (int v : adj[order[h]]) if (!vis[v]) nb.push_back(v);
        std::stable_sort(nb.begin(), nb.end(), [&](int p, int q) { return deg[p] < deg[q]; });
        for (int v : nb) { vis[v] = 1; order.push_back(v); }
      }
    }
    std::reverse(order.begin(), order.end());
    perm.assign(nn, 0); for (int k = 0; k < nn; k++) perm[order[k]] = k;
  }

  void build() {
    ndof = 2 * nn;
    vector<unsigned char> fixed(ndof, 0);
    vector<int> perm; rcm(perm);
    vector<int> byPos(nn); for (int i = 0; i < nn; i++) byPos[perm[i]] = i;
    return_build(fixed, byPos);
  }
  vector<int> FIXED;
  void return_build(vector<unsigned char>& fixed, vector<int>& byPos) {
    for (int d : FIXED) fixed[d] = 1;
    free_.clear();
    for (int p = 0; p < nn; p++) { int i = byPos[p]; if (!fixed[2 * i]) free_.push_back(2 * i); if (!fixed[2 * i + 1]) free_.push_back(2 * i + 1); }
    nfree = (int)free_.size();
    map_.assign(ndof, -1); for (int k = 0; k < nfree; k++) map_[free_[k]] = k;
    int n1 = 0, n2 = 0; for (int e = 0; e < ne; e++) if (EMAT[e] == 1) n1++; else n2++;
    LOG(fmt("MALLA GEO5: %d nodos, %d T6 (SOIL_1=%d, SOIL_2=%d), %d gdl fijos", nn, ne, n1, n2, (int)FIXED.size()));
    for (int mm = 0; mm < 2; mm++) {
      const double* M = &MAT[mm * 6];
      LOG(fmt("MAT SOIL_%d: E=%.0f nu=%.2f phi=%.2f c=%.2f gamma=%.1f psi=%.1f", mm + 1, M[0], M[1], M[2], M[3], M[4], M[5]));
    }
    D4.assign((size_t)(nmat + 1) * 16, 0.0);
    for (int mm = 0; mm < nmat; mm++) {
      double E = MAT[mm * 6], nu = MAT[mm * 6 + 1], f = E / ((1 + nu) * (1 - 2 * nu));
      double* D = &D4[(size_t)(mm + 1) * 16];
      D[0] = f * (1 - nu); D[1] = f * nu; D[2] = f * nu;
      D[4] = f * nu; D[5] = f * (1 - nu); D[6] = f * nu;
      D[8] = f * nu; D[9] = f * nu; D[10] = f * (1 - nu);
      D[15] = f * (1 - 2 * nu) / 2;
    }
    Bc.assign((size_t)ne * NG * 36, 0.0); dJw.assign((size_t)ne * NG, 0.0); edof.assign((size_t)ne * 12, 0);
    Fg2.assign(ndof, 0.0);
    band = 0;
    for (int e = 0; e < ne; e++) {
      const int* nd = &ELE[e * 6];
      double xs[6], ys[6]; for (int a = 0; a < 6; a++) { xs[a] = X[nd[a]]; ys[a] = Y[nd[a]]; }
      for (int a = 0; a < 6; a++) { edof[e * 12 + 2 * a] = 2 * nd[a]; edof[e * 12 + 2 * a + 1] = 2 * nd[a] + 1; }
      for (int a = 0; a < 12; a++) for (int b = 0; b < 12; b++) {
        int ia = map_[edof[e * 12 + a]], ib = map_[edof[e * 12 + b]];
        if (ia >= 0 && ib >= 0 && std::abs(ia - ib) > band) band = std::abs(ia - ib);
      }
      double rho = -MAT[(EMAT[e] - 1) * 6 + 4];
      for (int q = 0; q < NG; q++) {
        double N[6], dL1[6], dL2[6]; t6(GP[q][0], GP[q][1], N, dL1, dL2);
        double j11 = 0, j12 = 0, j21 = 0, j22 = 0;
        for (int a = 0; a < 6; a++) { j11 += dL1[a] * xs[a]; j12 += dL1[a] * ys[a]; j21 += dL2[a] * xs[a]; j22 += dL2[a] * ys[a]; }
        double dJ = j11 * j22 - j12 * j21;
        double* B = &Bc[((size_t)e * NG + q) * 36];
        for (int a = 0; a < 6; a++) {
          double dNx = (j22 * dL1[a] - j12 * dL2[a]) / dJ, dNy = (-j21 * dL1[a] + j11 * dL2[a]) / dJ;
          B[0 * 12 + 2 * a] = dNx; B[1 * 12 + 2 * a + 1] = dNy; B[2 * 12 + 2 * a] = dNy; B[2 * 12 + 2 * a + 1] = dNx;
        }
        dJw[(size_t)e * NG + q] = dJ * GW[q];
        for (int a = 0; a < 6; a++) Fg2[2 * nd[a] + 1] += N[a] * rho * dJ * GW[q];
      }
    }
    SIG.assign((size_t)ne * NG * 4, 0.0); DEP.assign((size_t)ne * NG * 16, 0.0); hasDep.assign((size_t)ne * NG, 0);
    EPL.assign((size_t)ne * NG * 4, 0.0); SIG1.assign((size_t)ne * NG * 4, 0.0); EPL1.assign((size_t)ne * NG * 4, 0.0); EPS1.assign((size_t)ne * NG * 4, 0.0); U1.assign(ndof, 0.0);
    // inversa de De (4x4) por material: ε_el = Dinv·Δσ → ε_pl = Δε − ε_el
    Dinv.assign((size_t)(nmat + 1) * 16, 0.0);
    for (int mm = 1; mm <= nmat; mm++) {
      double A[4][8]; const double* D = &D4[(size_t)mm * 16];
      for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) { A[i][j] = D[i * 4 + j]; A[i][4 + j] = (i == j) ? 1.0 : 0.0; }
      for (int c = 0; c < 4; c++) {   // Gauss-Jordan con pivote parcial
        int piv = c; for (int r = c + 1; r < 4; r++) if (std::fabs(A[r][c]) > std::fabs(A[piv][c])) piv = r;
        for (int j = 0; j < 8; j++) std::swap(A[c][j], A[piv][j]);
        double d = A[c][c]; for (int j = 0; j < 8; j++) A[c][j] /= d;
        for (int r = 0; r < 4; r++) if (r != c) { double f = A[r][c]; for (int j = 0; j < 8; j++) A[r][j] -= f * A[c][j]; }
      }
      for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) Dinv[(size_t)mm * 16 + i * 4 + j] = A[i][4 + j];
    }
    Kel.init(nfree, band); Kt.init(nfree, band);
    assembleK(Kel, true);
    Kel.factor();
  }

  void assembleK(Band& K, bool elastic) {
    K.clear();
    double Ke[144], DB[36];
    for (int e = 0; e < ne; e++) {
      const double* De = &D4[(size_t)EMAT[e] * 16];
      std::memset(Ke, 0, sizeof Ke);
      for (int q = 0; q < NG; q++) {
        size_t kk = (size_t)e * NG + q;
        const double* B = &Bc[kk * 36];
        const double* D = (!elastic && hasDep[kk]) ? &DEP[kk * 16] : De;
        double d00 = D[0], d01 = D[1], d03 = D[3], d10 = D[4], d11 = D[5], d13 = D[7], d30 = D[12], d31 = D[13], d33 = D[15];
        double w = dJw[kk];
        for (int c = 0; c < 12; c++) {
          double b0 = B[c], b1 = B[12 + c], b2 = B[24 + c];
          DB[c] = (d00 * b0 + d01 * b1 + d03 * b2) * w;
          DB[12 + c] = (d10 * b0 + d11 * b1 + d13 * b2) * w;
          DB[24 + c] = (d30 * b0 + d31 * b1 + d33 * b2) * w;
        }
        for (int r = 0; r < 12; r++) {
          double br0 = B[r], br1 = B[12 + r], br2 = B[24 + r];
          for (int c = 0; c < 12; c++) Ke[r * 12 + c] += br0 * DB[c] + br1 * DB[12 + c] + br2 * DB[24 + c];
        }
      }
      for (int r = 0; r < 12; r++) {
        int ir = map_[edof[e * 12 + r]]; if (ir < 0) continue;
        for (int c = 0; c < 12; c++) { int ic = map_[edof[e * 12 + c]]; if (ic >= 0) K.add(ir, ic, Ke[r * 12 + c]); }
      }
    }
  }

  static void dpAb(double phi, double c, double& al, double& k) {
    double s = std::sin(phi), co = std::cos(phi), r3 = std::sqrt(3.0);
    al = 2 * s / (r3 * (3 + s)); k = 6 * c * co / (r3 * (3 + s));
  }

  bool dpReturn(const double* deps, double al, double k, const double* De, bool wantK, const double* sigN, double* sig, double* outDep) {
    double G = De[15], K = (De[0] + 2 * De[1]) / 3;
    for (int i = 0; i < 4; i++) { double s = 0; for (int j = 0; j < 4; j++) s += De[i * 4 + j] * deps[j]; sig[i] = s + (sigN ? sigN[i] : 0); }
    double I1 = sig[0] + sig[1] + sig[2], sm = I1 / 3;
    double s0 = sig[0] - sm, s1 = sig[1] - sm, s2 = sig[2] - sm, s3 = sig[3];
    double J = std::sqrt(std::max(0.5 * (s0 * s0 + s1 * s1 + s2 * s2) + s3 * s3, 0.0));
    double f = J + al * I1 - k;
    if (f <= 1e-12) return false;
    double apexP = al > 1e-12 ? k / (3 * al) : 1e300;
    if (sm < apexP && J > 1e-12) {
      double lam = f / G, Jn = J - G * lam;
      if (Jn >= 1e-12) {
        double beta = Jn / J;
        sig[0] = sm + beta * s0; sig[1] = sm + beta * s1; sig[2] = sm + beta * s2; sig[3] = beta * s3;
        if (!wantK) return false;
        double p = (sig[0] + sig[1] + sig[2]) / 3;
        double dv[4] = {sig[0] - p, sig[1] - p, sig[2] - p, sig[3]};
        double sj = std::sqrt(std::max(0.5 * (dv[0] * dv[0] + dv[1] * dv[1] + dv[2] * dv[2]) + dv[3] * dv[3], 0.0));
        if (sj < 1e-12) { for (int i = 0; i < 16; i++) outDep[i] = 1e-3 * De[i]; return true; }
        double w[4] = {dv[0] / (2 * sj), dv[1] / (2 * sj), dv[2] / (2 * sj), 2 * dv[3] / (2 * sj)};
        double n[4] = {w[0] + al, w[1] + al, w[2] + al, w[3]};
        const double* mv = w;
        double Xi[16];
        for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) {
          double one = ONE[i] * ONE[j];
          double pdev = (i == j ? 1 : 0) - one / 3;
          Xi[i * 4 + j] = K * one + beta * 2 * G * pdev;
        }
        Xi[15] = beta * G;
        double Xm[4] = {0, 0, 0, 0}, nXi[4] = {0, 0, 0, 0};
        for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) { Xm[i] += Xi[i * 4 + j] * mv[j]; nXi[j] += n[i] * Xi[i * 4 + j]; }
        double den = 0; for (int i = 0; i < 4; i++) den += n[i] * Xm[i];
        if (std::fabs(den) > 1e-30) for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) outDep[i * 4 + j] = Xi[i * 4 + j] - Xm[i] * nXi[j] / den;
        else for (int i = 0; i < 16; i++) outDep[i] = Xi[i];
        return true;
      }
    }
    sig[0] = apexP; sig[1] = apexP; sig[2] = apexP; sig[3] = 0;
    return false;
  }

  void resetState() { std::fill(SIG.begin(), SIG.end(), 0.0); std::fill(hasDep.begin(), hasDep.end(), 0); std::fill(EPL.begin(), EPL.end(), 0.0); }

  void assembleInc(const double* du, const std::vector<std::array<double, 2>>& ab, bool commit, double* Fi) {
    std::fill(Fi, Fi + ndof, 0.0);
    double ue[12], deps[4], sig[4], Dep[16];
    for (int e = 0; e < ne; e++) {
      int mm = EMAT[e]; const double* De = &D4[(size_t)mm * 16]; double al = ab[mm][0], k = ab[mm][1];
      for (int a = 0; a < 12; a++) ue[a] = du[edof[e * 12 + a]];
      for (int q = 0; q < NG; q++) {
        size_t kk = (size_t)e * NG + q;
        const double* B = &Bc[kk * 36];
        double e0 = 0, e1 = 0, e2 = 0;
        for (int c = 0; c < 12; c++) { e0 += B[c] * ue[c]; e1 += B[12 + c] * ue[c]; e2 += B[24 + c] * ue[c]; }
        deps[0] = e0; deps[1] = e1; deps[2] = 0; deps[3] = e2;
        double* sigN = &SIG[kk * 4];
        bool got = dpReturn(deps, al, k, De, commit, sigN, sig, Dep);
        double w = dJw[kk];
        double t0 = sig[0] * w, t1 = sig[1] * w, t3 = sig[3] * w;
        for (int c = 0; c < 12; c++) Fi[edof[e * 12 + c]] += B[c] * t0 + B[12 + c] * t1 + B[24 + c] * t3;
        if (commit) {
          if (got) {   // deformación plástica acumulada: Δε_pl = Δε − Dinv·Δσ (en un punto elástico sale 0)
            const double* Di = &Dinv[(size_t)mm * 16]; double ds[4]; for (int i = 0; i < 4; i++) ds[i] = sig[i] - sigN[i];
            for (int i = 0; i < 4; i++) { double eel = 0; for (int j = 0; j < 4; j++) eel += Di[i * 4 + j] * ds[j]; EPL[kk * 4 + i] += deps[i] - eel; }
          }
          for (int i = 0; i < 4; i++) sigN[i] = sig[i];
          if (got) { std::memcpy(&DEP[kk * 16], Dep, sizeof Dep); hasDep[kk] = 1; } else hasDep[kk] = 0;
        }
      }
    }
  }

  bool nrstep(double SRF, const double* Fext, int rstep, vector<double>& u, int& itOut) {
    const int maxit = 100;
    std::vector<std::array<double, 2>> ab(nmat + 1, {0.0, 0.0});   // un par (alpha,k) por suelo, TODOS (antes ab[3] fijo: con 3+ suelos leía basura)
    for (int mm = 0; mm < nmat; mm++) {
      // RIGID BODY de GEO5 (muro de hormigón): región ELÁSTICA. Con k = ∞ queda f = J + a*I1 - k < 0 siempre, así
      // que el return-map no se activa nunca y la reducción de resistencia no le toca: sostiene el talud sin plastificar.
      if (mm < (int)rigid.size() && rigid[mm]) { ab[mm + 1][0] = 0.0; ab[mm + 1][1] = 1e30; continue; }
      double phi = std::atan(std::tan(MAT[mm * 6 + 2] * 3.141592653589793 / 180) / SRF), c = MAT[mm * 6 + 3] / SRF;
      dpAb(phi, c, ab[mm + 1][0], ab[mm + 1][1]);
    }
    int nf = nfree; const int* fr = free_.data();
    u.assign(ndof, 0.0);
    vector<double> du(ndof, 0.0), Fi(ndof, 0.0), F1(ndof, 0.0), Rf(nf), R1(nf), duf(nf), drf(nf), ADDisp(nf, 0.0), DForce(nf);
    bool conv = false; int it = 0;
    resetState();
    assembleInc(du.data(), ab, false, Fi.data());
    for (int k = 0; k < nf; k++) Rf[k] = Fext[fr[k]] - Fi[fr[k]];
    DForce = Rf;
    double rPrev = 1e300; int ndiv = 0;
    for (it = 1; it <= maxit; it++) {
      if (!std::isfinite(vnorm(Rf.data(), nf))) break;
      assembleK(Kt, false);
      bool ok = Kt.factor();
      if (ok) { Kt.solve(Rf.data(), duf.data()); if (!std::isfinite(vnorm(duf.data(), nf))) ok = false; }
      if (!ok) Kel.solve(Rf.data(), duf.data());
      std::fill(du.begin(), du.end(), 0.0); for (int k = 0; k < nf; k++) du[fr[k]] = duf[k];
      double s0 = vdot(duf.data(), Rf.data(), nf), n0 = vnorm(Rf.data(), nf);
      double al = 1.0;
      assembleInc(du.data(), ab, false, F1.data());
      for (int k = 0; k < nf; k++) R1[k] = Fext[fr[k]] - F1[fr[k]];
      double s1 = vdot(duf.data(), R1.data(), nf), n1 = vnorm(R1.data(), nf), den = s0 - s1;
      if (n0 > 1e-10 && n1 > 1e-10 && std::fabs(den) > 1e-10 && n1 / n0 >= 0.8) al = al * s0 / den;
      if (al < 0.1) al = 0.1; else if (al >= 1.0) al = 1.0;
      for (int k = 0; k < nf; k++) drf[k] = al * duf[k];
      for (int d = 0; d < ndof; d++) { du[d] *= al; u[d] += du[d]; }
      assembleInc(du.data(), ab, true, Fi.data());
      for (int k = 0; k < nf; k++) Rf[k] = Fext[fr[k]] - Fi[fr[k]];
      for (int k = 0; k < nf; k++) ADDisp[k] += drf[k];
      double nDD = vnorm(drf.data(), nf), dA = vnorm(ADDisp.data(), nf), nDL = vnorm(Rf.data(), nf), dF = vnorm(DForce.data(), nf);
      double nEN = std::sqrt(std::fabs(vdot(drf.data(), Rf.data(), nf))), dE = std::sqrt(std::fabs(vdot(ADDisp.data(), DForce.data(), nf)));
      double eu = dA > 1 ? nDD / dA : nDD, ef = dF > 1 ? nDL / dF : nDL, ee = dE > 1 ? nEN / dE : nEN;
      double dxmax = 0; for (int i = 0; i < nn; i++) dxmax = std::max(dxmax, std::fabs(u[2 * i]));
      LOG(fmt("  RS=%d SRF=%.4f it=%2d eta=%.4f DNorm=%.5e OBFNorm=%.5e ENorm=%.5e |gi|=%.4e dx=%.1f", rstep, SRF, it, al, eu, ef, ee, nDL, dxmax * 1e3));
      if (ef < 1e-2 && ee < 1e-2 && eu < 1e-2) { conv = true; break; }
      if (ef > 250) break;
      if (nDL <= rPrev || ef <= 1e-2) ndiv = 0; else ndiv++;
      rPrev = nDL;
      if (ndiv >= 2) break;
    }
    itOut = it;
    return conv;
  }

  double runStage(const double* Ftot, double* outU, double* outUel, double* outSrf, double* outStepsU, int maxSteps) {
    const double RED0 = 0.9, RELAX = 2, MINSTEP = 0.99; const int MAXRELAX = 3;
    double Racc = 1, fs = 1; int nrelax = 0, rs = 0; std::string prog;
    vector<double> ulo(ndof, 0.0), u; int n0;
    bool c0 = nrstep(1.0, Ftot, 0, u, n0);
    // instantánea del estado de tensión (SRF=1) para los campos del visor
    SIG1 = SIG; EPL1 = EPL; U1 = u;
    for (int e = 0; e < ne; e++) for (int q = 0; q < NG; q++) {
      size_t kk = (size_t)e * NG + q; const double* B = &Bc[kk * 36]; double e0 = 0, e1 = 0, e2 = 0;
      for (int c = 0; c < 12; c++) { double v = u[edof[e * 12 + c]]; e0 += B[c] * v; e1 += B[12 + c] * v; e2 += B[24 + c] * v; }
      EPS1[kk * 4] = e0; EPS1[kk * 4 + 1] = e1; EPS1[kk * 4 + 2] = 0; EPS1[kk * 4 + 3] = e2;
    }
    vector<double> rhs(nfree), x(nfree);
    for (int k = 0; k < nfree; k++) rhs[k] = Ftot[free_[k]];
    Kel.solve(rhs.data(), x.data());
    std::fill(outUel, outUel + ndof, 0.0); for (int k = 0; k < nfree; k++) outUel[free_[k]] = x[k];
    LOG(fmt("    SRM rs00 paso=1.0000 SRF=1.0000 %s it=%d", c0 ? "CONVERGE" : "DIVERGE", n0));
    nstepsOut = 0;
    for (;;) {
      double s = 1 - (1 - RED0) / std::pow(RELAX, nrelax);
      if (s > MINSTEP) break;
      double trial = 1 / (Racc * s);
      if (trial > 3) break;
      rs++;
      int nit; bool conv = nrstep(trial, Ftot, rs, u, nit);
      if (conv && std::isfinite(vnorm(u.data(), ndof))) {
        Racc *= s; fs = trial; ulo = u;
        if (nstepsOut < maxSteps) { outSrf[nstepsOut] = trial; std::memcpy(outStepsU + (size_t)nstepsOut * ndof, u.data(), sizeof(double) * ndof); nstepsOut++; }
        double dxmax = 0; for (int i = 0; i < nn; i++) dxmax = std::max(dxmax, std::fabs(u[2 * i]));
        prog += fmt(" %.3f:%.0f", trial, dxmax * 1e3);
        LOG(fmt("    SRM rs%02d paso=%.4f SRF=%.4f CONVERGE it=%d", rs, s, trial, nit));
      } else {
        nrelax++;
        LOG(fmt("    SRM rs%02d paso=%.4f SRF=%.4f DIVERGE relax=%d", rs, s, trial, nrelax));
        if (nrelax > MAXRELAX) break;
      }
    }
    LOG(fmt("    progresion dx(mm) por SRF:%s", prog.c_str()));
    std::memcpy(outU, ulo.data(), sizeof(double) * ndof);
    return fs;
  }
};

static vector<GeoFem*> handles;

extern "C" {
EMSCRIPTEN_KEEPALIVE
int geofem_create(int nn, int ne, const double* X, const double* Y, const int* ELE, const int* EMAT, int nfixed, const int* FIXED, int nmat, const double* MAT) {
  GeoFem* g = new GeoFem();
  g->nn = nn; g->ne = ne; g->nmat = nmat;
  g->X.assign(X, X + nn); g->Y.assign(Y, Y + nn); g->ELE.assign(ELE, ELE + 6 * ne); g->EMAT.assign(EMAT, EMAT + ne);
  g->FIXED.assign(FIXED, FIXED + nfixed); g->MAT.assign(MAT, MAT + 6 * nmat);
  g->build();
  handles.push_back(g);
  return (int)handles.size() - 1;
}
// materiales RÍGIDOS (muros): 1 por material, en el mismo orden que MAT. Se llama justo tras geofem_create.
EMSCRIPTEN_KEEPALIVE void geofem_set_rigid(int h, const int* rigid, int n) { GeoFem* g = handles[h]; g->rigid.assign(rigid, rigid + n); }
EMSCRIPTEN_KEEPALIVE void geofem_set_mat(int h, const double* MAT) { GeoFem* g = handles[h]; std::memcpy(g->MAT.data(), MAT, sizeof(double) * 6 * g->nmat); }
EMSCRIPTEN_KEEPALIVE int geofem_band(int h) { return handles[h]->band; }
EMSCRIPTEN_KEEPALIVE int geofem_nfree(int h) { return handles[h]->nfree; }
EMSCRIPTEN_KEEPALIVE double* geofem_gravity(int h) { return handles[h]->Fg2.data(); }
EMSCRIPTEN_KEEPALIVE int geofem_nsteps(int h) { return handles[h]->nstepsOut; }
EMSCRIPTEN_KEEPALIVE int geofem_ngp(int h) { return handles[h]->ne * NG; }
// estado de TENSIÓN de la última etapa (SRF=1): σ (4/GP: xx yy zz xy), ε_pl (4/GP), ε (4/GP), u (ndof)
EMSCRIPTEN_KEEPALIVE void geofem_state1(int h, double* sig, double* epl, double* eps, double* u1) {
  GeoFem* g = handles[h]; size_t n = (size_t)g->ne * NG * 4;
  std::memcpy(sig, g->SIG1.data(), sizeof(double) * n); std::memcpy(epl, g->EPL1.data(), sizeof(double) * n); std::memcpy(eps, g->EPS1.data(), sizeof(double) * n);
  std::memcpy(u1, g->U1.data(), sizeof(double) * g->ndof);
}
EMSCRIPTEN_KEEPALIVE
double geofem_run_stage(int h, const double* F, double* outU, double* outUel, double* outSrf, double* outStepsU, int maxSteps) {
  return handles[h]->runStage(F, outU, outUel, outSrf, outStepsU, maxSteps);
}
EMSCRIPTEN_KEEPALIVE void geofem_destroy(int h) { delete handles[h]; handles[h] = nullptr; }
EMSCRIPTEN_KEEPALIVE double* geofem_alloc(int n) { return (double*)malloc(sizeof(double) * n); }
EMSCRIPTEN_KEEPALIVE int* geofem_alloc_i(int n) { return (int*)malloc(sizeof(int) * n); }
EMSCRIPTEN_KEEPALIVE void geofem_free(void* p) { free(p); }
}
