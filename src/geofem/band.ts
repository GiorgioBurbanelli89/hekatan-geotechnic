// Sistema lineal en BANDA (LU sin pivoteo, no simétrica) con renumeración Cuthill-McKee inversa.
// Es lo que hace el solver de GEO5 (skyline + Cuthill-McKee, sin librería): la tangente algorítmica
// de Drucker-Prager NO es simétrica, así que hace falta LU (en Python era splu), no LDLᵀ.
// Almacenamiento: fila i, columna j en A[i*(2b+1) + (j - i + b)], |i-j| <= b.

export type BandMatrix = {
  n: number;
  b: number;          // semiancho de banda
  w: number;          // ancho de fila = 2b+1
  a: Float64Array;    // n*w
  factored: boolean;
};

export function bandCreate(n: number, b: number): BandMatrix {
  const w = 2 * b + 1;
  return { n, b, w, a: new Float64Array(n * w), factored: false };
}

export function bandClear(M: BandMatrix): void { M.a.fill(0); M.factored = false; }

export function bandAdd(M: BandMatrix, i: number, j: number, v: number): void {
  M.a[i * M.w + (j - i + M.b)] += v;
}

/** LU sin pivoteo dentro de la banda (Gauss). Devuelve false si un pivote es ~0 o no finito. */
export function bandFactor(M: BandMatrix): boolean {
  const { n, b, w, a } = M;
  for (let k = 0; k < n; k++) {
    const pk = a[k * w + b];
    if (!(Math.abs(pk) > 1e-300) || !Number.isFinite(pk)) return false;
    const iEnd = Math.min(n - 1, k + b);
    const jEnd = iEnd;
    for (let i = k + 1; i <= iEnd; i++) {
      const rowI = i * w + (b - i);        // a[i, j] = a[rowI + j]
      const rowK = k * w + (b - k);
      const l = a[rowI + k] / pk;
      if (l === 0) continue;
      a[rowI + k] = l;
      for (let j = k + 1; j <= jEnd; j++) a[rowI + j] -= l * a[rowK + j];
    }
  }
  M.factored = true;
  return true;
}

/** Resuelve A x = rhs con la factorización en sitio. */
export function bandSolve(M: BandMatrix, rhs: Float64Array, x: Float64Array): void {
  const { n, b, w, a } = M;
  x.set(rhs);
  for (let i = 0; i < n; i++) {                       // L y = rhs (L unitaria)
    const rowI = i * w + (b - i);
    const j0 = Math.max(0, i - b);
    let s = x[i];
    for (let j = j0; j < i; j++) s -= a[rowI + j] * x[j];
    x[i] = s;
  }
  for (let i = n - 1; i >= 0; i--) {                  // U x = y
    const rowI = i * w + (b - i);
    const j1 = Math.min(n - 1, i + b);
    let s = x[i];
    for (let j = i + 1; j <= j1; j++) s -= a[rowI + j] * x[j];
    x[i] = s / a[rowI + i];
  }
}

/** Cuthill-McKee inverso sobre la conectividad nodal de la malla (cada elemento acopla todos sus nudos). */
export function reverseCuthillMcKee(nn: number, ELE: number[][]): Int32Array {
  const adj: Set<number>[] = Array.from({ length: nn }, () => new Set<number>());
  for (const el of ELE) for (const a of el) for (const c of el) if (a !== c) adj[a].add(c);
  const deg = adj.map((s) => s.size);
  const visited = new Uint8Array(nn);
  const order: number[] = [];
  while (order.length < nn) {
    let start = -1;                                   // nudo no visitado de grado mínimo
    for (let i = 0; i < nn; i++) if (!visited[i] && (start < 0 || deg[i] < deg[start])) start = i;
    visited[start] = 1; order.push(start);
    for (let h = order.length - 1; h < order.length; h++) {
      const nb = Array.from(adj[order[h]]).filter((v) => !visited[v]).sort((p, q) => deg[p] - deg[q]);
      for (const v of nb) { visited[v] = 1; order.push(v); }
    }
  }
  order.reverse();
  const perm = new Int32Array(nn);                    // perm[nudo] = posición nueva
  for (let k = 0; k < nn; k++) perm[order[k]] = k;
  return perm;
}
