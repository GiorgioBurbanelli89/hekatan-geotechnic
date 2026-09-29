# Construcción por etapas: GeoFEM contra Hekatan Geotechnic (29-sep-2026)

Muro de Manabí, geometría del vídeo 3, relleno en 4 capas. Etapas: 1 terreno · 2 muro y tierra de delante · 3 terreno
bajo el talón · 4-7 capas de 0.65 m. Tensiones por etapas (sin factor de seguridad).
- GeoFEM: `tools/muro_manabi_etapas_geofem.py` → `Documents/GEO5_Manabi/muro_manabi_fem_etapas.gmk` (6991 nudos).
  Números: monitores de punto leídos de pantalla → `examples/muro_manabi_etapas_geofem.json`.
- Geotechnic: `examples/muro_manabi_etapas.hgeo` + `npx tsx tools/etapas_muro_manabi.ts` (7186 nudos).

## Etapa final: las 12 variables de GeoFEM (mínimo .. máximo, convenio de GEO5)
| variable | GeoFEM | Geotechnic | |
|---|---|---|---|
| d_x [mm] | −4.5 .. 4.1 | −4.47 .. 5.05 | ✅ |
| d_z [mm] | 0.0 .. 27.1 | 0.00 .. 27.25 | ✅ 0.6 % |
| \|d\| [mm] | 0.0 .. 27.1 | 0.00 .. 27.29 | ✅ |
| σx,eff = σx,tot [kPa] | −2.11 .. 91.24 | 0.73 .. 96.14 | ✅ 5 % |
| σz,eff = σz,tot [kPa] | −1.22 .. 212.90 | 1.01 .. 211.37 | ✅ 0.7 % |
| τxz [kPa] | −1.48 .. 11.64 | −13.59 .. 1.31 | signo contrario; 11.6 frente a 13.6 |
| J [kPa] | 0.00 .. 70.24 | 0.37 .. 66.53 | ✅ 5 % |
| u_tot [kPa] | 0 .. 0 | 0 .. 0 | ✅ sin agua |
| E_d [%] | 0.00 .. 1.18 | 0.01 .. 1.20 | ✅ 1.7 % (tras corregir la fórmula: ver abajo) |
| E_d,pl [%] | 0.00 .. 0.38 | 0.00 .. 0.52 | Mohr-Coulomb (GEO5) frente a Drucker-Prager (Geotechnic) |

## Por etapa: coronación del muro y σz bajo la zapata (x = 9.8 … 11.8, z = −3.10)
| etapa | d_x GEO5 / GT [mm] | d_z GEO5 / GT [mm] | σz: diferencia de GT |
|---|---|---|---|
| muro | 2.9 / 3.40 | 5.2 / 6.52 | −2 … +24 % |
| bajo el talón | 1.7 / 2.25 | 5.9 / 7.19 | −1 … +21 % |
| capa 1 | −0.8 / −0.43 | 8.4 / 9.81 | −1 … +14 % |
| capa 2 | −2.7 / −2.64 | 10.9 / 12.57 | 0 … +8 % |
| capa 3 | −3.9 / −4.05 | 13.6 / 15.44 | 0 … +9 % |
| capa 4 | −4.5 / −4.47 | 16.4 / 18.53 | +1 … +7 % |

## Lo que se aprendió (medido)
- GEO5 escribe d_x positivo hacia la IZQUIERDA y d_z positivo en ASIENTO (ya estaba en `geo5scale.ts`).
- GEO5 pone a cero los DESPLAZAMIENTOS tras la etapa 1 pero NO las deformaciones (E_d = 0.87 % en la etapa 1).
- Desde la etapa 2 GeoFEM añade el marco «Excavation» arriba: todos los marcos bajan 30 px. Los tabs de etapa van cada
  53.2 px desde [1] = 707 (no 62, como suponía `stage_tab`). En Windows `glob` no distingue mayúsculas (cogió capturas viejas).
- Motor: la ε de un elemento se acumula SOLO mientras está activo (con ε = B·Utot salía E_d 6.8 %).
## Pendiente
- ✅ E_d: manual teórico de GEO5 FEM (data.fine.cz/handbooks-chapter-pdf/geo5_fem_theoretical_guide.pdf), §2.3.1,
  ec. 2.12, pág. 25: E_d = √(2εᵀQPQε) = √(4·J2(e)). El visor usaba √(4/3·J2) (√3 veces menor). Corregido en `geo5scale.ts`.
- ✅ Etapa 6: la carga nueva entra por incrementos (2, 4, 8, 16) si Newton no cierra, como GEO5. Converge con 2.
- ✅ Asiento de la coronación (+13 a +25 % con Mohr-Coulomb en GEO5): DEMOSTRADO que es el modelo de suelo. El mismo
  modelo de GeoFEM con las dos arenas en Drucker-Prager (`muro_manabi_fem_etapas_dp.gmk`, `examples/muro_manabi_etapas_geofem_dp.json`):
  | etapa | d_z GEO5-DP / GT | d_x GEO5-DP / GT |
  |---|---|---|
  | muro | 6.5 / 6.52 | 3.6 / 3.40 |
  | bajo el talón | 7.2 / 7.19 | 2.4 / 2.25 |
  | capa 1 | 9.8 / 9.81 | −0.2 / −0.43 |
  | capa 2 | 12.5 / 12.57 | −2.4 / −2.64 |
  | capa 3 | 15.4 / 15.44 | −3.9 / −4.05 |
  σz bajo la zapata (etapa 6, x 9.8…11.8): GEO5-DP 36.6 37.8 39.4 41.4 44.6 · GT 36.9 38.3 40.7 44.1 47.1 (+1 … +6 %).
  ⚠️ Con Drucker-Prager GEO5 NO cierra la etapa 7 («Maximum number of relaxations… exceeded», W071, 0 %); Geotechnic sí
  (14 iteraciones). El D-P de GEO5 (ajustado a extensión) es más débil que su Mohr-Coulomb: por eso el asiento era mayor.
- ⏳ Construcción por etapas en el motor TS.

# Parametrización del talud (29-sep-2026, pedido de Jorge)
- `talud … bermas=n berma=w`: H se reparte en n+1 caras iguales a β, con n bermas horizontales de ancho w.
- Deslizadores nuevos: n.º de bermas, ancho de berma, contratalud β₂, cota tras el contratalud (antes solo H, β, corona, x pie).
- «Estratos»: un deslizador por interfaz de suelo que la sube o baja entera, limitado para no cruzar el terreno, otras
  interfaces ni los puntos de `asignar` (cruzarlos intercambiaría los suelos de las regiones).
- Ejemplo `examples/talud_bermas.hgeo` (H 12 m a 45°): FS 1.17 sin bermas · 1.46 con 1 · 1.65 con 2 (más tendido → más FS).
- Puppeteer `tests/shot_talud_param.mjs` (puppeteer de hekatan-struct-limpio: el de hekatan-struct estaba vacío): los
  sliders salen, mover bermas remalla y recalcula, consola sin errores. Subir el estrato 1.66 m cambia malla y d_x pero el
  FS queda en el mismo peldaño de la escalera SRM (1.6455): la rotura va por el limo de arriba.

# Mohr-Coulomb en Geotechnic (29-sep-2026, tarde)
- ✅ `suelo … modelo=mc`: retorno de Clausen, Damkilde y Andersen (2007) en tensiones principales (cara, arista de
  compresión, arista de extensión, ápice), el método de GeoFEM (MC\mohrcoulomb_rp.cpp; memoria reference_geofem_mc_tangent),
  portado línea a línea de `ingenieria-inversa/hekatan-geo5-bridge/Demo04_replica/mc_stress.m`. Tangente NUMÉRICA
  (medido antes: da lo mismo que la analítica de GEO5). ψ ≤ φ reducida. Por defecto sigue Drucker-Prager (Demo04 intacto).
- ✅ Validado contra GeoFEM-MC por etapas (`examples/muro_manabi_etapas_mc.hgeo`), coronación d_z / d_x:
  | etapa | GEO5-MC | Geotechnic-MC |
  |---|---|---|
  | muro | 5.2 / 2.9 | 5.25 / 2.71 |
  | bajo el talón | 5.9 / 1.7 | 5.91 / 1.56 |
  | capa 1 | 8.4 / −0.8 | 8.42 / −0.97 |
  | capa 2 | 10.9 / −2.7 | 10.96 / −2.89 |
  | capa 3 | 13.6 / −3.9 | 13.60 / −4.10 |
  | capa 4 | 16.4 / −4.5 | 16.38 / −4.55 |
  Etapa final: σz 212.9 / 211.1 · σx 91.2 / 90.4 · J 70.2 / 69.7 · E_d 1.18 / 1.17 · E_d,pl 0.38 / 0.58 · d_z máx 27.1 / 25.3.
- ✅ TS = WASM bit a bit con Mohr-Coulomb (`tests/etapas_ts_wasm.ts`, en `npm test`).
- ❌→✅ Malla de 1 m + Mohr-Coulomb: la capa 4 «convergía» a 12 m (mecanismo de colapso; las normas relativas lo daban
  por bueno). Ahora: un incremento que mueve > 1 m es mecanismo; si ni con 16 incrementos cierra, se queda en el último
  bueno y dice «carga alcanzada x %» (como GEO5, «Attained loading»). En la interfaz: «✖ no converge (x % de la carga)».

- ❌ Probado: tangente ELÁSTICA en el ápice de Mohr-Coulomb (como el D-P del motor) → la etapa 6 del muro por etapas dejaba
  de converger (0 % de la carga). Se deja la numérica también en el ápice (todas las etapas cierran y cuadran con GeoFEM).
- ❌ SRM del muro en UNA etapa con Mohr-Coulomb (malla 0.5, 6802 nudos, `examples/muro_manabi_geofem_mc.hgeo`): el estado
  inicial (SRF = 1, todo el peso de una vez) NO converge, ni con 16 incrementos de carga → FS 1.0000 (GEO5: 1.36). No es
  el Mohr-Coulomb: con Drucker-Prager la misma geometría con malla 0.5 tampoco convergía a SRF = 1 (tabla de variaciones).
  El cálculo POR ETAPAS sí converge y cuadra con GeoFEM. ⏳ Probable causa: GEO5 arma el estado inicial con un procedimiento
  geostático (K0) — memoria reference_geo5_solver_output_re — hay que EXTRAERLO del binario, no suponerlo.
- ❌→✅ El reintento por incrementos en TODOS los peldaños rompía Demo04 (etapa 3: 1.7369 en vez de 1.69): la divergencia
  de los peldaños SRF > 1 es la que fija el FS de GEO5. Ahora solo en SRF = 1. `npm test` en verde (1.6935 / 1.4810 / 1.6935).
