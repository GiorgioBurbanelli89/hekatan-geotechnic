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

## 29-sep (tarde) — SRM de GEO5 con Mohr-Coulomb en la malla EXACTA de GeoFEM (`examples/geofem_muro_manabi_malla.json`)

- ✅ **Fallo real en la arista de Mohr-Coulomb (C++ y TS).** Se probaban las dos aristas en orden y ganaba la primera
  «ordenada». Esa podía ser la equivocada, con multiplicador negativo. En el muro movía σy de −33 a −25 kPa en todo el
  estrato sin cohesión, y el peldaño SRF 1.23 arrancaba con residuo 45 kN (GEO5 ~14). Ahora se aplica el criterio literal
  del binario (FUN_005a67e0): σ2_new > σ1_new → arista σ1=σ2; si no, σ2=σ3; si no vale, ápice. Demo04 sigue en
  1.6935 / 1.4810 / 1.6935 y las etapas MC siguen cuadrando con GeoFEM (coronación dz 16.39 mm, GEO5 16.38).
- ✅ **Estado inicial SRF=1 = GEO5.** Leí `Restart_In.bin`: registro de nudo de 144 B con 4 doubles (σx, σy, τxy, σz)
  al final. Comparación nudo a nudo en 5686 nudos: |dif| medio 0.3 / 0.7 / 0.2 / 0.2 kPa. Solo difiere en la esquina del
  muro, que es singular. La diferencia de FS NO viene del estado inicial.
- ✅ **Modo GEO5 = bits 19** (`srmContinua: true`): 1 peldaños encadenados + 2 tangente del SRF nuevo al empezar el peldaño
  + 16 retorno desde el inicio del paso con el incremento acumulado. Es lo que dice el line search del binario:
  `f_int(ADisp + DDisp)`. Contra el Log_File de GEO5 en SRF 1.1111, (GT | GEO5):
  paso completo 7.94e-3 | 7.95e-3 · ENorm 9.496e-3 | 9.492e-3 · |gi| it2 3.28 | 2.83 · it3 0.603 | 0.617 · converge en 3 | 3.
  Solo difiere η en it1 (0.39 | 0.45).
- ❌ Probado y descartado:
  - Reducir el ÁNGULO (φ/SRF): en el muro la escalera se separa de GEO5 en 1.2311. El muro trae `safetyfactorstage` y
    reduce la tangente.
  - Line search de 3 pasadas (bit 4): FS 1.52–2.15.
  - Energía con el residuo previo (bit 8): ENorm 4.2e-2, contra 9.49e-3 de GEO5.
- ⚠️ **El FS de este muro (arenas con c = 0) es CAÓTICO.** TS y WASM ejecutan el mismo algoritmo y solo difieren en
  redondeo (1e-5 relativo en ENorm), pero la escalera termina en 2.15 (TS) y 1.47 (WASM). Con distintos bits: 1.29, 1.31,
  1.47, 1.51, 2.14, 2.15. GEO5 da 1.36 (su log: converge en 1.3283 y los Iter_File .bin.8 muestran dos intentos fallidos
  del peldaño 8 → FS 1.3624). Con paso de relajación 0.9875 converger o divergir depende del redondeo, y los
  desplazamientos siguen chicos (8 mm): no hay mecanismo claro, la «falla» es numérica. No se puede calcar 1.36 cifra a
  cifra. Sí se calca el algoritmo iteración a iteración.
- ⏳ η de la iteración 1 (0.39 contra 0.45): con el mismo paso completo, la diferencia está en R(η=1).
- ⏳ TS ≠ WASM en la SRM continuada, solo por redondeo (el orden de la factorización banda/skyline).

### 29-sep (noche) — pendientes
- ✅ **Sensibilidad (modo GEO5 = 19, WASM):** con E del suelo multiplicado por 1.001 / 1.0001 / 0.999999 / 1.000001 / 0.9999
  el FS da 1.3320 / 1.4014 / 1.4737 / 1.4737 / 1.4014. Un 0.1 % de E no cambia la física y mueve el FS 10 %. GEO5 1.36
  cae dentro de la banda 1.33–1.47. Para este muro, el FS de la SRM hay que leerlo como banda, no como número exacto.
- ❌ ψ = φ (flujo asociado) para explicar el η: cambia el paso completo (5.98e-3 contra 7.95e-3 de GEO5). El muro usa ψ = 0.
- ✅ Line search literal del binario (decompiled/NewtonLoop_decomp.c, FUN_00510a90) = el nuestro. Con la bandera 0x2000
  (inicio de paso) y estado[200] ≠ 0, GEO5 salta el line search (η = 1); en el Log del muro no lo salta. La diferencia de
  η (0.39 contra 0.45) está en R(η = 1). El residuo tras el paso casi coincide (6.24e-2 contra 6.35e-2): no se persigue más.
- ⏳ La misma perturbación de E en GEO5 (desde su ventana), para ver si su FS también salta.

## 30-sep — Geotechnic → Hekatan Struct
- ✅ Botón «🏗 abrir este muro en Hekatan Struct» en el panel del muro (`src/wall/panel.ts`: `parametrosStruct`,
  `enlaceStruct`). Abre `…/workspace/?t=muro-manabi&p=<JSON base64url>` (el `&p=` del botón Compartir de Struct) con:
  Hf = alto libre del fuste de la verificación, tf, tBase = fuste, tTop = fuste − MURO_BAT (talud de la cara vista),
  puntera, talón, γ y φ del relleno, hDel = emp y suelo lateral. δ: «auto» de Geotechnic es δ = φ en el plano
  FICTICIO (suelo contra suelo, GEO5); en Struct el empuje va en el trasdós → δ = ⅔·φ (o el δ que ponga el usuario).
- ✅ Ejemplo nuevo en la lista: «Muro de Manabí paramétrico» (`?ejemplo=manabi_muro`, examples/muro_manabi.hgeo).
  Muro de Manabí → Hf 2.60, tf 0.40, tBase 0.40, tTop 0.34, puntera 0.70, talón 1.90, γ 18.5, φ 30, δ 20, hDel 0.60.
- ✅ Puppeteer en los dos deploys públicos: botón visible, Struct abre con los parámetros (coronación −2.79 mm con el
  fuste de 0.34 m arriba; −2.80 con el de 0.25), sin errores.
- ✅ Quitado el código del estudio de suelos de la cabecera de `examples/muro_manabi.hgeo` (sale en el editor público).
