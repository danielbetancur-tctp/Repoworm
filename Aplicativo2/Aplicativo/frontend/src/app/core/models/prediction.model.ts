/** Tipos de modelo disponibles */
export type ModelType = string;

export interface EnvironmentalData {
  humedad_trama_pct?: number;
  temperatura_trama_c?: number;
  intensidad_uv_indice?: number;
  conductividad_trama_us_cm?: number;
  ph_trama?: number;
  nitrogeno_trama_mg_kg?: number;
  fosforo_trama_mg_kg?: number;
  potasio_trama_mg_kg?: number;
}

/** Claves de las variables ambientales (útil para iterar de forma segura). */
export type EnvironmentalKey = keyof EnvironmentalData;

/**
 * Opciones para ejecutar una predicción. Un modelo personalizado (.onnx)
 * subido por el usuario tiene prioridad sobre el modelo integrado.
 */
export interface PredictOptions {
  realValueGrams?: number;
  envData?: EnvironmentalData;
  customModelFile?: File | null;
}

export interface PredictionResult {
  grams: number;
  densityPct: number;
}

export interface PredictionMetrics {
  errorGrams: number;
  absoluteErrorGrams: number;
}

export interface HistogramData {
  labels: string[];
  values: number[];
}

export interface CumulativeData {
  thresholds: number[];
  counts: number[];
}

/** Datos completos retornados por el backend */
export interface PredictionData {
  prediction: PredictionResult;
  realValue?: PredictionResult;
  metrics?: PredictionMetrics;
  estimatedCount: number;
  densityPerCm2: number;
  thermalMapBase64: string;
  sizeHistogram: HistogramData;
  cumulativeData: CumulativeData;
  imageResolution: string;
  modelUsed: ModelType;
  imageName: string;
  timestamp: string;
  processingTimeMs: number;
}

/**
 * Resultado del preprocesamiento (limpieza) de la imagen térmica.
 * `cleanedImageDataUrl` es una data URL lista para un <img src>.
 */
export interface PreprocessImageData {
  cleanedImageDataUrl: string;
  format: 'png' | 'jpg';
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  artifactPixelRatio: number;
  imageName: string;
  processingTimeMs: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ModelInfo {
  id: ModelType;
  name: string;
  description: string;
}

export type NavTab = 'probar' | 'resultados' | 'contexto' | 'acerca';
