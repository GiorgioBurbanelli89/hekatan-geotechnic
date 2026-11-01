# Validación con OpenSees de Hekatan Geotechnic (1-nov-2026)
GEO5 es el juez; OpenSees (openseespy 3.7.1) es el SEGUNDO validador. Resultado: `TABLA_TRES_COLUMNAS.md`.
Correr (desde `hekatan-geotechnic/`):
| caso | Geotechnic | OpenSees | GEO5 |
|---|---|---|---|
| 1 columna elástica | `npx tsx tests/validar_opensees/ts_columna.ts …/ts_columna.json` | `python os_columna.py os_columna.json` | `python mk_columna_geo5.py` (solver real, sin ventana) |
| 2 punto de Gauss DP | `npx tsx …/ts_punto_dp.ts trayectoria_dp.json ts_dp.json` | `python os_punto_dp.py trayectoria_dp.json os_dp.json` | `python geo5_punto_dp.py …` (réplica de las funciones nativas) |
| 3 talud SRM | `npx tsx tests/run_gwt.ts examples/talud_gwt.hgeo ts` | `python os_talud.py sin 0.5 36` (OS_TOL, OS_ITER) | FS leído por la interfaz (registros 15-oct) |
| 5 un T6, c bajo | `npx tsx …/ts_1elem.ts 0 0,0.1,1,5,20` | — | `python exp_b_geo5.py 0 0.1,1,5,20` |
| (a) dinámico a=0 | — | — | `python exp_a0_geo5.py 1.40 orig,a0,a0_ff` |
Tabla final: `python comparar_punto_dp.py`, `python comparar_columna.py`, `python tabla_tres_columnas.py`.
Equivalencia del material: `rho = sqrt(2)*alpha`, `sigmaY = sqrt(3)*k`, `rho_bar = 0` (ver `os_punto_dp.py`).
