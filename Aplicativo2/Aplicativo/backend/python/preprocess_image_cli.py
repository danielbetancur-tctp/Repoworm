#!/usr/bin/env python
# ============================================================
# CLI de preprocesamiento de imagen térmica (adaptador backend)
# ============================================================
#
# Responsabilidad única: recibir la ruta de una imagen térmica,
# ejecutar la etapa de LIMPIEZA (recorte FLIR + remoción de artefactos)
# reutilizando `preprocesamiento.clean_thermal_image`, y emitir por STDOUT
# un único objeto JSON con la imagen limpia codificada en base64 (PNG),
# lista para mostrarse en la "Vista previa" del aplicativo Angular.
#
# Contrato de salida (STDOUT, una sola línea JSON):
#   Éxito:
#     {
#       "success": true,
#       "cleanedImageBase64": "<base64 PNG sin prefijo data:>",
#       "format": "png",
#       "width": <int>, "height": <int>,
#       "originalWidth": <int>, "originalHeight": <int>,
#       "artifactPixelRatio": <float 0..1>
#     }
#   Error:
#     { "success": false, "error": "<mensaje>", "traceback": "<opcional>" }
#
# El proceso termina con código 0 en éxito y 1 en error, de modo que el
# servicio Node pueda distinguir el resultado tanto por el código de salida
# como por el campo "success".
# ============================================================

import argparse
import base64
import json
import os
import sys
import traceback


def _emit(payload, exit_code):
    """Imprime el JSON en STDOUT (única salida legible) y termina."""
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()
    sys.exit(exit_code)


def _fail(message, tb=None):
    payload = {"success": False, "error": str(message)}
    if tb is not None:
        payload["traceback"] = tb
    _emit(payload, 1)


def main():
    parser = argparse.ArgumentParser(
        description="Limpieza de imagen térmica FLIR para vista previa."
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Ruta absoluta de la imagen térmica de entrada.",
    )
    parser.add_argument(
        "--format",
        default="png",
        choices=["png", "jpg"],
        help="Formato de codificación de la imagen limpia (por defecto png).",
    )
    args = parser.parse_args()

    # Importaciones dependientes de terceros dentro de main para poder
    # reportar un error JSON limpio si el entorno no tiene las dependencias.
    try:
        import cv2
        import numpy as np
    except Exception as exc:  # pragma: no cover - entorno mal configurado
        _fail(
            "Faltan dependencias de Python (OpenCV/NumPy). "
            "Instale los paquetes de backend/python/requirements.txt. "
            f"Detalle: {exc}"
        )

    # Aseguramos que el módulo hermano `preprocesamiento.py` sea importable
    # sin depender del directorio de trabajo del proceso padre (Node).
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    try:
        from preprocesamiento import clean_thermal_image
    except Exception as exc:
        _fail(f"No se pudo importar el módulo de preprocesamiento: {exc}",
              traceback.format_exc())

    input_path = args.input
    if not input_path or not os.path.exists(input_path):
        _fail(f"La imagen de entrada no existe: {input_path}")

    try:
        result = clean_thermal_image(input_path)
    except FileNotFoundError as exc:
        _fail(str(exc))
    except ValueError as exc:
        _fail(str(exc))
    except Exception as exc:
        _fail(f"Error inesperado durante el preprocesamiento: {exc}",
              traceback.format_exc())

    gray_clean = result["gray_clean"]
    artifact_mask = result["artifact_mask"]

    ext = ".png" if args.format == "png" else ".jpg"
    encode_params = []
    if args.format == "jpg":
        encode_params = [cv2.IMWRITE_JPEG_QUALITY, 95]

    ok, buffer = cv2.imencode(ext, gray_clean, encode_params)
    if not ok:
        _fail("No se pudo codificar la imagen procesada.")

    encoded = base64.b64encode(buffer.tobytes()).decode("ascii")

    height, width = gray_clean.shape[:2]
    original_h, original_w = result["original_shape"]

    total_pixels = int(artifact_mask.size) if artifact_mask.size else 0
    artifact_ratio = (
        float(np.count_nonzero(artifact_mask)) / total_pixels
        if total_pixels
        else 0.0
    )

    _emit(
        {
            "success": True,
            "cleanedImageBase64": encoded,
            "format": args.format,
            "width": int(width),
            "height": int(height),
            "originalWidth": int(original_w),
            "originalHeight": int(original_h),
            "artifactPixelRatio": round(artifact_ratio, 6),
        },
        0,
    )


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # cinturón de seguridad final
        _fail(f"Fallo no controlado en el CLI: {exc}", traceback.format_exc())
