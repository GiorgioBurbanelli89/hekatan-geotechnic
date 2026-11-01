# Validación de Hekatan Geotechnic · GEO5 (juez) · Geotechnic · OpenSees — 1-nov-2026

Origen del dato de GEO5:  [INT] leído por la INTERFAZ gráfica (sesiones anteriores);  [SOL] el SOLVER REAL de GEO5 (FRGeoFEM_2024.exe) sin ventana, mismo ejecutable que usa la interfaz;
[NAT] las funciones NATIVAS del ejecutable ejecutadas (réplica validada a 1e-13).  Diferencias = valor − GEO5.

## Caso 1 · columna elástica por gravedad (2×10 m, E 20000, ν 0.3, γ 18; deformación plana)

| motor | elemento | uy cima (m) | dif. con GEO5 (m) |
|---|---|---|---|
| **GEO5 [SOL]** | T6 (40 elem) | -0.03342857 | — |
| Geotechnic | T6 (40 elem) | -0.03342857 | -1.43e-09 |
| OpenSees | quad (20/40 elem) | -0.03342857 | -1.43e-09 |
| OpenSees | bbarQuad (20/40 elem) | -0.03342857 | -1.43e-09 |
| OpenSees | SSPquad (20/40 elem) | -0.03342857 | -1.43e-09 |
| OpenSees | tri31 (20/40 elem) | -0.03342857 | -1.43e-09 |
| exacto | — | -0.03342857 | -1.43e-09 |

(El −1.4e-9 de todas las filas es el redondeo a 8 cifras que imprime GEO5: todos coinciden con la solución exacta −0.0334285714 m.)

## Caso 2 · un punto de Gauss, Drucker-Prager «extension» (39 pasos; kPa)

| fase | GEO5 [NAT] | Geotechnic: máx. dif. | OpenSees: máx. dif. |
|---|---|---|---|
| A confinamiento | referencia | 0.0000 | 0.0000 |
| B corte (cono) | referencia | 0.0000 | 0.0000 |
| C corte inverso | referencia | 0.0000 | 0.0000 |
| D expansión al ápice | referencia | 0.0000 | 33.5509 |
| E recompresión | referencia | 0.0000 | 72.5642 |

OpenSees = GEO5 a ≤ 3e-6 kPa mientras el estado está en el cono; **se separa al llegar al ápice / corte en tracción** (no vuelve al vértice; causa dentro de OpenSees sin diagnosticar).

## Caso 3 · talud con agua (30°, φ 28, c 7, γ 18.5, γsat 20.5, SRM por c-φ) — factor de seguridad

| | GEO5 [INT] | Geotechnic (447 T6, malla propia) | dif. | OpenSees SSPquad dx 0.5 (tol 1e-6) | dif. | OpenSees dx 0.25 (tol 1e-3) | dif. |
|---|---|---|---|---|---|---|---|
| sin agua | 1.9800 | 1.9299 | −0.0501 | 1.5330 | −0.4470 | 1.5040 | −0.4760 |
| con GWT | 1.7600 | 1.7149 | −0.0451 | 1.3750 | −0.3850 | — | — |
| cociente GWT/sin | 0.8889 | 0.8886 | −0.0003 | 0.8969 | +0.0080 | — | — |

OpenSees baja al refinar (dx 0.5 con tolerancia floja da 1.592; dx 0.25 da 1.504): su FS de malla fina es ≈ 1.50. El **efecto del agua** (−11 %) lo reproducen los tres. La diferencia absoluta con GEO5 (≈ −24 %) NO es el material (mismo cono, probado en el caso 2) sino el **elemento** (SSPquad contra T6) y la **definición del FS** (OpenSees: el paso donde Newton ya no cierra; GEO5: el escalón de la escalera 0.9 donde se agotan las relajaciones).

## Caso 4 · Demo04 (talud, DP, 3 etapas, malla de GEO5) — FS

| | etapa 1 | etapa 2 | etapa 3 |
|---|---|---|---|
| GEO5 [INT] | 1.6935 | 1.4810 | 1.6935 |
| Geotechnic (malla GEO5) | 1.6935 | 1.4810 | 1.6935 |
| dif. | 0.0000 | 0.0000 | 0.0000 |
| OpenSees | no corrido (necesita T6; no se usó un elemento distinto en la malla de GEO5) | | |

## Caso 5 · un T6 con c bajo (experimento b) — ¿converge?

| c (kPa) | GEO5 [SOL] | Geotechnic |
|---|---|---|
| 0 | NO converge (q=0, 0 mm) | NO converge |
| 0.001 | NO converge | NO converge |
| 0.01 | NO converge | NO converge |
| 0.1 | NO converge | NO converge |
| 1 | NO converge | NO converge |
| 5 | converge | converge |
| 20 | converge | converge |

Elástico (c = 20): u(nudo 3) = (−2.299281e-4, −2.263908e-4) m en GEO5 [SOL] y (−2.2993e-4, −2.2639e-4) m en Geotechnic: igual a 4 cifras.

## Caso 6 · muro de Manabí (Mohr-Coulomb) — [INT] GEO5 contra Geotechnic

| magnitud | GEO5 [INT] | Geotechnic | dif. |
|---|---|---|---|
| d_z máx (mm) | 27.1000 | 27.1241 | +0.0241 |
| coronación (mm) | 20.5000 | 20.4500 | −0.0500 |
| FS (SRM) | 1.3600 | 1.4737 (WASM; TS da 2.15) | +0.1137 |
| OpenSees | no aplica: no tiene Mohr-Coulomb de hexágono (solo cono DP) | | |

## Experimento (a) · dinámico del muro, a(t) = 0 (solver real de GEO5, 1.4 s)

| variante | máx|ux| (m) | máx|uy| (m) |
|---|---|---|
| original | 7.592e-03 | 1.246e-04 |
| a = 0 y campo libre = 0 | 0.000e+00 | 0.000e+00 |
| a = 0, campo libre original | 7.438e-03 | 5.167e-03 |
