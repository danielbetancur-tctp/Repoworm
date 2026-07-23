# Preprocesamiento tabular + imagen térmica para pipeline IoT
# Proyecto lombricultura - Eisenia fetida
# ============================================================
#
# NOTA DE INTEGRACIÓN (backend):
# Este archivo fue movido desde la raíz del proyecto a `backend/python/`
# para integrarse con la API Node/Express. Respecto al original, los
# imports pesados de terceros (pandas, scipy, scikit-image) se cargan de
# forma diferida (lazy) dentro de las funciones que realmente los usan.
# Así, la ruta de limpieza de imagen (crop + remoción de artefactos), que
# solo necesita OpenCV y NumPy, puede ejecutarse sin exigir el resto de
# dependencias del pipeline de features. El comportamiento de cada función
# permanece idéntico al original.
# ============================================================

import os
import json

import cv2
import numpy as np


# ============================================================
# CONFIGURACIÓN GENERAL
# ============================================================

TARGET_COLS = [
    "lombrices_agregadas_g",
    "peso_lombrices_inyectadas_g",
    "Gramos_Reales",
    "gramos",
    "ocupacion_real_pct",
]

META_COLS = [
    "id",
    "ID",
    "Id",
    "fecha",
    "fecha_hora",
    "fecha_hora_registro",
    "timestamp",
    "trama_id",
    "trama_raw",
    "estado",
    "imagen",
    "Archivo",
    "archivo",
    "replica",
    "iteracion",
    "Iteracion",
]

TRAMA_KEYWORD = "trama"


# ============================================================
# UTILIDADES
# ============================================================

def load_json(path, default=None):
    if path is None or not os.path.exists(path):
        return default

    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def safe_float(value, default=np.nan):
    try:
        if value is None:
            return default

        if isinstance(value, str):
            value = value.replace(",", ".").strip()
            if value == "":
                return default

        return float(value)

    except Exception:
        return default


def ensure_dataframe(data):
    """
    Convierte dict, list[dict] o DataFrame en DataFrame.
    """
    import pandas as pd

    if isinstance(data, pd.DataFrame):
        return data.copy()

    if isinstance(data, dict):
        return pd.DataFrame([data])

    if isinstance(data, list):
        return pd.DataFrame(data)

    raise ValueError("data debe ser dict, list[dict] o pandas.DataFrame")


def normalize_column_names(df):
    """
    Normaliza nombres frecuentes sin cambiar demasiado los nombres usados
    por el modelo.
    """
    rename_map = {}

    for col in df.columns:
        clean = (
            col.strip()
            .replace(" ", "_")
            .replace("-", "_")
            .replace("(", "")
            .replace(")", "")
            .replace("%", "pct")
            .replace("°", "")
        )

        clean = clean.lower()

        # Normalizaciones frecuentes
        clean = clean.replace("temperatura", "temperatura")
        clean = clean.replace("humedad", "humedad")
        clean = clean.replace("conductividad", "conductividad")
        clean = clean.replace("nitrogeno", "nitrogeno")
        clean = clean.replace("nitrógeno", "nitrogeno")
        clean = clean.replace("fosforo", "fosforo")
        clean = clean.replace("fósforo", "fosforo")
        clean = clean.replace("potasio", "potasio")

        rename_map[col] = clean

    return df.rename(columns=rename_map)


# ============================================================
# PREPROCESAMIENTO TABULAR
# ============================================================

def preprocess_tabular_data(
    data,
    feature_columns_path=None,
    medians_path=None,
    keep_legacy_orientation=True,
    drop_target=True,
    return_dataframe=True,
):
    """
    Preprocesa datos tabulares provenientes del backend IoT.

    Parámetros
    ----------
    data:
        dict, list[dict] o DataFrame con las mediciones.
    feature_columns_path:
        Ruta a JSON con columnas finales usadas al entrenar el modelo.
        Ejemplo: feature_columns.json
    medians_path:
        Ruta a JSON con medianas de entrenamiento para imputar valores faltantes.
        Ejemplo: tabular_medians.json
    keep_legacy_orientation:
        Si True, mantiene acel_x_g/acel_y_g/acel_z_g como nombres heredados.
        En el informe se aclara que representan orientación angular en grados.
    drop_target:
        Si True, elimina columnas objetivo si vienen en la trama.
    return_dataframe:
        Si True, retorna DataFrame. Si False, retorna numpy array.

    Retorna
    -------
    DataFrame o np.ndarray listo para inferencia.
    """

    df = ensure_dataframe(data)
    df = normalize_column_names(df)

    # --------------------------------------------------------
    # 1. Eliminar columnas meta y columnas objetivo
    # --------------------------------------------------------

    cols_to_drop = []

    for col in df.columns:
        col_low = col.lower()

        if col in META_COLS or col_low in [c.lower() for c in META_COLS]:
            cols_to_drop.append(col)

        if TRAMA_KEYWORD in col_low:
            cols_to_drop.append(col)

        if drop_target and col in TARGET_COLS:
            cols_to_drop.append(col)

        if drop_target and col_low in [c.lower() for c in TARGET_COLS]:
            cols_to_drop.append(col)

    df = df.drop(columns=list(set(cols_to_drop)), errors="ignore")

    # --------------------------------------------------------
    # 2. Corrección semántica de columnas frecuentes
    # --------------------------------------------------------

    rename_candidates = {
        "temp": "temperatura_c",
        "temperature": "temperatura_c",
        "temperature_c": "temperatura_c",
        "temperatura": "temperatura_c",

        "humedad": "humedad_pct",
        "humidity": "humedad_pct",
        "humidity_pct": "humedad_pct",

        "ec": "conductividad_us_cm",
        "conductividad": "conductividad_us_cm",
        "conductividad_electrica": "conductividad_us_cm",

        "ph_suelo": "ph",

        "n": "nitrogeno_mg_kg",
        "nitrogeno": "nitrogeno_mg_kg",

        "p": "fosforo_mg_kg",
        "fosforo": "fosforo_mg_kg",

        "k": "potasio_mg_kg",
        "potasio": "potasio_mg_kg",

        "uv": "uv_intensity",

        "lluvia": "lluvia_binario",

        "peso_cama": "peso_cama_g",
        "peso": "peso_cama_g",
    }

    df = df.rename(
        columns={
            c: rename_candidates[c]
            for c in df.columns
            if c in rename_candidates
        }
    )

    # --------------------------------------------------------
    # 3. Variables de orientación BNO055
    # --------------------------------------------------------
    # En datos históricos se usó acel_x_g/acel_y_g/acel_z_g,
    # pero realmente eran orientación angular en grados.
    # Para no romper el modelo entrenado, se mantienen los nombres
    # si el entrenamiento los usó.
    # --------------------------------------------------------

    orientation_candidates = {
        "orientacion_x": "acel_x_g",
        "orientacion_y": "acel_y_g",
        "orientacion_z": "acel_z_g",
        "orientation_x": "acel_x_g",
        "orientation_y": "acel_y_g",
        "orientation_z": "acel_z_g",
        "bno_x": "acel_x_g",
        "bno_y": "acel_y_g",
        "bno_z": "acel_z_g",
    }

    if keep_legacy_orientation:
        df = df.rename(
            columns={
                c: orientation_candidates[c]
                for c in df.columns
                if c in orientation_candidates
            }
        )

    # --------------------------------------------------------
    # 4. Convertir todo a numérico
    # --------------------------------------------------------

    for col in df.columns:
        df[col] = df[col].apply(safe_float)

    df = df.select_dtypes(include=[np.number]).copy()

    # --------------------------------------------------------
    # 5. Eliminar constantes y duplicados exactos en batch
    # --------------------------------------------------------

    constant_cols = [
        c for c in df.columns
        if df[c].nunique(dropna=True) <= 1 and len(df) > 1
    ]

    df = df.drop(columns=constant_cols, errors="ignore")

    duplicated_mask = df.T.duplicated()
    duplicated_cols = df.columns[duplicated_mask].tolist()
    df = df.loc[:, ~duplicated_mask]

    # --------------------------------------------------------
    # 6. Cargar columnas esperadas del modelo
    # --------------------------------------------------------

    feature_columns = load_json(feature_columns_path, default=None)
    medians = load_json(medians_path, default={})

    if feature_columns is not None:
        # Agregar columnas faltantes
        for col in feature_columns:
            if col not in df.columns:
                df[col] = medians.get(col, 0.0)

        # Eliminar columnas extra y ordenar
        df = df[feature_columns]

    # --------------------------------------------------------
    # 7. Imputación final
    # --------------------------------------------------------

    df = df.replace([np.inf, -np.inf], np.nan)

    for col in df.columns:
        if col in medians:
            df[col] = df[col].fillna(medians[col])
        else:
            if df[col].isna().all():
                df[col] = df[col].fillna(0.0)
            else:
                df[col] = df[col].fillna(df[col].median())

    if return_dataframe:
        return df

    return df.values


# ============================================================
# PREPROCESAMIENTO DE IMÁGENES TÉRMICAS
# ============================================================

def crop_flir_image(img):
    """
    Recorta la imagen FLIR para eliminar barra lateral, textos,
    bordes, logo y zonas de interfaz.
    """
    h, w, _ = img.shape

    y1 = int(h * 0.15)
    y2 = int(h * 0.86)

    x1 = int(w * 0.06)
    x2 = int(w * 0.86)

    return img[y1:y2, x1:x2]


def remove_thermal_artifacts(crop_bgr):
    """
    Elimina artefactos visuales:
    - cruz roja
    - corchetes blancos
    - marcas de interfaz
    """

    hsv = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV)

    # Rojo: cruz del visor
    red1 = cv2.inRange(
        hsv,
        np.array([0, 80, 40]),
          np.array([10, 255, 255])
    )

    red2 = cv2.inRange(
        hsv,
        np.array([170, 80, 40]),
        np.array([180, 255, 255])
    )

    # Blanco: corchetes del visor
    white = cv2.inRange(
        hsv,
        np.array([0, 0, 180]),
        np.array([180, 60, 255])
    )

    artifact_mask = ((red1 > 0) | (red2 > 0) | (white > 0))

    artifact_mask = cv2.dilate(
        artifact_mask.astype(np.uint8),
        np.ones((7, 7), np.uint8),
        iterations=2
    ).astype(bool)

    gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
    clean = gray.copy()

    valid_values = clean[~artifact_mask]

    if len(valid_values) > 0:
        clean[artifact_mask] = np.median(valid_values)

    clean = cv2.GaussianBlur(clean, (3, 3), 0)

    return clean, artifact_mask


def clean_thermal_image(image_path):
    """
    Ejecuta únicamente la etapa de limpieza visual de una imagen térmica
    FLIR (recorte + remoción de artefactos) y retorna la imagen en escala
    de grises lista para mostrarse como "Vista previa" en el aplicativo.

    Reutiliza `crop_flir_image` y `remove_thermal_artifacts` para garantizar
    que la vista previa corresponde exactamente a lo que consumirá el
    pipeline de features antes de la predicción.

    Parámetros
    ----------
    image_path:
        Ruta de la imagen térmica original.

    Retorna
    -------
    dict con:
        gray_clean:      np.ndarray (uint8) imagen limpia en escala de grises.
        artifact_mask:   np.ndarray (bool) máscara de artefactos detectados.
        original_shape:  (alto, ancho) de la imagen original.
        crop_shape:      (alto, ancho) del recorte procesado.
    """

    if image_path is None or not isinstance(image_path, str):
        raise ValueError("image_path debe ser una ruta de archivo válida.")

    if not os.path.exists(image_path):
        raise FileNotFoundError(f"La imagen no existe: {image_path}")

    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"No se pudo leer la imagen: {image_path}")

    if img.ndim != 3 or img.shape[2] != 3:
        # `crop_flir_image` y la conversión de color asumen una imagen BGR.
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    original_h, original_w = img.shape[:2]

    crop = crop_flir_image(img)
    if crop.size == 0:
        raise ValueError(
            "El recorte de la imagen resultó vacío. "
            "Verifique que la resolución de la imagen térmica sea adecuada."
        )

    gray_clean, artifact_mask = remove_thermal_artifacts(crop)

    return {
        "gray_clean": gray_clean,
        "artifact_mask": artifact_mask,
        "original_shape": (int(original_h), int(original_w)),
        "crop_shape": (int(crop.shape[0]), int(crop.shape[1])),
    }


def extract_pixel_features(gray):
    """
    Extrae conteos y densidades de píxeles por umbrales fijos
    y percentiles.
    """
    from scipy.stats import skew, kurtosis
    from skimage.measure import shannon_entropy

    features = {}
    total = gray.size

    # Umbrales fijos
    for threshold in [50, 80, 100, 130, 150, 180, 200]:
        _, mask = cv2.threshold(
            gray,
            threshold,
            255,
            cv2.THRESH_BINARY
        )

        count = cv2.countNonZero(mask)

        features[f"img_pix_count_{threshold}"] = float(count)
        features[f"img_pix_density_{threshold}"] = float(count / total * 100)

    # Umbrales dinámicos por percentil
    for p in [50, 60, 70, 75, 80, 85, 90, 95]:
        threshold = np.percentile(gray, p)

        _, mask = cv2.threshold(
            gray,
            threshold,
            255,
            cv2.THRESH_BINARY
        )

        count = cv2.countNonZero(mask)

        features[f"img_pix_percentile_count_{p}"] = float(count)
        features[f"img_pix_percentile_density_{p}"] = float(count / total * 100)

    values = gray.flatten().astype(float)

    features["img_gray_mean"] = float(np.mean(values))
    features["img_gray_std"] = float(np.std(values))
    features["img_gray_min"] = float(np.min(values))
    features["img_gray_max"] = float(np.max(values))
    features["img_gray_median"] = float(np.median(values))
    features["img_gray_p10"] = float(np.percentile(values, 10))
    features["img_gray_p25"] = float(np.percentile(values, 25))
    features["img_gray_p75"] = float(np.percentile(values, 75))
    features["img_gray_p90"] = float(np.percentile(values, 90))
    features["img_gray_iqr"] = float(features["img_gray_p75"] - features["img_gray_p25"])
    features["img_gray_range"] = float(features["img_gray_max"] - features["img_gray_min"])
    features["img_gray_skew"] = float(skew(values))
    features["img_gray_kurtosis"] = float(kurtosis(values))
    features["img_entropy"] = float(shannon_entropy(gray))

    return features


def extract_lbp_features(gray, prefix="img_lbp", radius=3):
    """
    Extrae Local Binary Patterns.
    Captura textura térmica superficial.
    """
    from skimage.feature import local_binary_pattern

    points = 8 * radius

    lbp = local_binary_pattern(
        gray,
        P=points,
        R=radius,
        method="uniform"
    )

    n_bins = int(points + 2)
    hist, _ = np.histogram(
        lbp.ravel(),
        bins=np.arange(0, n_bins + 1),
        range=(0, n_bins),
        density=True
    )

    features = {}

    for i, value in enumerate(hist):
        features[f"{prefix}_{i}"] = float(value)

    return features


def extract_glcm_features(gray, prefix="img_glcm"):
    """
    Extrae características GLCM de textura:
    contraste, disimilitud, homogeneidad, energía, correlación y ASM.
    """
    from skimage.feature import graycomatrix, graycoprops

    img_uint8 = gray.astype(np.uint8)

    glcm = graycomatrix(
        img_uint8,
        distances=[1, 2, 4],
        angles=[0, np.pi / 4, np.pi / 2, 3 * np.pi / 4],
        levels=256,
        symmetric=True,
        normed=True
    )

    props = [
        "contrast",
        "dissimilarity",
        "homogeneity",
        "energy",
        "correlation",
        "ASM"
    ]

    features = {}

    for prop in props:
        vals = graycoprops(glcm, prop)
        features[f"{prefix}_{prop}_mean"] = float(np.mean(vals))
        features[f"{prefix}_{prop}_std"] = float(np.std(vals))

    return features


def extract_cold_zone_features(gray):
    """
    Extrae características de zonas frías.
    Estas zonas fueron útiles porque la humedad superficial y la
    heterogeneidad térmica afectan el patrón térmico de la cama.
    """

    features = {}

    for p in [25, 30, 35, 40]:
        threshold = np.percentile(gray, p)
        cold_mask = gray <= threshold

        values = gray[cold_mask]

        if len(values) == 0:
            features[f"cold_area_pct_{p}"] = 0.0
            features[f"cold_mean_{p}"] = 0.0
            features[f"cold_std_{p}"] = 0.0
            features[f"cold_median_{p}"] = 0.0
            continue

        features[f"cold_area_pct_{p}"] = float(np.mean(cold_mask) * 100)
        features[f"cold_mean_{p}"] = float(np.mean(values))
        features[f"cold_std_{p}"] = float(np.std(values))
        features[f"cold_median_{p}"] = float(np.median(values))

        # Imagen donde solo resaltan zonas frías
        cold_img = np.full_like(gray, int(np.median(gray)))
        cold_img[cold_mask] = gray[cold_mask]

        features.update(
            extract_lbp_features(
                cold_img,
                prefix=f"cold_lbp_{p}",
                radius=3
            )
        )

    return features


def preprocess_thermal_image(
    image_path,
    feature_columns_path=None,
    medians_path=None,
    debug_dir=None,
    return_dataframe=True,
):
    """
    Preprocesa una imagen térmica FLIR y retorna las características
    listas para el modelo.

    Parámetros
    ----------
    image_path:
        Ruta de la imagen térmica.
    feature_columns_path:
        JSON opcional con columnas esperadas por el modelo.
    medians_path:
        JSON opcional con medianas de entrenamiento.
    debug_dir:
        Si se indica, guarda crop, imagen limpia y máscara.
    return_dataframe:
        Si True retorna DataFrame de una fila.

    Retorna
    -------
    DataFrame o dict con features térmicas.
    """
    import pandas as pd

    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"No se pudo leer la imagen: {image_path}")

    name = os.path.splitext(os.path.basename(image_path))[0]

    # 1. Recorte
    crop = crop_flir_image(img)

    # 2. Remoción de artefactos
    gray_clean, artifact_mask = remove_thermal_artifacts(crop)

    # 3. Features
    features = {}
    features.update(extract_pixel_features(gray_clean))
    features.update(extract_lbp_features(gray_clean, prefix="img_lbp", radius=3))
    features.update(extract_glcm_features(gray_clean, prefix="img_glcm"))
    features.update(extract_cold_zone_features(gray_clean))

    # 4. Debug visual
    if debug_dir is not None:
        os.makedirs(debug_dir, exist_ok=True)

        cv2.imwrite(
            os.path.join(debug_dir, f"{name}_crop.jpg"),
            crop
        )

        cv2.imwrite(
            os.path.join(debug_dir, f"{name}_gray_clean.jpg"),
            gray_clean
        )

        cv2.imwrite(
            os.path.join(debug_dir, f"{name}_artifact_mask.jpg"),
            artifact_mask.astype(np.uint8) * 255
        )

    df = pd.DataFrame([features])

    feature_columns = load_json(feature_columns_path, default=None)
    medians = load_json(medians_path, default={})

    if feature_columns is not None:
        for col in feature_columns:
            if col not in df.columns:
                df[col] = medians.get(col, 0.0)

        df = df[feature_columns]

    df = df.replace([np.inf, -np.inf], np.nan)

    for col in df.columns:
        if col in medians:
            df[col] = df[col].fillna(medians[col])
        else:
            df[col] = df[col].fillna(0.0)

    if return_dataframe:
        return df

    return df.iloc[0].to_dict()


# ============================================================
# FUSIÓN SENSORIAL: TABULAR + IMAGEN
# ============================================================

def build_fusion_features(
    tabular_data,
    image_path,
    feature_columns_path=None,
    medians_path=None,
    debug_dir=None,
    return_dataframe=True,
):
    """
    Construye una fila final de entrada para el modelo fusionado:
    datos tabulares + características térmicas.

    Esta función debe usarse para el Escenario 2.
    """
    import pandas as pd

    tabular_df = preprocess_tabular_data(
        tabular_data,
        feature_columns_path=None,
        medians_path=None,
        return_dataframe=True
    )

    image_df = preprocess_thermal_image(
        image_path,
        feature_columns_path=None,
        medians_path=None,
        debug_dir=debug_dir,
        return_dataframe=True
    )

    fusion_df = pd.concat(
        [
            tabular_df.reset_index(drop=True),
            image_df.reset_index(drop=True)
        ],
        axis=1
    )

    # Eliminar duplicados exactos si aparecen
    fusion_df = fusion_df.loc[:, ~fusion_df.T.duplicated()]

    feature_columns = load_json(feature_columns_path, default=None)
    medians = load_json(medians_path, default={})
    if feature_columns is not None:
        for col in feature_columns:
            if col not in fusion_df.columns:
                fusion_df[col] = medians.get(col, 0.0)

        fusion_df = fusion_df[feature_columns]

    fusion_df = fusion_df.replace([np.inf, -np.inf], np.nan)

    for col in fusion_df.columns:
        if col in medians:
            fusion_df[col] = fusion_df[col].fillna(medians[col])
        else:
            fusion_df[col] = fusion_df[col].fillna(0.0)

    if return_dataframe:
        return fusion_df

    return fusion_df.values
