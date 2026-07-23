import numpy as np
import pandas as pd
import logging
from typing import Dict, List, Tuple, Union
from sklearn.model_selection import KFold, LeaveOneOut
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score, mean_absolute_percentage_error
from sklearn.cluster import KMeans
from skimage.feature import graycomatrix, graycoprops, local_binary_pattern
from skimage.measure import shannon_entropy
from scipy.stats import skew, kurtosis
import catboost as cb
import shap
import warnings

# Configuración de Logging para Producción
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
warnings.filterwarnings('ignore', category=UserWarning)

class ThermalFeatureExtractor:
    """
    Responsable de la extracción de características de imágenes térmicas crudas.
    """
    def __init__(self, n_clusters: int = 3, glcm_distances: List[int] = [1], glcm_angles: List[float] = [0]):
        self.n_clusters = n_clusters
        self.glcm_distances = glcm_distances
        self.glcm_angles = glcm_angles

    def validate_image(self, thermal_img: np.ndarray):
        if not isinstance(thermal_img, np.ndarray):
            raise TypeError("La imagen térmica debe ser un numpy array.")
        if len(thermal_img.shape) != 2:
            raise ValueError("La imagen térmica debe ser una matriz 2D (valores térmicos de un solo canal).")
        if thermal_img.size == 0:
            raise ValueError("La matriz de la imagen está vacía.")

    def _quantize_image(self, thermal_img: np.ndarray, levels: int = 256) -> np.ndarray:
        """Cuantiza la imagen térmica a enteros para cálculo de GLCM y LBP."""
        img_min, img_max = thermal_img.min(), thermal_img.max()
        if img_max == img_min:
            return np.zeros(thermal_img.shape, dtype=np.uint8)
        quantized = (thermal_img - img_min) / (img_max - img_min) * (levels - 1)
        return quantized.astype(np.uint8)

    def extract_features(self, thermal_img: np.ndarray) -> Dict[str, float]:
        self.validate_image(thermal_img)
        features = {}
        
        try:
            # 1. Estadísticas Básicas
            features['term_mean'] = np.mean(thermal_img)
            features['term_max'] = np.max(thermal_img)
            features['term_min'] = np.min(thermal_img)
            features['term_std'] = np.std(thermal_img)
            features['term_var'] = np.var(thermal_img)
            features['term_range'] = features['term_max'] - features['term_min']
            features['term_cv'] = features['term_std'] / (features['term_mean'] + 1e-6)
            
            # Percentiles (Cálculo vectorizado para mejor rendimiento)
            p_vals = np.percentile(thermal_img, [25, 50, 75, 90])
            features.update({f'term_p{p}': val for p, val in zip([25, 50, 75, 90], p_vals)})
                
            # Momentos de orden superior y entropía
            features['term_skewness'] = skew(thermal_img.flatten())
            features['term_kurtosis'] = kurtosis(thermal_img.flatten())
            
            # Cuantización para textura y entropía
            img_q = self._quantize_image(thermal_img)
            features['term_entropy'] = shannon_entropy(img_q)
            
            # 2. Textura: GLCM
            glcm = graycomatrix(img_q, distances=self.glcm_distances, angles=self.glcm_angles, levels=256, symmetric=True, normed=True)
            for prop in ['contrast', 'dissimilarity', 'homogeneity', 'energy', 'correlation', 'ASM']:
                features[f'glcm_{prop}'] = graycoprops(glcm, prop)[0, 0]
                
            # 3. Textura: LBP
            radius, n_points = 1, 8
            lbp = local_binary_pattern(img_q, n_points, radius, method='uniform')
            features['lbp_mean'] = np.mean(lbp)
            features['lbp_std'] = np.std(lbp)
            
            # 4. Clustering y Áreas
            p10, p90 = features['term_p25'], features['term_p90'] # Aproximación para frío/caliente
            features['pct_area_fria'] = np.mean(thermal_img <= p10) * 100
            features['pct_area_caliente'] = np.mean(thermal_img >= p90) * 100
            
            # Clusters K-Means para segmentar térmica
            kmeans = KMeans(n_clusters=self.n_clusters, random_state=42, n_init=5)
            labels = kmeans.fit_predict(thermal_img.reshape(-1, 1))
            _, counts = np.unique(labels, return_counts=True)
            features['cluster_size_avg'] = np.mean(counts)
            features['term_heterogeneity'] = np.std(kmeans.cluster_centers_) # Dispersión de centroides
            
        except Exception as e:
            logging.error(f"Error extrayendo características térmicas: {str(e)}")
            raise
            
        return features

class TabularPreprocessor:
    """
    Responsable del procesamiento, limpieza e ingeniería de variables del dataset tabular.
    """
    def __init__(self, required_cols: List[str]):
        self.required_cols = required_cols
        
    def validate_data(self, df: pd.DataFrame):
        missing = [col for col in self.required_cols if col not in df.columns]
        if missing:
            raise ValueError(f"Faltan las siguientes columnas requeridas: {missing}")

    def process(self, df: pd.DataFrame) -> pd.DataFrame:
        self.validate_data(df)
        df_proc = df.copy()
        
        try:
            # Imputación básica (para un estudio experimental asumo que son mínimos, uso la mediana)
            df_proc.fillna(df_proc.median(numeric_only=True), inplace=True)
            
            # Ingeniería de Características
            eps = 1e-5
            n, p, k = df_proc['nitrogeno_prom_mg_kg'], df_proc['fosforo_prom_mg_kg'], df_proc['potasio_prom_mg_kg']
            
            # Asignación estructurada y compacta de relaciones e índices
            df_proc = df_proc.assign(
                ratio_n_p = n / (p + eps),
                ratio_n_k = n / (k + eps),
                ratio_p_k = p / (k + eps),
                indice_fertilidad = n * p * k,
                indice_termico_hidrico = df_proc['temperatura_prom_c'] / (df_proc['humedad_prom_pct'] + eps)
            )
            
            # Variables Categóricas/Ordinales
            if 'profundidad' in df_proc.columns:
                df_proc['profundidad'] = df_proc['profundidad'].astype('category')
            
        except Exception as e:
            logging.error(f"Error en el preprocesamiento tabular: {str(e)}")
            raise
            
        return df_proc

class WormDensityPredictor:
    """
    Responsable del modelado y validación de la densidad de lombrices.
    """
    def __init__(self, n_splits: int = 5, use_loocv: bool = True):
        self.use_loocv = use_loocv
        self.n_splits = n_splits
        # Configuración defensiva para pocos datos: Alta regularización, poca profundidad
        self.model_params = {
            'iterations': 500,
            'learning_rate': 0.05,
            'depth': 3,
            'l2_leaf_reg': 5,
            'loss_function': 'RMSE',
            'verbose': False,
            'random_seed': 42
        }
        self.model = cb.CatBoostRegressor(**self.model_params)

    def evaluate(self, y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
        return {
            'MAE': mean_absolute_error(y_true, y_pred),
            'RMSE': np.sqrt(mean_squared_error(y_true, y_pred)),
            'MAPE': mean_absolute_percentage_error(y_true, y_pred),
            'R2': r2_score(y_true, y_pred) if len(y_true) > 1 else np.nan
        }

    def train_and_validate(self, X: pd.DataFrame, y: pd.Series, cat_features: List[str] = None) -> Tuple[cb.CatBoostRegressor, Dict[str, float], np.ndarray]:
        logging.info(f"Iniciando entrenamiento con {'LOOCV' if self.use_loocv else f'{self.n_splits}-Fold CV'}")
        
        cv = LeaveOneOut() if self.use_loocv else KFold(n_splits=self.n_splits, shuffle=True, random_state=42)
        
        y_pred_cv = np.zeros(len(y))
        metrics_list = []
        
        for train_idx, val_idx in cv.split(X):
            X_train, X_val = X.iloc[train_idx], X.iloc[val_idx]
            y_train, y_val = y.iloc[train_idx], y.iloc[val_idx]
            
            # Clonar modelo para evitar fuga de datos
            model = cb.CatBoostRegressor(**self.model_params)
            model.fit(X_train, y_train, cat_features=cat_features, silent=True)
            
            preds = model.predict(X_val)
            y_pred_cv[val_idx] = preds
            
            if not self.use_loocv:
                metrics_list.append(self.evaluate(y_val, preds))

        # Entrenamiento final con todo el dataset
        self.model.fit(X, y, cat_features=cat_features, silent=True)
        
        # Evaluación global de CV
        global_metrics = self.evaluate(y, y_pred_cv)
        logging.info(f"Métricas de Validación Global: {global_metrics}")
        
        return self.model, global_metrics, y_pred_cv

class ModelExplainer:
    """
    Responsable de la explicabilidad del modelo mediante SHAP.
    """
    @staticmethod
    def explain(model: cb.CatBoostRegressor, X: pd.DataFrame):
        try:
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(X)
            
            # Generar explicabilidad sin crear figura oculta en memoria (se eliminó shap.summary_plot)
            logging.info("Análisis SHAP de valores calculado correctamente.")
            return shap_values
        except Exception as e:
            logging.error(f"Error generando explicabilidad SHAP: {str(e)}")
            raise

# --- USO EN PRODUCCIÓN (PIPELINE PRINCIPAL) ---

def run_experiment_pipeline(df_tabular: pd.DataFrame, thermal_images: List[np.ndarray], target_col: str):
    """
    Orquestador principal del pipeline multimodal.
    """
    # 1. Definir columnas base (dinámico, tomará las disponibles)
    required_cols = [
        'humedad_prom_pct', 'temperatura_prom_c', 'conductividad_prom_us_cm',
        'ph_prom', 'nitrogeno_prom_mg_kg', 'fosforo_prom_mg_kg', 
        'potasio_prom_mg_kg'
    ]
    # Filtrar solo las que realmente existen en el dataframe para evitar errores
    required_cols = [c for c in required_cols if c in df_tabular.columns]
    
    # Si ninguna coincide, tomamos todas las numéricas excepto el target
    if not required_cols:
        required_cols = [c for c in df_tabular.select_dtypes(include=np.number).columns if c != target_col]

    # 2. Extraer características térmicas
    extractor = ThermalFeatureExtractor()
    thermal_features_list = [extractor.extract_features(img) for img in thermal_images]
    df_thermal = pd.DataFrame(thermal_features_list)
    
    # 3. Preprocesar datos tabulares (Ingeniería de variables)
    preprocessor = TabularPreprocessor(required_cols=required_cols)
    df_tab_proc = preprocessor.process(df_tabular)
    
    # 4. Feature Fusion (Concatenar variables experimentales + térmicas)
    # El orden de df_tabular y thermal_images coincide 1 a 1.
    df_multimodal = pd.concat([df_tab_proc.reset_index(drop=True), df_thermal.reset_index(drop=True)], axis=1)
    
    # Separar Target y variables predictoras
    cols_to_drop = [target_col]
    if 'id_trama' in df_multimodal.columns:
        cols_to_drop.append('id_trama')
        
    X = df_multimodal.drop(columns=cols_to_drop) 
    y = df_multimodal[target_col]
    
    # Identificar todas las columnas categóricas dinámicamente (ej. 'salud_prom' = 'ACEPTABLE')
    cat_cols = list(X.select_dtypes(include=['object', 'category']).columns)
    
    # Asegurarnos de que no haya nulos en las categóricas (CatBoost no acepta NaN en categóricas a veces si no está parseado como string)
    for col in cat_cols:
        X[col] = X[col].fillna('DESCONOCIDO').astype(str)
    
    # 5. Modelado y Validación (LOOCV por tamaño de muestra ~25)
    predictor = WormDensityPredictor(use_loocv=True)
    model, metrics, cv_preds = predictor.train_and_validate(X, y, cat_features=cat_cols)
    
    # 6. Explicabilidad
    shap_values = ModelExplainer.explain(model, X)
    
    return model, metrics, cv_preds, X, shap_values

# --- EJECUCIÓN PRINCIPAL ---
if __name__ == "__main__":
    import os
    import glob
    from PIL import Image

    # =====================================================================
    # 1. CONFIGURACIÓN DE RUTAS Y VARIABLES
    # =====================================================================
    CARPETA_IMAGENES = 'ImagenesPruebas' # o la ruta completa 'C:/ruta/a/tus/imagenes'
    RUTA_EXCEL = 'datos_tramos.xlsx'      # Ruta de tu archivo Excel
    COLUMNA_OBJETIVO = 'lombrices_agregadas_g' # Nombre de la variable a predecir
    
    # =====================================================================
    # 2. CARGA DE IMÁGENES TÉRMICAS
    # =====================================================================
    def cargar_imagenes_termicas(carpeta):
        import re
        imagenes = []
        
        def extraer_identificador(ruta_archivo):
            nombre = os.path.basename(ruta_archivo).upper()
            # Regex compacto: captura gramos y opcionalmente iteración (asume 1 si no hay guion como en T0G)
            m = re.search(r'T(\d+)G(?:-(\d+))?', nombre)
            return (int(m.group(1)), int(m.group(2) or 1)) if m else (999, 999)
            
        archivos_crudos = glob.glob(os.path.join(carpeta, '*.jpg')) + glob.glob(os.path.join(carpeta, '*.png'))
        
        # Ordenamos usando la tupla (gramos, iteración) numéricamente
        archivos = sorted(archivos_crudos, key=extraer_identificador)
        if not archivos:
            logging.warning(f"No se encontraron imágenes en la carpeta: {carpeta}")
            
        for archivo in archivos:
            try:
                img = Image.open(archivo).convert('L')
                imagenes.append(np.array(img, dtype=float))
            except Exception as e:
                logging.error(f"Error cargando imagen {archivo}: {e}")
        return imagenes, archivos

    logging.info(f"Cargando imágenes desde: {CARPETA_IMAGENES}")
    thermal_images, image_paths = cargar_imagenes_termicas(CARPETA_IMAGENES)
    logging.info(f"Se cargaron {len(thermal_images)} imágenes térmicas.")

    # =====================================================================
    # 3. CARGA DEL EXCEL Y CONFIGURACIÓN DE LAS TOMAS
    # =====================================================================
    if os.path.exists(RUTA_EXCEL):
        logging.info(f"Cargando datos tabulares desde: {RUTA_EXCEL}")
        
        # 1. Leer los datos por toma (26 filas exactas, incluyendo 0g)
        logging.info("Leyendo hoja 'Datos extraidos' (26 tomas exactas)...")
        df_datos_extraidos = pd.read_excel(RUTA_EXCEL, sheet_name='Datos extraidos')
        
        # Garantizar que el DataFrame esté ordenado de menor a mayor cantidad de gramos
        # para que haga un "empalme perfecto" con el orden de las imágenes T0G, T10G, etc.
        if COLUMNA_OBJETIVO in df_datos_extraidos.columns:
            df_datos_extraidos = df_datos_extraidos.sort_values(by=COLUMNA_OBJETIVO, kind='stable').reset_index(drop=True)
        
        # 2. Leer los promedios (A1:N7)
        logging.info("Leyendo hoja 'Resumen por peso' (Promedios)...")
        df_resumen = pd.read_excel(RUTA_EXCEL, sheet_name='Resumen por peso', usecols="A:N", nrows=6)
        
        # 3. Fusionar la información
        # Unimos los promedios a la lectura de cada toma usando la columna objetivo como llave
        if COLUMNA_OBJETIVO in df_datos_extraidos.columns and COLUMNA_OBJETIVO in df_resumen.columns:
            df_tabular = pd.merge(df_datos_extraidos, df_resumen, on=COLUMNA_OBJETIVO, suffixes=('', '_promedio'))
            logging.info("Fusión exitosa: Se unieron las tomas individuales con sus promedios por etapa.")
        else:
            df_tabular = df_datos_extraidos.copy()
            logging.warning("No se pudo hacer la fusión por nombres de columna. Usando solo 'Datos extraidos'.")
            
        # Limpieza de nombres duplicados y ajuste final
        logging.info(f"Total de datos tabulares a procesar listos: {len(df_tabular)} filas.")
            
        # Sincronización: Asegurarnos de que el número de imágenes coincida con las filas expandidas
        min_len = min(len(thermal_images), len(df_tabular))
        if len(thermal_images) != len(df_tabular):
            logging.warning(f"¡Atención! Hay {len(thermal_images)} imágenes y {len(df_tabular)} filas en el Excel.")
            logging.warning(f"Se recortarán ambos a los primeros {min_len} registros para que coincidan.")
            thermal_images = thermal_images[:min_len]
            df_tabular = df_tabular.iloc[:min_len].copy()

        # =====================================================================
        # 4. EJECUCIÓN DEL PIPELINE DE MACHINE LEARNING
        # =====================================================================
        if min_len > 0:
            logging.info("Iniciando el Pipeline Multimodal de CatBoost...")
            try:
                model, metrics, cv_preds, X_processed, shap_values = run_experiment_pipeline(
                    df_tabular=df_tabular,
                    thermal_images=thermal_images,
                    target_col=COLUMNA_OBJETIVO
                )
                logging.info("¡Pipeline completado exitosamente!")
                logging.info(f"Métricas finales del modelo: {metrics}")
                
                # =====================================================================
                # 5. GRÁFICOS Y VISUALIZACIONES
                # =====================================================================
                try:
                    import matplotlib.pyplot as plt
                    import seaborn as sns
                    
                    logging.info("Generando gráficas de regresión y estimación por etapa...")
                    
                    # Preparar DataFrame con los resultados
                    df_resultados = pd.DataFrame({
                        'Etapa_Gramos_Reales': df_tabular[COLUMNA_OBJETIVO],
                        'Prediccion_CatBoost': cv_preds
                    })
                    
                    # Configuración general de estilo
                    sns.set_theme(style="whitegrid")
                    fig, axes = plt.subplots(1, 2, figsize=(16, 6))
                    
                    # Gráfico 1: Regresión Lineal (Predicciones a lo largo de las etapas)
                    sns.regplot(
                        data=df_resultados, 
                        x='Etapa_Gramos_Reales', 
                        y='Prediccion_CatBoost', 
                        scatter_kws={'alpha': 0.6, 'color': '#2c3e50'}, 
                        line_kws={'color': '#e74c3c', 'linewidth': 2},
                        ax=axes[0]
                    )
                    axes[0].set_title('Regresión Lineal: Reales vs Predichos por Etapa', fontsize=14)
                    axes[0].set_xlabel('Etapa (Gramos Reales Agregados)', fontsize=12)
                    axes[0].set_ylabel('Predicción del Modelo (Gramos)', fontsize=12)
                    
                    # Añadir línea ideal (y=x)
                    min_val = min(df_resultados['Etapa_Gramos_Reales'].min(), df_resultados['Prediccion_CatBoost'].min())
                    max_val = max(df_resultados['Etapa_Gramos_Reales'].max(), df_resultados['Prediccion_CatBoost'].max())
                    axes[0].plot([min_val, max_val], [min_val, max_val], 'k--', alpha=0.5, label='Línea Ideal')
                    axes[0].legend()

                    # Gráfico 2: Estimación (Densidad y distribución por etapa)
                    # Usamos un violin plot para ver la estimación de densidad y varianza por cada etapa
                    sns.violinplot(
                        data=df_resultados,
                        x='Etapa_Gramos_Reales',
                        y='Prediccion_CatBoost',
                        palette='viridis',
                        inner='quartile',
                        ax=axes[1]
                    )
                    # Swarmplot para ver la cantidad de puntos y dispersión
                    sns.swarmplot(
                        data=df_resultados,
                        x='Etapa_Gramos_Reales',
                        y='Prediccion_CatBoost',
                        color='white',
                        edgecolor='black',
                        linewidth=1,
                        alpha=0.7,
                        ax=axes[1]
                    )
                    axes[1].set_title('Distribución de Predicciones por Etapa (Densidad)', fontsize=14)
                    axes[1].set_xlabel('Etapa (Gramos Reales Agregados)', fontsize=12)
                    axes[1].set_ylabel('Predicción del Modelo (Gramos)', fontsize=12)
                    
                    plt.tight_layout()
                    # Guardamos la gráfica
                    ruta_grafica = 'resultados_prediccion.png'
                    plt.savefig(ruta_grafica, dpi=300)
                    logging.info(f"Gráfica guardada exitosamente como '{ruta_grafica}'. Mostrando en pantalla...")
                    
                    # Mostrar la gráfica
                    plt.show()
                    
                except ImportError:
                    logging.warning("No se pudo generar la gráfica. Faltan las librerías 'matplotlib' o 'seaborn'. Puedes instalarlas con: pip install matplotlib seaborn")
                except Exception as ex_plot:
                    logging.error(f"Error generando gráficos: {str(ex_plot)}")
            except Exception as e:
                logging.error(f"Error durante la ejecución del pipeline: {str(e)}")
        else:
            logging.error("No hay suficientes datos (imágenes o filas en Excel) para ejecutar el modelo.")
            
    else:
        logging.error(f"No se encontró el archivo Excel: '{RUTA_EXCEL}'.")
        logging.info("Asegúrate de cambiar 'RUTA_EXCEL' por el nombre real de tu archivo y que esté en la carpeta correcta.")