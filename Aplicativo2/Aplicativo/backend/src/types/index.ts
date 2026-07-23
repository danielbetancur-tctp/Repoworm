/** Tipos de modelo disponibles para predicción */
export type ModelType = string;

/** Resultado central de predicción */
export interface PredictionResult {
  grams: number;
  densityPct: number;
}

/** Métricas de error cuando se provee valor real */
export interface PredictionMetrics {
  errorGrams: number;
  absoluteErrorGrams: number;
}

/** Datos del histograma de tamaños para Chart.js */
export interface HistogramData {
  labels: string[];
  values: number[];
}

/** Datos del gráfico acumulado vs umbral para Chart.js */
export interface CumulativeData {
  thresholds: number[];
  counts: number[];
}

/** Datos completos retornados por el backend tras la predicción */
export interface PredictionData {
  // Predicción principal
  prediction: PredictionResult;
  realValue?: PredictionResult;
  metrics?: PredictionMetrics;

  // Estimaciones biológicas derivadas
  estimatedCount: number;
  densityPerCm2: number;

  // Datos para gráficas en el frontend
  thermalMapBase64: string;
  sizeHistogram: HistogramData;
  cumulativeData: CumulativeData;

  // Metadatos
  imageResolution: string;
  modelUsed: ModelType;
  imageName: string;
  timestamp: string;
  processingTimeMs: number;
}

/** Sobre estándar de respuesta de la API */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Salida raw del script Python de inferencia */
export interface PythonScriptOutput {
  success: boolean;
  prediction_grams?: number;
  density_pct?: number;
  estimated_count?: number;
  density_per_cm2?: number;
  confidence_pct?: number;
  thermal_map_base64?: string;
  size_histogram?: HistogramData;
  cumulative_data?: CumulativeData;
  image_resolution?: string;
  error?: string;
  traceback?: string;
}

/**
 * Salida cruda del script Python `preprocess_image_cli.py`.
 * Se corresponde 1:1 con el contrato JSON documentado en dicho script.
 */
export interface PreprocessCliOutput {
  success: boolean;
  cleanedImageBase64?: string;
  format?: 'png' | 'jpg';
  width?: number;
  height?: number;
  originalWidth?: number;
  originalHeight?: number;
  artifactPixelRatio?: number;
  error?: string;
  traceback?: string;
}

/**
 * Salida cruda del script Python `extract_features_cli.py`.
 * Contiene el vector numérico de características térmicas extraídas por el
 * módulo de preprocesamiento, listo para construir el tensor de entrada ONNX.
 */
export interface FeatureExtractionCliOutput {
  success: boolean;
  features?: number[];
  featureNames?: string[];
  count?: number;
  error?: string;
  traceback?: string;
}

/**
 * Datos de la imagen térmica ya preprocesada (limpia) que la API devuelve
 * al frontend para mostrarla en la "Vista previa".
 */
export interface PreprocessImageData {
  /** Data URL lista para asignar a un <img src>. */
  cleanedImageDataUrl: string;
  /** Formato de la imagen limpia. */
  format: 'png' | 'jpg';
  /** Dimensiones de la imagen limpia (tras el recorte FLIR). */
  width: number;
  height: number;
  /** Dimensiones de la imagen original subida. */
  originalWidth: number;
  originalHeight: number;
  /** Proporción de píxeles marcados como artefacto (0..1). */
  artifactPixelRatio: number;
  /** Nombre original del archivo subido. */
  imageName: string;
  /** Milisegundos empleados en el preprocesamiento. */
  processingTimeMs: number;
}

/** Descriptor de modelo para el endpoint de listado */
export interface ModelInfo {
  id: ModelType;
  name: string;
  description: string;
}

export interface PredictionRequest {
  modelType: ModelType;
  /** Ruta a un modelo ONNX personalizado subido por el usuario (tiene prioridad). */
  customModelPath?: string;
  imagePath: string;
  imageOriginalName: string;
  realValueGrams?: number;
  humedad_trama_pct?: number;
  temperatura_trama_c?: number;
  intensidad_uv_indice?: number;
  conductividad_trama_us_cm?: number;
  ph_trama?: number;
  nitrogeno_trama_mg_kg?: number;
  fosforo_trama_mg_kg?: number;
  potasio_trama_mg_kg?: number;
}

/** Error personalizado con código HTTP */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
