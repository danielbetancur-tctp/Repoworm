# CatBoost Multimodal Pipeline - Documentacion Tecnica

## Descripcion General
El script `CatBoostRefactorizado.py` implementa un pipeline de Machine Learning Multimodal disenado para predecir la densidad poblacional de lombrices (gramos) en camas de sustrato. Utiliza un enfoque de fusion de datos (Data Fusion) que combina caracteristicas extraidas de imagenes termicas y datos tabulares fisico-quimicos.

## Fundamentos del Modelo: CatBoost

### ¿Que es CatBoost y como funciona?
CatBoost (Categorical Boosting) es un algoritmo avanzado de aprendizaje automatico de codigo abierto basado en Gradient Boosting sobre arboles de decision. A diferencia de modelos mas antiguos:
- Construye arboles de decision de forma secuencial, donde cada nuevo arbol intenta corregir los errores residuales cometidos por los arboles anteriores.
- Emplea arboles simetricos (oblivious trees), lo que reduce drasticamente el riesgo de sobreajuste (overfitting), un factor critico cuando se trabaja con conjuntos de datos experimentales pequenos.
- Posee manejo nativo de variables categoricas, procesando cadenas de texto de forma directa sin requerir transformaciones destructivas como el One-Hot Encoding.

### Aplicacion en el Codigo
En este proyecto, CatBoost se implementa a traves de la clase `WormDensityPredictor` utilizando la variante `CatBoostRegressor`, ya que el objetivo es predecir un valor continuo (gramos de biomasa) y no una clase discreta.
- **Parametros defensivos:** Dada la escasez de muestras (26 capturas), el modelo se configura con alta regularizacion L2 (`l2_leaf_reg=5`) y baja profundidad de arboles (`depth=3`) para forzar al algoritmo a aprender patrones generales en lugar de memorizar el ruido de los datos.
- **Estrategia LOOCV:** Se implementa el metodo Leave-One-Out Cross-Validation. El modelo se entrena 26 veces; en cada iteracion utiliza 25 capturas para aprender y la imagen restante para evaluarse. Esto maximiza el uso de la informacion disponible y asegura que las metricas obtenidas sean estadisticamente honestas y defendibles.

## Procesamiento de Datos y Arquitectura

### 1. Carga y Procesamiento de Imagenes Termicas (`ThermalFeatureExtractor`)
El flujo de imagenes sigue un proceso estricto para garantizar su integridad:
- **Carga y Sincronizacion:** La funcion `cargar_imagenes_termicas` utiliza expresiones regulares para analizar las nomenclaturas de los archivos (formato `T<gramos>G-<iteracion>.jpg`). Este proceso asegura un ordenamiento estrictamente numerico (ej. aislando los valores "20" y "3" del archivo `T20G-3.jpg`), lo que garantiza que cada imagen se acople matematicamente 1 a 1 con su fila correspondiente en el archivo de Excel, previniendo los tipicos fallos del ordenamiento alfabetico de los sistemas operativos.
- **Extraccion de Caracteristicas (Vision Computacional):** Cada imagen termica (matriz 2D de temperaturas) se procesa para extraer datos cuantificables:
  - Calculos Vectorizados: Se utiliza `numpy` para extraer estadisticas descriptivas y percentiles termicos (p25, p50, p75, p90) de manera matricial.
  - Analisis de Textura: Se emplea `scikit-image` para calcular matrices GLCM (Gray-Level Co-Occurrence Matrix) y LBP (Local Binary Patterns), capturando asi la granularidad y variacion de las firmas de calor producidas por la aglomeracion de las lombrices.
  - Segmentacion Dinamica: El algoritmo de clustering `KMeans` agrupa areas de temperatura similar para estimar el tamano promedio de los cumulos biologicos.

### 2. Carga y Procesamiento de Datos Tabulares (`TabularPreprocessor`)
La data fisico-quimica del sustrato se extrae de hojas de calculo y se refina antes de la fusion:
- **Lectura y Merge:** Se utiliza `pandas` para leer el archivo `datos_tramos.xlsx`. Las lecturas individuales correspondientes a cada toma (ubicadas en la hoja `Datos extraidos`) se fusionan dinamicamente con los promedios globales de esa etapa (ubicados en la hoja `Resumen por peso`) usando la variable objetivo como clave principal de union.
- **Ingenieria de Variables (Feature Engineering):** El modulo `TabularPreprocessor` enriquece los datos base:
  - Aplica imputacion mediante la mediana para rellenar valores faltantes (NaN) sin sesgar las medias poblacionales.
  - Genera nuevas metricas estructuradas a traves de asignaciones simultaneas, creando ratios quimicos criticos (como la relacion Nitrogeno-Fosforo `ratio_n_p`) y un Indice Termico-Hidrico compuesto.

### 3. Fusion Multimodal y Orquestacion
Una vez procesadas ambas fuentes, la funcion `run_experiment_pipeline` ejecuta la "Fusion Temprana":
- Concatena de forma horizontal la matriz generada por la vision termica con el DataFrame tabular ya limpio.
- Detecta y protege dinamicamente las columnas de texto (categorias object/category), iterando sobre ellas para inyectar un valor por defecto en los vacios e instruyendo a CatBoost sobre su naturaleza categorica.
- Ejecuta el entrenamiento y retorna el modelo entrenado junto a sus predicciones de validacion cruzada.

## Visualizacion de Resultados
El script finaliza su ejecucion generando un reporte visual consolidado mediante `seaborn` y `matplotlib`:
- **Regresion Lineal:** Un grafico de dispersion que detalla la adherencia de las predicciones del modelo a la linea de verdad absoluta (Linea Ideal).
- **Distribucion de Densidad:** Un grafico hibrido de Violin y Swarm que aisla y analiza de forma transparente la varianza interna (dudas del modelo) para cada iteracion en cada nivel especifico de gramaje.

## Requisitos del Entorno (Dependencias)
- `numpy`, `pandas` (Manejo matricial y tabular)
- `scikit-learn` (Metricas de error y validacion CV)
- `scikit-image` (Extraccion avanzada de texturas)
- `scipy` (Momentos estadisticos como Skewness y Kurtosis)
- `catboost` (Algoritmo predictivo base)
- `matplotlib`, `seaborn` (Generacion de graficas y ploteo)
