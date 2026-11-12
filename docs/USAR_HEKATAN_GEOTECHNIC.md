# Cómo usar Hekatan Geotechnic cuando se pide «usa Hekatan Geotechnic para …»

1. Leer `docs/ALGORITMOS_GEOFEM.md` y `README.md`.
2. Modelos: copiar un `.hgeo` parecido de `examples/` (talud: `talud_1_inclinacion.hgeo`; muro: `muro_cantilever.hgeo`; etapas: `muro_manabi_etapas.hgeo`). No inventar órdenes del `.hgeo`.
3. Resolver con la app (https://giorgioburbanelli89.github.io/hekatan-geotechnic/) o los tests de `tests/`; reportar FS y la superficie de falla.
4. Explicaciones animadas: seguir `docs/manim/README.md` (plantilla `docs/manim/escena_srm_talud.py`).
5. Citar el método (SRM, T6, Drucker-Prager) y su archivo.

## Texto para pegar en «Instrucciones del Proyecto» (claude.ai)
```
Este proyecto contiene el repo hekatan-geotechnic (GeoFEM: taludes por SRM, muros, etapas).
Cuando diga «usa Hekatan Geotechnic»: lee docs/USAR_HEKATAN_GEOTECHNIC.md y docs/ALGORITMOS_GEOFEM.md.
No inventes órdenes .hgeo; copia ejemplos de examples/.
Si pido una explicación «en Manim»: lee docs/manim/README.md y entrégame el .py completo + comando de render.
Responde corto, en español simple, explicando el porqué.
```
