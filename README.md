# Flipbook del manual KIT-SAT

Visor web que muestra el manual de armado del KIT-SAT como un libro de papel: las hojas se doblan al pasarlas (clic, flechas del teclado o arrastrando la esquina con el dedo o el mouse). Tiene pestañas de sección, miniaturas, zoom, sonido opcional y descarga del PDF. No usa librerías externas.

El sitio está en `docs/` y GitHub Pages lo publica desde ahí (rama `main`, carpeta `/docs`).

## Actualizar el manual

1. Genera las páginas con el PDF nuevo:

   ```
   python construir.py ruta/al/manual-nuevo.pdf
   ```

   El script convierte cada página en imagen, la guarda en `docs/` y copia el PDF para el botón de descarga. No hay que tocar ninguna hoja a mano.
2. Si cambió en qué página empieza alguna sección, ajusta `"pagina"` en `docs/config.json`.
3. Haz commit y push. GitHub Pages se actualiza solo en uno o dos minutos.

Necesita Python con Pillow (`pip install pillow`) y `pdftoppm` de Poppler (en Windows viene con MiKTeX; en Ubuntu: `apt install poppler-utils`).

## Ver en local

```
python -m http.server 8765 --directory docs
```

Luego abre http://localhost:8765.

## Archivos

- `construir.py`: convierte el PDF en imágenes WebP (`docs/paginas/`, `docs/miniaturas/`) y escribe `docs/paginas.json`.
- `docs/index.html`, `docs/estilo.css`, `docs/flipbook.js`: el visor.
- `docs/config.json`: título y secciones (número, nombre, color y página donde empieza).

## Caché del navegador

GitHub Pages deja que los navegadores guarden los archivos hasta 10 minutos. Para que los teléfonos vean los cambios al momento:

- Las imágenes de las páginas llevan la versión que escribe `construir.py` en `docs/paginas.json`, así que al cambiar el PDF se recargan solas.
- Si cambias `estilo.css` o `flipbook.js`, cambia también el número `?v=...` donde se cargan en `docs/index.html`.
