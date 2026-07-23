#!/usr/bin/env python
# ============================================================
# CLI de extracción de características térmicas (adaptador backend)
# ============================================================
#
# Responsabilidad única: recibir la ruta de una imagen térmica, ejecutar el
# pipeline de PREPROCESAMIENTO + EXTRACCIÓN DE CARACTERÍSTICAS reutilizando
# `preprocesamiento.preprocess_thermal_image`, y emitir por STDOUT un único
# objeto JSON con el vector numérico de características, listo para que el
# backend Node construya el tensor de entrada del modelo ONNX.
#
# Este CLI es el que hace que el módulo de preprocesamiento participe en la
# predicción, tanto para los modelos integrados como para modelos .onnx
# personalizados subidos por el usuario.
#
# Contrato de salida (STDOUT, una sola línea JSON):
#   Éxito:
#     { "success": true, "features": [<float>, ...],
#       "featureNames": [<str>, ...], "count": <int> }
#   Error:
#     { "success": false, "error": "<mensaje>", "traceback": "<opcional>" }
#
# Código de salida: 0 en éxito, 1 en error.
# ============================================================

import argparse
import json
import math
import os
import sys
import traceback


def _emit(payload, exit_code):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()
    sys.exit(exit_code)


def _fail(message, tb=None):
    payload = {"success": False, "error": str(message)}
    if tb is not None:
        payload["traceback"] = tb
    _emit(payload, 1)


def _sanitize(value):
    """Convierte a float finito; NaN/inf/None -> 0.0 para no romper el tensor."""
    try:
        num = float(value)
    except (TypeError, ValueError):
        return 0.0
    if math.isnan(num) or math.isinf(num):
        return 0.0
    return num


def main():
    parser = argparse.ArgumentParser(
        description="Extracción de características térmicas para inferencia ONNX."
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Ruta absoluta de la imagen térmica de entrada.",
    )
    args = parser.parse_args()

    # Aseguramos que el módulo hermano `preprocesamiento.py` sea importable
    # con independencia del directorio de trabajo del proceso padre (Node).
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    input_path = args.input
    if not input_path or not os.path.exists(input_path):
        _fail(f"La imagen de entrada no existe: {input_path}")

    try:
        from preprocesamiento import preprocess_thermal_image
    except Exception as exc:
        _fail(
            "No se pudieron importar las dependencias de preprocesamiento "
            f"(pandas/scipy/scikit-image/opencv): {exc}",
            traceback.format_exc(),
        )

    try:
        # return_dataframe=True → DataFrame de una sola fila con las features.
        df = preprocess_thermal_image(input_path, return_dataframe=True)
    except FileNotFoundError as exc:
        _fail(str(exc))
    except ValueError as exc:
        _fail(str(exc))
    except Exception as exc:
        _fail(f"Error durante la extracción de características: {exc}",
              traceback.format_exc())

    try:
        row = df.iloc[0]
        feature_names = [str(c) for c in df.columns]
        features = [_sanitize(row[c]) for c in df.columns]
    except Exception as exc:
        _fail(f"No se pudo serializar el vector de características: {exc}",
              traceback.format_exc())

    _emit(
        {
            "success": True,
            "features": features,
            "featureNames": feature_names,
            "count": len(features),
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
