# Explicar Hekatan Geotechnic con Manim

Cuando el usuario pida *«explícame … con Manim»* (o «en Manim») sobre taludes, SRM, T6, Drucker-Prager, etapas, muros:

1. Lee `docs/ALGORITMOS_GEOFEM.md` (qué es y dónde está) y esta carpeta.
2. Copia `escena_srm_talud.py`, cambia `TITULO`, `PASOS` (nombre + ecuación en texto Unicode) y el dibujo.
3. Entrega **el `.py` completo** en un bloque de código + el comando de render.
4. Explica corto, en español simple, el porqué de cada paso (estilo y = m·x + b).

**Importante:** Claude móvil/web **no renderiza Manim**. Entrega el código y el usuario lo corre en su PC:

```
pip install manim            # una vez (NO hace falta LaTeX)
manim -pql escena_srm_talud.py SRMTalud    # prueba rápida 480p
manim -pqh escena_srm_talud.py SRMTalud    # 1080p
```

Si quiere verlo **ya** en el móvil sin renderizar: genera un artifact HTML/SVG animado con los mismos pasos.

## Reglas de las escenas
- Un paso por bloque: nombre en naranja + ecuación con `Text` y símbolos Unicode (κ ∂ ∫ φ …), **nunca `MathTex`/LaTeX**, alineados a la izquierda (`move_to(..., aligned_edge=LEFT)`).
- Resaltar con pulso de escala (`.animate.scale(1.09)`), no `Indicate` si hay `ImageMobject`.
- Ecuaciones como texto Unicode (sin LaTeX); términos como en `docs/ALGORITMOS_GEOFEM.md`.
- Probada con Manim Community v0.20.1.
