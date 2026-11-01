# Validación de Hekatan Geotechnic — matriz de validez (2-nov-2026)

Pregunta de Jorge: «¿cómo le doy VALIDEZ a esto?». Respuesta corta: **con números que cualquiera pueda reproducir**,
contra **tres tipos de juez** (un programa comercial con el MISMO modelo, un benchmark publicado y la teoría), y
diciendo **sin adornos** qué no está validado. Este documento es eso. Todo comando se corre desde `hekatan-geotechnic/`.

Leyenda: 🟢 verificado (dentro del criterio de §4) · 🟡 parcial / diferencia explicada / criterio no aplicable · 🔴 no cumple o no probado.

---

## 1. Qué está verificado HOY y contra qué juez

| # | qué | juez | resultado | comando | estado |
|---|---|---|---|---|---|
| 1 | Demo04 (talud, DP, 3 etapas, malla de GEO5) | GEO5 2024 (log de iteraciones) | **142/142 iteraciones a 0.0e+00**; FS 1.6935 / 1.4810 / 1.6935 = GEO5 | `npm test` (tests/demo04.ts) + `cmp_iterlogs_key.py matlab_exact_3et.log tests/out/demo04_ts.log` | 🟢 |
| 2 | Muro de Manabí (MC + rigid body, SRM modo GEO5 115) | solver REAL de GEO5 (FRGeoFEM.exe sin GUI, `geo5_solver.py`) | **FS 1.362360 = GEO5**, escalera iteración a iteración (η, \|gi\|) salvo el último peldaño fallido | `npx tsx tests/x87/t13/correr13.ts wasm 115` + `python tests/x87/t13/cmp13.py` | 🟡 (ver nota) |
| 3 | Columna elástica por gravedad | GEO5 [solver real] + OpenSees + exacta | uy = −0.03342857 m, dif −1.4e-9 (redondeo de GEO5) | `tests/validar_opensees/README.md` caso 1 | 🟢 |
| 4 | Punto de Gauss Drucker-Prager (39 pasos) | funciones nativas de GEO5 + OpenSees | Geotechnic = GEO5 a 0.0000 kPa en las 5 fases | `python tests/validar_opensees/comparar_punto_dp.py` | 🟢 |
| 5 | Un T6 con c bajo (¿converge?) | GEO5 [solver real] | mismo umbral: c ≤ 1 no converge en los dos; elástico igual a 4 cifras | `python tests/validar_opensees/exp_b_geo5.py 0 0.1,1,5,20` | 🟢 |
| 6 | Dinámico lineal, columna (48 T6) | Abaqus/Standard 2017 CPE6, misma malla | masa, 3 frecuencias, u_x(t): \|dif\| < 5e-5 (4 decimales) | `npx tsx tests/dinamico_columna.ts` | 🟢 |
| 7 | Dinámico lineal, muro (3365 T6, APO1) | Abaqus/Standard 2017 | masa, frecuencias, u(t) 2201 instantes, empuje: 4 decimales | `npx tsx tests/dinamico_muro.ts` (≈ 3 min) | 🟢 |
| 8 | Sismo seudoestático, CARGA (muro, elástico) | Abaqus *DLOAD BX = kh·γ | \|u − u_Abaqus\| < 5e-5 mm en todos los nudos | `npx tsx tests/sismo_muro.ts` | 🟢 |
| 9 | Etapas TS = WASM | los dos motores entre sí | iguales | `npx tsx tests/etapas_ts_wasm.ts` | 🟢 (verificación de código) |
| 10 | Talud 30°, φ 28 c 7, con/sin freático (malla propia) | GEO5 [leído en la interfaz] | 1.9299 vs 1.98 (−2.5 %); con GWT 1.7149 vs 1.76 (−2.6 %); cociente 0.8886 vs 0.8889 | `npx tsx tests/run_gwt.ts examples/talud_gwt.hgeo ts` | 🟡 (malla distinta) |
| 11 | Talud con agua | OpenSees SSPquad | 1.50–1.53 vs GEO5 1.98 (−24 %): diferencia de ELEMENTO y de definición del FS, no del material | `python tests/validar_opensees/os_talud.py sin 0.5 36` | 🟡 (solo el efecto del agua, −11 %, coincide) |

Nota del muro (#2): el FS de GEO5 en ese muro **depende de un empate de redondeo** (σ1 = σ2 a 1e-16 en el el. 519 PG 4);
sin el desempate «σz delante» la escalera sigue hasta FS 2.1149. Coincidimos con GEO5, pero el caso es **frágil**: no sirve
como prueba de que el FS del muro sea físicamente 1.36 (registros/2026-11-01_geo5_mapas_vs_geotechnic.md, Tandas 12-14).

## 2. Qué NO está validado (sin adornos)

- **Los tipos de talud contra GEO5**: solo dos geometrías (simple y berma, un suelo DP) con el solver real (§5.2, 🟢). Los
  demás tipos (dos_pendientes, curvo, terraplen, cuneta y los nuevos angulo/tramos/puntos que otro agente está escribiendo
  ahora mismo en `src/model/taludes.ts`, sin commit) **nada**. Son geometría (la física es la misma), pero no hay número.
- **FS < 1** (resuelto 2-nov): como GEO5, si SRF 1 no converge la resistencia se aumenta ×1/0.9 por intento hasta el primero que
  converge. ACADS EX1(a) con la malla de GEO5: **0.6561 = GEO5 0.656100** (TS y WASM, mismos 4 intentos). La app dice «FS < 1: inestable (0.6561)». 🟢
- **Mohr-Coulomb con φ = 0 (no drenado)**: slope64 Ex3 −28 %; homogéneo cu 50: 1.04 (MC) contra 1.58 (DP). **GEO5 tampoco lo
  resuelve**: con la misma malla aborta en `R_mob_MohrCoulomb()` (§5.2). **FUERA DE ALCANCE** (de los dos); la app avisa si φ < 1°. 🔴
- **Mohr-Coulomb y la malla**: con la malla estructurada del generador (columnas, T6 alargados en la cara) slope64 Ex1 da
  1.1111 en GEO5 **y** en Geotechnic (iguales), y 1.5242 con la malla propia (publicado 1.56). El FS de la escalera de GEO5 con MC
  depende mucho de la malla: GEO5 declara «diverging» en 3 iteraciones cuando |gi| crece (η = 0.1). 🟡
- **Taludes de varias capas**: ACADS EX1(b) −24.5 % (FS 1.0256 contra 1.359); slope64 Ex2 −6.6 %. **El solver no es la causa**: con la
  MISMA malla GEO5 real y Geotechnic dan lo mismo (EX1(b) 0.9000 = 0.900000, iteración a iteración; Ex2 0.8100 = 0.810000, §5.2). La causa es
  del MÉTODO (escalera de GEO5 + MC con ψ = 0, no asociado) y de la MALLA (§5.4): con ψ = φ (flujo asociado, lo que supone FELA) EX1(b)
  sube de 1.0256 a 1.2148. 🟡 (= GEO5; lejos del publicado)
- **Sismo seudoestático en taludes** (FS con kh): slope64 Ex7 y ACADS EX1(c): SRF 1 no converge; publicados 1.41 y 1.039. **GEO5 hace
  lo mismo** con la misma malla y su `pseudo_earthquake` (§5.2): hacia el pie GEO5 0.3487 y Geotechnic 0.4305 (los dos FS < 1); hacia la
  corona GEO5 1.139601 = Geotechnic 1.1396. No es la carga (ni «por etapas»: GEO5 la aplica de golpe y coincide). Es la SRM de GEO5 con kh
  en todo el dominio. La app avisa. 🔴 (= GEO5; lejos del publicado)
- **Agua / presión de poros**: solo el talud de #10 (GEO5 leído en la interfaz, malla distinta). slope64 Ex4-Ex6 (freático,
  sumergido, desembalse: 1.27 / 1.83 / 1.03) **sin correr**; Ru y poros sin benchmark.
- **Interfaces / contactos suelo-estructura**: no existen (GEO5 *Contacts*): el muro va pegado.
- **Geometría 3D**: no existe. Todo es deformación plana.
- **Anclajes, geomallas, sobrecargas en SRM**: solo dentro de Demo04 (#1); sin benchmark publicado.
- **No lineal dinámico**: no validado (solo lineal, #6-#7).
- **Sensibilidad a la malla**: sin estudio. Indicio medido: cambiar la polilínea del terreno de `talud tipo=simple` a `interfaz`
  (misma geometría, ±30 nudos) movió el FS un peldaño en 4 de 8 benchmarks (1.3329 → 1.3497; 1.1508 → 1.1396; 1.0526 → 1.0256; 1.4622 → 1.4439).
- **Dos definiciones de FS**: GEO5/Geotechnic = último SRF que converge con la escalera 0.9 y 3 relajaciones (máx. 100 it,
  tol 1 %, divergencia si |gi| crece); slope64 = no convergencia en 500–2000 it. Resolución de la escalera ≈ 1.3 % (paso final 0.9875).

## 3. Estrategia por niveles

### Nivel 1 — Verificación de código (¿el programa resuelve bien SUS ecuaciones?)
| prueba | hay | falta |
|---|---|---|
| tests unitarios del material (DP, MC) punto a punto | DP = GEO5 a 0.0000 kPa (#4) | MC punto a punto contra el retorno de GEO5 (FRGEOFEM_MC_DECOMPILADO.md) **incluido φ = 0** |
| patch test (T6, tensión constante exacta) | — | malla irregular, carga lineal → σ constante a 1e-10 |
| solución exacta elástica | columna (#3) | Flamant / Boussinesq en deformación plana, pared lisa |
| convergencia de malla del FS | — | slope64 Ex1 con malla 1.6 / 0.8 / 0.4 / 0.2: FS debe estabilizarse (Richardson) |
| TS = WASM | #9 | extender a todos los casos de §5 |
| CI: `npm test` en cada commit | local | GitHub Actions público |

### Nivel 2 — Benchmarks publicados (¿resuelve bien la FÍSICA?)
Fuentes **abiertas y leídas** (citas literales en §6):
| benchmark | datos | FS publicado |
|---|---|---|
| Griffiths & Lane 1999, ej. 1 (vía Rocscience/Phase2) | homogéneo sin cimentación, 2H : H, corona 1.2H; E 1e5, ν 0.3, γ 20, φ 20, c 10 | Griffiths FE **1.4**, Bishop 1.38 |
| slope64 Ex1 (Griffiths, manual) | w1 12, s1 20, w2 12, h1 10, h2 10; φ 30, c 5, ψ 0, γ 20 | **1.56** |
| slope64 Ex2 | talud de 1 m, capa débil φ 15 c 0.5 bajo el pie | **1.22** |
| slope64 Ex3 | no drenado, cu 50 / 73.1 | **2.00** |
| slope64 Ex7 | φ 30, c 20, kh 0.25 | **1.41** |
| ACADS EX1(a) (Giam & Donald 1989) | (20,20)…(30,25)-(50,35)…(70,35); c 3, φ 19.6, γ 20 | **1.000** (FELA exacto 0.981 ± 0.003) |
| ACADS EX1(b) | 3 suelos (fig. de OptumG2) | FELA **1.359 ± 0.006**; Spencer 1.375 |
| ACADS EX1(c) | EX1(b) + 0.15 g | FELA **1.039 ± 0.004** |
| slope64 Ex4-Ex6 (freático, sumergido, desembalse) | en los .dat | 1.27 · 1.83 · 1.03 — **no corridos** |

**No encontrados en página abierta** (no se citan números): el PDF de Griffiths & Lane 1999 (mines.edu da 404), Dawson-Roth-Drescher 1999
(solo un OCR parcial en Scribd, no leído), Zienkiewicz-Humpheson-Lewis 1975, Cheng-Yip, Matsui-San, taludes de Fredlund/Krahn.
Para usarlos hay que conseguir el artículo (biblioteca) y copiar los datos con su página.

### Nivel 3 — Contra programas comerciales con el MISMO modelo
| juez | estado |
|---|---|
| **GEO5 FEM** (solver real sin GUI, `geo5_solver.py`) | Demo04 y muro 🟢; simple y berma = GEO5 a 4 decimales (§5.2) 🟢; falta varias capas, agua, kh |
| **GEO5 Slope Stability** (Bishop/Spencer, equilibrio límite) | `tools/geo5_talud.py` (GUI) existe; falta tabla FEM-vs-LEM por tipo de talud |
| **Abaqus/Standard** | lineal y dinámico 🟢; SRM por *FIELD con la malla de GEO5 (§5.2b): DP +2-3 % 🟡, MC no concluyente 🔴 |
| **OpenSees** | 2.º validador parcial (sin T6 ni MC de hexágono) |
| **PLAXIS** | sin datos (instalador en estudio, `project_plaxis_re_desde_instalador`) |
| **Bishop/Spencer de Hekatan LISP** | hojas GEO5 112-139: falta cruzarlas con el FEM de cada tipo |

### Nivel 4 — Publicación
1. **Informe de verificación reproducible**: este documento + `tests/validacion/` + `npm run validar` (un comando, tabla verde/roja).
2. **Versión etiquetada** (`v0.2.0-validacion`) con **DOI de Zenodo** (GitHub → Zenodo: cada release queda citada y congelada).
3. **Código abierto de los tests** (MIT, ya lo es el repo) y los InputFile de GEO5 usados (texto; los .bin de GEO5 NO se redistribuyen).
4. **Artículo** corto (p. ej. «Hekatan Geotechnic: a browser SRM solver verified iteration-by-iteration against GEO5»): Demo04 142/142, muro, benchmarks, y las limitaciones de §2.

## 4. Criterios de aceptación

| magnitud | criterio |
|---|---|
| lineal (desplazamientos, tensiones, frecuencias), misma malla | 4 decimales: \|dif\| < 5e-5 en las unidades de la tabla |
| FS contra GEO5, MISMA malla y mismos parámetros del solver | ±0.5 % (idealmente el mismo peldaño de la escalera) |
| FS contra GEO5, malla propia de Geotechnic | **±2 %** |
| FS contra benchmark publicado (FE, LEM o FELA) | **±3 %** (±5 % si la referencia es LEM/Bishop) |
| FS < 1 / SRF 1 no converge | se informa «no converge en SRF 1», nunca «FS = 1.0000» |

**Advertencias que debe llevar el sitio** (pie de la app y del informe):
> Hekatan Geotechnic es una herramienta de cálculo; **no sustituye el criterio del ingeniero** ni el estudio geotécnico.
> Alcance verificado: deformación plana, Drucker-Prager y Mohr-Coulomb (φ > 0), SRM por c-φ, cargas de peso propio,
> lineal y dinámico lineal. **No verificado**: φ = 0 (no drenado), varias capas con contraste fuerte, FS con sismo
> seudoestático, agua salvo freático simple, interfaces, 3D. Un FS informado como 1.0000 puede significar que el cálculo
> no convergió. Revise la malla (refinar debe cambiar el FS < 2 %) y compare con equilibrio límite.

## 5. Ejecutado ahora (2-nov-2026)

### 5.1 Benchmarks publicados en Geotechnic
`npx tsx tests/validacion/correr_benchmarks.ts` (≈ 3.5 min) → `tests/validacion/benchmarks_resultado.json`. Casos en
`tests/validacion/casos/*.hgeo`: terreno como `interfaz` explícita (= la polilínea de `talud tipo=simple`; se dejó de usar `tipo=` porque
ese sistema lo está cambiando otro agente), capas con `linea` (una `interfaz` que pisa el terreno rompe la malla: ángulo NaN, FS 1.0 falso,
medido), MC, ψ = 0, motor WASM, malla 0.6–1.0 (0.08 en Ex2). FS = último SRF que converge; [ ] = primer SRF que diverge.
slope64 usa Q8 de integración reducida y otro criterio de FS; la geometría está espejada (pie a la izquierda).

| caso | publicado (fuente §6) | Geotechnic FS [primer SRF que diverge] | dif. | malla | estado |
|---|---|---|---|---|---|
| G&L 1999 ej. 1 (φ 20, c 10; H = 10 m **supuesto**) | 1.4 (Bishop 1.38) | 1.3497 [1.3668] | −3.6 % (−2.2 % vs Bishop) | 3196 nudos, 1533 T6 | 🟡 |
| slope64 Ex1 (φ 30, c 5) | 1.56 | 1.5242 [1.5435] | −2.3 % | 5338 / 2593 | 🟢 |
| slope64 Ex2 (capa débil, 2 suelos) | 1.22 | 1.1396 [1.1540] | −6.6 % | 5500 / 2673 | 🔴 |
| slope64 Ex3 (no drenado φ 0) | 2.00 | 1.4439 [1.4622] | −27.8 % | 4660 / 2253 | 🔴 |
| slope64 Ex7 (kh 0.25) | 1.41 | SRF 1 no converge (73 it); hacia abajo tampoco hasta 0.9^20 → «< 1 ✖ falla» | — | 6129 / 2968 | 🔴 |
| ACADS EX1(a) (c 3, φ 19.6) | 1.000 (FELA 0.981 ± 0.003) | SRF 1 no converge (166 it) → **0.7290** [0.81] (rama FS < 1) | −25.7 % | 4415 / 2130 | 🔴 |
| ACADS EX1(b) (3 suelos) | 1.359 (Spencer 1.375) | 1.0256 [1.0386] | −24.5 % | 4581 / 2208 | 🔴 |
| ACADS EX1(c) (EX1(b) + 0.15 g) | 1.039 | SRF 1 no converge (10 it); hacia abajo tampoco → «< 1 ✖ falla» | — | 4581 / 2208 | 🔴 |

Comparación de control (no es benchmark, misma geometría): con **Drucker-Prager** en vez de MC, slope64 Ex1 da 1.6044 (+2.8 %) y
Ex3 2.1715 (+8.6 %); homogéneo cu 50 (geometría de Ex3): DP 1.5830, MC 1.0386 (TS = WASM).

### 5.2 GEO5 (solver real) contra Geotechnic, tipos simple y berma
`python tests/validacion/geo5_vs_geotechnic.py simple berma` (y `… tests/validacion/casos/g1_slope64_ex1.hgeo --nx 60 --nz 20`) →
`tests/validacion/geo5_vs_geotechnic.json`; salidas de Geotechnic en `tests/validacion/geo5/<caso>/` (los ficheros de GEO5 se regeneran, no se suben).

Malla común = estructurada de T6 (columnas fondo→terreno) del generador `tools/hgeo_a_geofem_input.py`, completado aquí con lo que
el solver 2024 exige y el generador no escribía (`debug_section`, **caras `faces=[…]` + `FL3`**, `RZ`; sin eso FRGeoFEM.exe muere con
0xC0000005, medido). Un suelo. FS de GEO5 leído de su `OutputFile.txt`.

| caso | material | malla común | GEO5 2024 (solver real) | Geotechnic misma malla | dif. | Geotechnic malla propia | dif. | estado |
|---|---|---|---|---|---|---|---|---|
| **simple** (H 6.5, β 33°, φ 28, c 12) | DP | 3003 nudos, 1440 T6 | **2.117217** | **2.1172** | 0.0000 | 2.1715 (847 T6) | +2.6 % | 🟢 / 🟡 |
| **berma** (3 caras de 3 m a 33°, 2 bermas de 3 m) | DP | 3003 / 1440 | **2.445323** | **2.4453** | 0.0000 | 2.4453 (876 T6) | 0.0 % | 🟢 |
| slope64 Ex1 | MC | 4961 / 2400 | 1.111111 | 1.1111 | 0.0000 | 1.5242 | (malla) | 🟢 solver / 🟡 malla |
| ACADS EX1(a) | MC | 4961 / 2400 | **0.656100** («LESS THAN 1», Error 7) | **0.6561** (rama FS < 1, 2-nov) | 0.0000 | 0.7290 | — | 🟢 solver / 🔴 publicado |
| **ACADS EX1(b), 3 suelos** | MC | 4961 / 2400 | **0.900000** («LESS THAN 1») | **0.9000**; peldaño 0.9 iteración a iteración igual (η, \|gi\|, 10 it) | 0.0000 | 1.0256 | — | 🟢 solver / 🔴 publicado |
| **slope64 Ex2, 2 suelos** | MC | 4961 / 2400 | **0.810000** | **0.8100** | 0.0000 | 1.1396 | — | 🟢 solver / 🟡 publicado |
| slope64 Ex7, fuerza kh·γ hacia la corona (+x) | MC | 4961 / 2400 | **1.139601** | **1.1396** | 0.0000 | — | — | 🟢 solver |
| slope64 Ex7, kh 0.25 hacia el pie (−x) | MC | 4961 / 2400 | 0.3487 (SRF 1 no converge) | 0.4305 (SRF 1 no converge) | otro peldaño de la búsqueda hacia abajo | 0.5314 (h 1.6) | — | 🟡 solver / 🔴 publicado |
| homogéneo cu 50 (geometría Ex3) | MC φ 0 | 4961 / 2400 | **aborta**: `Error in function R_mob_MohrCoulomb(). Element #1` | «1.0» | — | 1.0386 | — | 🔴 (los dos) |

Los dos tipos de talud pedidos (simple y berma) dan **el mismo FS que el solver real de GEO5 a 4 decimales con la misma malla**.
Con la malla propia, simple +2.6 % (fuera de ±2 %) y berma 0.0 %.

**Varios suelos** (2-nov): el generador asigna a cada T6 el suelo que Geotechnic pone en su centroide (`material_en_puntos.ts`) y escribe
`material_types` / `materials` / `gravity` por suelo con la sintaxis de un InputFile real de dos suelos. **Sismo**: la línea que escribe la GUI
(GeoFEM_5.dll 2024) `pseudo_earthquake rho=%s kh=%s kv=%s elements=[…]`; medido que la fuerza en x es rho·kh (rho = −γ como en `gravity`,
kh = −0.25 → empuja a +x: por eso la fila «hacia la corona»). Comandos:
`python tests/validacion/geo5_vs_geotechnic.py tests/validacion/casos/a2_acads_1b.hgeo --nx 60 --nz 20 --sin-propia` (ídem g2; g4 con `KH_RHO=` / `KH_RHO=-`).

### 5.2b Tercer juez: Abaqus/Standard 2017 con la MISMA malla (GEO5 | Geotechnic | Abaqus)
`python tests/validacion_abaqus/abaqus_srm.py simple berma g1_slope64_ex1` y `… a1_acads_1a --s0 0.5 --s1 2` →
`tests/validacion_abaqus/resultados/<caso>.json`, `<caso>_mecanismo.png` (|Δu| de la SRM + |u| cresta vs SRF), `tabla.md`.
Lee los nudos/T6/apoyos/peso/material del `Input.txt` de GEO5 (§5.2): CPE6 (el T6 de GEO5 ya va en el orden del CPE6, área > 0).
DP «extensión» de GEO5 → DP lineal de Abaqus K = 1, tanβ = 3√3·α, d = √3·k, dilatación 0. MC → `*MOHR COULOMB` (Abaqus **no
admite ψ = 0: lo sube a 0.1°**). SRF = variable de campo 1 (tanφ/SRF, c/SRF tabulados cada 0.005): paso GRAVEDAD a SRF s0 y paso
SRM en rampa s0 → 3 (ΔSRF ≤ 0.005, mínimo 2e-4). **FS Abaqus = último SRF convergido.**

| caso | material | malla común | GEO5 | Geotechnic | Abaqus | Abaqus − GEO5 | juicio |
|---|---|---|---|---|---|---|---|
| simple | DP | 3003 nudos, 1440 T6 | 2.1172 | 2.1172 | **2.1864** | +3.27 % | 🟡 |
| berma | DP | 3003 / 1440 | 2.4453 | 2.4453 | **2.4949** | +2.03 % | 🟡 |
| slope64 Ex1 (publ. 1.56) | MC | 4961 / 2400 | 1.1111 | 1.1111 | 1.5518 * | +39.7 % | 🔴 * |
| ACADS EX1(a) (publ. 1.000) | MC | 4961 / 2400 | 0.6561 | «1.0» | 0.7766 * | +18.4 % | 🔴 * |

- **DP (simple, berma): mismo mecanismo**, Abaqus 2-3 % por encima. No es el material (eco del .dat = cuenta a mano). Es el
  **criterio de falla**: GEO5 salta de 2.1172 a 2.1440 en un peldaño y declara «diverging»; Abaqus en 2.1440 sí converge
  (cresta 68 mm) y se rompe en 2.14-2.19 (cresta 68 → 517 → 1980 mm). Berma igual: GEO5 falla el peldaño 2.4763, Abaqus llega a 2.4949.
  El FS de la escalera de GEO5 queda por DEBAJO del de una rampa fina: ≈ el paso final (1.25 %) + la detección por |gi| creciente.
- **\* MC (slope64, ACADS): NO CONCLUYENTE.** Abaqus para por «solution appears to be diverging» con autovalores negativos y
  Δu de solo 8 mm / 1.5 mm: no hay mecanismo desarrollado (la curva de la cresta no se dispara). La banda sigue las columnas y
  diagonales de la malla estructurada (PNG). Que slope64 dé 1.5518 ≈ 1.56 publicado es coincidencia hasta probar lo contrario.
  Abaqus y GEO5 se paran ANTES de tiempo con MC en esta malla: indicio de que el problema es la **malla estructurada + MC
  no asociado**, no Geotechnic (que calca a GEO5). ⏳ Repetir con incremento mínimo 1e-7 (se cortó: disco lleno) y con malla no estructurada.

### 5.3 Resumen verde / amarillo / rojo

| área | juez | estado |
|---|---|---|
| Solver SRM (DP), misma malla que GEO5: Demo04, simple, berma | GEO5 real | 🟢 |
| Solver SRM (MC), misma malla: slope64 Ex1 | GEO5 real | 🟢 |
| Muro de Manabí FS 1.362360 | GEO5 real | 🟡 (depende de un empate de redondeo) |
| Lineal, dinámico lineal, carga sísmica | Abaqus, 4 decimales | 🟢 |
| SRM DP (simple, berma), misma malla, 3.er juez | Abaqus *FIELD | 🟡 (+3.3 %, +2.0 %: criterio de falla) |
| SRM MC (slope64 Ex1, ACADS EX1(a)), misma malla | Abaqus *FIELD | 🔴 no concluyente (para sin mecanismo) |
| Material DP punto a punto | GEO5 nativo / OpenSees | 🟢 |
| FS con malla propia, un suelo φ > 0 | GEO5 / slope64 / G&L | 🟡 (−3.6 … +2.6 %) |
| FS < 1 (búsqueda hacia abajo) | GEO5 real, ACADS EX1(a) 0.6561 | 🟢 (2-nov) |
| Varias capas: el SOLVER | GEO5 real misma malla: EX1(b) 0.9 = 0.9, Ex2 0.81 = 0.81 | 🟢 |
| Varias capas: contra el PUBLICADO | slope64 Ex2, ACADS EX1(b) | 🔴 (−6.6 %, −24.5 %; GEO5 igual o peor: es el método + malla, §5.4) |
| φ = 0 no drenado | slope64 Ex3; GEO5 aborta | 🔴 fuera de alcance (aviso en la app) |
| SRM con sismo kh: el SOLVER | GEO5 real misma malla (Ex7): +x 1.1396 = 1.1396; −x los dos < 1 | 🟡 |
| SRM con sismo kh: contra el PUBLICADO | slope64 Ex7, ACADS EX1(c) | 🔴 (criterio de 100 it de GEO5, §5.4; aviso en la app) |
| Agua en SRM | GEO5 (interfaz, 1 caso) | 🟡 / sin benchmark |
| Tipos dos_pendientes, curvo, terraplen, cuneta (y los nuevos) | — | 🔴 sin probar |
| Interfaces, 3D, no lineal dinámico | — | 🔴 no existen / sin probar |

**Hecho el 2-nov**: (1) rama FS < 1; (2) GEO5 de varias capas → el −24 % es del algoritmo (GEO5 da lo mismo); (3) sismo: GEO5 da lo
mismo, no hace falta «por pasos»; (4) estudio de malla (§5.4). **Siguiente**: ψ y criterio de iteraciones como OPCIÓN visible («modo GEO5» /
«modo convergido»), y un estudio de malla automático en la app (FS con h y h/2).

### 5.4 Efecto de la malla y del método (2-nov-2026)

`npx tsx tests/validacion/estudio_malla.ts tests/validacion/casos/a1_acads_1a.hgeo 1.6,0.8,0.4 tests/validacion/casos/a2_acads_1b.hgeo 1.6,0.8,0.4`
→ `tests/validacion/estudio_malla.json` (malla propia uniforme, WASM, MC ψ = 0, escalera de GEO5).

| caso (exacto FELA) | h = 1.6 m | h = 0.8 m | h = 0.4 m | ψ = φ (asociado) h 1.6 / 0.8 / 0.4 |
|---|---|---|---|---|
| ACADS EX1(a) (0.981; OptumG2 1.000) | 1.0000 (546 T6) | 0.7290 (2130) | 0.8100 (8577) | 1.0127 / 0.9000 / — |
| ACADS EX1(b) (1.359) | 1.1996 (609) | 1.0256 (2208) | 0.6561 (8604) | 1.2303 / 1.2148 / 1.1996 |

Lo medido:
1. **No hay convergencia de malla**: al afinar, el FS de la escalera de GEO5 con MC y ψ = 0 BAJA (EX1(b) 1.20 → 1.03 → 0.66) en vez de
   estabilizarse. Al afinar, la banda de corte se localiza y el criterio de GEO5 (máx. 100 iteraciones; «diverge» si |gi| crece 2 veces
   seguidas) corta antes. GEO5 con su solver real hace lo mismo con la misma malla (§5.2), así que **es el método, no Geotechnic**.
2. **ψ = 0 (no asociado) explica gran parte**: con ψ = φ (la hipótesis de FELA/límite) EX1(b) pasa de 1.0256 a 1.2148 (h 0.8) y la
   dependencia de la malla casi desaparece (1.2303 / 1.2148 / 1.1996, −12 % del exacto: el resto es el criterio de la escalera).
3. **El criterio de iteraciones explica el sismo**: slope64 Ex7 (kh 0.25, h 1.6) con 500 iteraciones y sin corte por divergencia (copia
   del solver, no publicada) SRF 1 converge en 352 it y FS = 1.2090 (publicado 1.41); con el criterio de GEO5, SRF 1 no converge (0.5314).
   En EX1(b) h 1.6 relajar el criterio no cambia nada (1.1996 = 1.1996).

**Criterio de aceptación honesto** (sustituye al ±3 % para estos casos): el FS de la escalera de GEO5 con MC no asociado solo vale si
(a) un refinamiento h → h/2 lo cambia < 2 % (un peldaño de la escalera ≈ 1.3 %) y (b) con ψ = φ no sube más de un 5 %. Si no se cumple
(EX1(a), EX1(b), Ex7 con kh), el FS es una cota inferior dependiente de la malla y hay que compararlo con equilibrio límite.
Con un suelo y c > 0 (slope64 Ex1, G&L) el FS queda a −2.3 % / −3.6 % del publicado, pero su estudio h → h/2 no está hecho aún.

## 6. Fuentes (abiertas y leídas)

- slope64 (D.V. Griffiths, Colorado School of Mines): manual `http://dvgriffiths.mines.edu/slope64/slope64_user_manual.pdf` y datos `ex1.dat … ex7.dat`.
  Citas: «Example 1: A homogeneous slope» … «30.0 5.0 0.0 20.0 1.e5 0.3» … «Estimated Factor of Safety = 1.56»;
  Ex2 «Estimated Factor of Safety = 1.22»; Ex3 «A two-layer undrained clay slope» «Estimated Factor of Safety = 2.00»;
  Ex7 «subjected to a horizontal acceleration factor of 0.25g» «Estimated Factor of Safety = 1.41».
- OptumG2, *Verification of slope stability* (sept. 2019), `https://optumce.com/Download/Verifications/g2/G2_Slope_Stability_Verification.pdf`:
  «c (kN/m2) φ (°) γ (kN/m3) 3.0 19.6 20.0» · «Reference (Giam & Donald) 1.000» · «Exact 0.981 ± 0.003»; EX1(b) «Exact 1.359 ± 0.006»,
  «LE (Spencer) 1.375»; EX1(c) «horizontal seismically induced acceleration of 0.15g» «Exact 1.039 ± 0.004». Geometría leída de sus figuras 1 y 3.
- Rocscience/Phase2, *Application of the Finite Element Method to Slope Stability*, `http://dvgriffiths.mines.edu/Proprietary_Codes/Rocscience.pdf`:
  «The benchmark example considers a homogenous slope without foundation» · «100000 0.3 20 20 10» (E ν γ φ c) · Tabla 2 «Bishop Griffiths … 1.38 1.4».
- **Discrepancia de datos en ACADS EX1(b)/(c)**: la tabla 3 de OptumG2 da Soil #3 = c 3.0, φ 19.6, γ 20 (igual que la tabla 1); numgeo (y Slide)
  dan c 7.2, φ 20, γ 19.5. Medido en Geotechnic (h 0.8): 1.0256 con la de OptumG2, 1.0653 con la de numgeo: no explica el −24 %.
- numgeo, ACADS 1 (1989) `https://j-machacek.github.io/numgeo/2026-09/benchmark/strength-reduction/acads-1-1989.html` (EX1(b): RS2 1.34, Spencer 1.375; consultado, no usado).
