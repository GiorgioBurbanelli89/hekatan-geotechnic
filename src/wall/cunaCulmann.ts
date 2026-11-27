// EMPUJE ACTIVO por CUÑAS DE PRUEBA (Culmann / Coulomb generalizado) sobre el plano ficticio vertical del talón, con terreno de
// superficie CUALQUIERA (el talud que sigue subiendo detrás del muro) y COHESIÓN. Hace falta porque con la pendiente del talud
// (β = 33.7°) mayor que φ (28°) la fórmula cerrada de Coulomb no tiene solución: el relleno solo se sostiene por la cohesión.
//
// Cuña: vértice A = (xT, zb) (pie del plano ficticio), plano de falla a θ sobre la horizontal hasta cortar la superficie, cara
// izquierda = plano ficticio vertical x = xT. Fuerzas sobre la cuña (la cuña baja hacia el muro, −t):
//   W = γ·área (abajo) · C = c·L·t (a lo largo del plano, hacia arriba) · R = N·n + N·tanφ·t (n = normal del plano hacia la cuña)
//   E = E·(cosδ, sinδ) del plano ficticio sobre la cuña (empuja hacia +x y hacia arriba: el suelo baja respecto al plano)
// Equilibrio (2 ecuaciones, incógnitas E y N) para cada θ; el empuje activo = máx_θ E(θ).
// Comprobado (tests/analitico.ts): terreno horizontal, c = 0 → ½·Ka·γ·H² con Ka de Coulomb (kaCoulomb de verify.ts);
// δ = 0, c > 0 → Rankine ½·Ka·γ·H² − 2c·√Ka·H.
export type Cuna = { E: number; theta: number; W: number; L: number; xB: number; zB: number };

export function empujeCulmann(xT: number, zb: number, superficie: (x: number) => number, xMax: number, gamma: number, phi: number, c: number, delta: number): Cuna {
  const r = (g: number) => (g * Math.PI) / 180, tf = Math.tan(r(phi)), cd = Math.cos(r(delta)), sd = Math.sin(r(delta));
  let best: Cuna = { E: -Infinity, theta: 0, W: 0, L: 0, xB: xT, zB: zb };
  const zsT = superficie(xT);
  for (let th = 5; th <= 89.5; th += 0.05) {
    const t = Math.tan(r(th));
    // corte del plano con la superficie: f(x) = zb + (x − xT)·t − zs(x) cambia de signo (bisección)
    const f = (x: number) => zb + (x - xT) * t - superficie(x);
    let a = xT, b = xMax; if (f(b) < 0) continue;
    for (let k = 0; k < 60; k++) { const m = (a + b) / 2; if (f(m) < 0) a = m; else b = m; }
    const xB = (a + b) / 2, zB = zb + (xB - xT) * t;
    // área de la cuña: polígono A → B → superficie de vuelta a xT → (xT, zs(xT))
    const P: [number, number][] = [[xT, zb], [xB, zB]]; const n = 200;
    for (let i = 1; i < n; i++) { const x = xB + (xT - xB) * (i / n); P.push([x, superficie(x)]); }
    P.push([xT, zsT]);
    let A2 = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; A2 += p[0] * q[1] - q[0] * p[1]; }
    const W = (gamma * Math.abs(A2)) / 2, L = Math.hypot(xB - xT, zB - zb), ct = Math.cos(r(th)), st = Math.sin(r(th)), C = c * L;
    // E·(cd, sd) + N·(−st + tf·ct, ct + tf·st) + C·(ct, st) + (0, −W) = 0
    const a11 = cd, a12 = -st + tf * ct, a21 = sd, a22 = ct + tf * st, b1 = -C * ct, b2 = W - C * st;
    const det = a11 * a22 - a12 * a21; if (Math.abs(det) < 1e-12) continue;
    const E = (b1 * a22 - a12 * b2) / det;
    if (E > best.E) best = { E, theta: th, W, L, xB, zB };
  }
  return best;
}
