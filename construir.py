"""Genera las imágenes del flipbook a partir del PDF del manual.

Uso:
    python construir.py ruta/al/manual.pdf

Qué hace:
  1. Convierte cada página del PDF en imagen (necesita `pdftoppm`, de Poppler).
  2. Guarda cada página en WebP en docs/paginas/ (alta resolución) y en
     docs/miniaturas/ (para la barra de miniaturas).
  3. Copia el PDF a docs/manual.pdf (para el botón de descarga).
  4. Escribe docs/paginas.json con el número de páginas y su tamaño.

Si el manual cambia, basta con volver a correr este script con el PDF nuevo.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from PIL import Image

DPI = 216          # 5.5 x 8.5 in -> 1188 x 1836 px: nítido en pantallas retina
CALIDAD = 82       # calidad WebP de las páginas
CALIDAD_MINI = 70  # calidad WebP de las miniaturas
MINI = (180, 280)  # tamaño máximo de las miniaturas

AQUI = Path(__file__).resolve().parent
WEB = AQUI / "docs"


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Uso: python construir.py ruta/al/manual.pdf")
    pdf = Path(sys.argv[1]).resolve()
    if not pdf.is_file():
        sys.exit(f"No encuentro el PDF: {pdf}")
    if not shutil.which("pdftoppm"):
        sys.exit("Falta pdftoppm (Poppler). En Windows viene con MiKTeX; en Ubuntu: apt install poppler-utils")

    paginas = WEB / "paginas"
    miniaturas = WEB / "miniaturas"
    for carpeta in (paginas, miniaturas):
        if carpeta.exists():
            shutil.rmtree(carpeta)
        carpeta.mkdir(parents=True)

    with tempfile.TemporaryDirectory() as tmp:
        print(f"Convirtiendo {pdf.name} a {DPI} dpi...")
        subprocess.run(["pdftoppm", "-r", str(DPI), "-png", str(pdf), os.path.join(tmp, "p")], check=True)
        archivos = sorted(Path(tmp).glob("p-*.png"))
        if not archivos:
            sys.exit("pdftoppm no generó páginas")

        tam = None
        for i, archivo in enumerate(archivos, 1):
            with Image.open(archivo) as im:
                im = im.convert("RGB")
                tam = tam or im.size
                im.save(paginas / f"{i:02d}.webp", "WEBP", quality=CALIDAD, method=4)
                im.thumbnail(MINI, Image.LANCZOS)
                im.save(miniaturas / f"{i:02d}.webp", "WEBP", quality=CALIDAD_MINI, method=4)
            print(f"  página {i}/{len(archivos)}")

    shutil.copyfile(pdf, WEB / "manual.pdf")
    (WEB / "paginas.json").write_text(
        json.dumps({"total": len(archivos), "ancho": tam[0], "alto": tam[1], "version": time.strftime("%Y%m%d%H%M%S")}, indent=2),
        encoding="utf-8",
    )
    peso = sum(f.stat().st_size for f in paginas.glob("*.webp")) / 1e6
    print(f"Listo: {len(archivos)} páginas, {peso:.1f} MB en docs/paginas")


if __name__ == "__main__":
    main()
