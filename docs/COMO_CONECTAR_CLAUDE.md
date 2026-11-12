# Cómo conectar Hekatan Geotechnic a Claude (móvil y web)

Claude no busca el repo en Google: hay que **conectarlo a un Proyecto** de claude.ai. Una sola vez.

## 1. Crear el Proyecto
1. Abre claude.ai → **Projects** → **Create project**.
2. Nombre: `Hekatan Geotechnic`.

## 2. Conectar el repo
1. En el Proyecto, panel **Project knowledge** → **+** → **GitHub**.
2. Primera vez: **Authorize** y aceptar en GitHub.
3. Marca **GiorgioBurbanelli89/hekatan-geotechnic** (rama `main`) → **Add**.
4. Si no aparece: GitHub → Settings → Applications → Claude → dar acceso a ese repo.
5. Si dice que no cabe: agregar solo `docs/` y la carpeta de ejemplos.

## 3. Instrucciones del Proyecto
En **Set project instructions** pegar el bloque que está al final de `docs/USAR_HEKATAN_GEOTECHNIC.md`.

## 4. Probar (celular)
App Claude → **Projects → Hekatan Geotechnic** → chat dentro del Proyecto:
«Usa Hekatan Geotechnic: explícame <tema> en Manim». Debe leer `docs/ALGORITMOS_GEOFEM.md` y entregar el `.py` de `docs/manim/`.

## 5. Mantenerlo al día
Al cambiar código: `git push` a `main` y en el Proyecto pulsar **Sync**.

## Límite
Claude móvil/web **no renderiza Manim**: entrega el código y se corre en la PC
(`manim -pql archivo.py Escena`). Sin LaTeX: las plantillas usan solo `Text`.
