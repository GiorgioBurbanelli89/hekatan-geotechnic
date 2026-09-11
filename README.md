# Hekatan Geotechnic

**Sitio público:** https://giorgioburbanelli89.github.io/hekatan-geotechnic/ (rama `gh-pages`, `npm run deploy`).

GeoFEM en el navegador: estabilidad de taludes por **reducción de resistencia** (SRM) con elementos T6 en
deformación plana y Drucker-Prager. Es un port fiel del driver de Hekatan Python que reproduce a GEO5 2024
(GeoFEM) a 12 cifras por punto de Gauss en la Demo04 (3 etapas: peso propio, sobrecarga, ancla).

- `src/geofem/solver.ts` — el solver (todo extraído de GEO5 o medido en su *course of analysis*, nada de libro).
- `src/geofem/band.ts` — LU en banda no simétrica con Cuthill-McKee inverso (como el skyline de GEO5).
- `src/viewer/` — visor Canvas con la escala y paleta de GEO5 medidas en sus capturas.
- `public/models/demo04.json` — malla exacta del InputFile de GEO5 (628 nudos, 287 T6).

## Muro cantilever = «Rigid body» de GEO5

Una orden del `.hgeo` mete un muro de hormigón:

```
suelo HORMIGON E=30000000 nu=0.2 phi=0 c=0 gamma=24
muro  HORMIGON x=12 H=4 [fuste=0.35 zapata=0.35 talon=1.5 dedo=0.6 emp=0.9]
```

`x` = cara vista del fuste, `H` = altura vista sobre el terreno de delante, `emp` = profundidad de la BASE.
Sin las dimensiones se predimensionan con H (B≈0.6H, fuste y zapata≈H/12, dedo≈B/4). También se dibuja con
la herramienta **muro** (dos clics: pie de la cara vista y coronación) y se ajusta con sus sliders.

Qué hace, exactamente lo que hace el *Rigid body* de GEO5:

- el hormigón es una **región elástica**: el return-map no se activa nunca y la reducción de resistencia (SRM)
  **no le toca** → retiene el relleno, cambia los desplazamientos y la superficie de falla, y el FS;
- el **terreno** pasa por la cara vista del muro y por su coronación, y detrás queda el **relleno retenido**
  hasta el nivel de la coronación (el `.hgeo` sigue guardando el terreno NATURAL más la orden `muro`);
- la cara vista lleva un talud mínimo de 6 cm: una interfaz de GEO5 es y(x) y no admite vertical exacta;
- la malla se **gradúa** junto al muro (un fuste de 0.35 m dentro de una malla de 1.6 m es un rasgo mucho más
  pequeño que h: con un solo h global el refinamiento se dispara).

Lo que **no** hace (y no pretende): los esfuerzos M/V/N del fuste, que en GEO5 son el otro modelo, *Beam*
(elemento línea empotrado: solo la pantalla, sin talón ni puntera). Y el contacto suelo-muro está **pegado**
(nudos compartidos), como en GEO5 sin elementos de contacto: en modelos al límite eso concentra tensión en la
esquina de la coronación y el peldaño SRF=1 puede diverger. El remedio de GEO5 es el frame *Contacts*.

Comprobación: `npx tsx tests/muro_check.ts examples/muro_cantilever.hgeo` compara tres modelos con la misma
malla — talud natural, el mismo relleno retenido pero TODO de suelo, y relleno + muro — y verifica que el
hormigón no plastifica (ε_pl = 0 exacto en sus puntos de Gauss).

## El muro de contención, por los tres caminos

Un muro de contención se pregunta tres cosas distintas y el programa las responde por separado:

| pregunta | camino | dónde |
|---|---|---|
| ¿vuelca, desliza, aplasta el terreno? | cuerpo rígido + empuje de Coulomb | panel **Muro de contención** (`src/wall/verify.ts`) |
| ¿cuánto se mueve y por dónde falla el talud CON el muro? | GeoFEM T6, muro = *Rigid body* | la gráfica de siempre (`src/geofem/`) |
| ¿cuánto flexa el muro y qué tensión hay dentro? | **sólidos H8 en 3D** | botón *resolver el muro en sólidos H8* (`src/solid/`) |

### Verificación analítica (el módulo *Cantilever Wall* de GEO5)

Extraído de `CantileverWall_5.dll` (GEO5 2024): las teorías que calcula son **Coulomb, Caquot-Kerisel,
Müller-Breslau, Mazindrani y Absi** (activo `g5ap_*` y pasivo `g5pp_*`), en reposo **Jáky**; verifica
`Coef_overturning_wall`, `Coef_sliding_wall`, `Coef_bearingcapacity_wall`, `AllowableEccentricity` y
`Coef_resist_slip_surface`; y reparte la presión bajo la zapata en **rectangular o triangular**
(`Souc_obd_*` / `Souc_troj`). Implementado: Coulomb (activo y pasivo), Mazindrani, Jáky, y las cuatro
verificaciones con el reparto de presión de los dos tipos. Todo sale del propio `.hgeo`: el relleno es el
suelo detrás del talón, el apoyo el de bajo la zapata, y la sobrecarga la de la etapa.

Comprobado (`npx tsx tests/muro_verif.ts`): Coulomb con δ=0 y trasdós vertical **se reduce a Rankine a
1e-16**, Kp = 1/Ka, Mazindrani con β=0 = Rankine, Jáky = 1−sinφ, δ↑ baja Ka y β↑ lo sube.

### Sólidos H8 en 3D

`src/solid/cpp/hex8_wasm.cpp` es el **mismo fichero** de Hekatan Struct, copiado sin tocar y compilado
aquí solo (`build_wasm_solid.sh`). Su opción de modos incompatibles (Wilson-Taylor) es el
*Incompatible Bending Modes* que SAP2000 trae **activado por defecto**:

$$\text{H8 con modos incompatibles} = \text{SAP2000 Solid (InComp)} = \text{Abaqus } \mathtt{C3D8I}$$
$$\text{H8 clásico} = \text{SAP2000 sin modos} = \text{Abaqus } \mathtt{C3D8}$$

Comprobado (`npx tsx tests/muro_solido_sap.ts`) contra SAP2000 por OAPI, **nudo a nudo**, con las mismas
referencias que arbitran en Struct: peor diferencia **4e-9 %** en los tres casos (empuje, H8 clásico, y
peso propio + relleno sobre el talón), 612 nudos y 330 hexaedros.
**ETABS no entra en esta comparación: ETABS no tiene elementos sólidos** (`SolidObj` solo existe en la
OAPI de SAP2000). Los árbitros de sólidos son SAP2000 y Abaqus.

```
npm install
npm run dev        # http://localhost:4700
npm test           # corre la Demo04 en Node y deja tests/out/demo04_ts.log (mismo formato que Hekatan Python)
npm run build      # dist/ para GitHub Pages (DEPLOY_BASE=/hekatan-geotechnic/)
```
```
npx tsx tests/run_hgeo.ts examples/muro_cantilever.hgeo    # cualquier .hgeo por la cadena completa
npx tsx tests/muro_verif.ts                                # empujes y verificación del muro (casos exactos)
npx tsx tests/muro_solido_sap.ts                           # solidos H8 nudo a nudo contra SAP2000
node tests/check_muro.mjs                                  # el muro dibujado con el raton, en el navegador
node tests/check_muro_panel.mjs                            # el panel de verificacion + los solidos, en el navegador
```
Verificación: `cmp_iterlogs_key.py matlab_exact_3et.log tests/out/demo04_ts.log` → 142/142 iteraciones a 0.0e+00.
