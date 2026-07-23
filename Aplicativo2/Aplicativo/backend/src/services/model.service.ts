import { existsSync, unlinkSync, readdirSync } from 'fs';
import path from 'path';
import * as ort from 'onnxruntime-node';

import {
  PredictionData,
  PredictionRequest,
  ModelType,
  ModelInfo,
  AppError,
} from '../types';
import { extractThermalFeatures } from './feature-extraction.service';

const MAX_GRAMS = 50.0;
const MODEL_DIR = path.join(__dirname, '..', '..', 'ModelosEntrenado');

export function getAvailableModels(): ModelInfo[] {
  if (!existsSync(MODEL_DIR)) return [];
  const files = readdirSync(MODEL_DIR).filter(f => f.endsWith('.onnx'));
  return files.map(f => ({
    id: f,
    name: f.replace('.onnx', ''),
    description: `Modelo ONNX cargado dinámicamente: ${f}`
  }));
}

export function validatePredictionRequest(
  modelType: unknown,
  realValueGrams: unknown,
  options: { skipModelCheck?: boolean } = {}
): { modelType: ModelType; realValueGrams: number | undefined } {
  // Cuando se usa un modelo personalizado (.onnx) no se valida contra el catálogo.
  if (!options.skipModelCheck) {
    const models = getAvailableModels().map(m => m.id);
    if (!modelType || !models.includes(modelType as string)) {
      throw new AppError(
        `Tipo de modelo inválido. Opciones: ${models.join(', ')}`,
        400
      );
    }
  }

  let realValue: number | undefined;
  if (realValueGrams !== undefined && realValueGrams !== null && realValueGrams !== '') {
    const parsed = parseFloat(realValueGrams as string);
    if (isNaN(parsed) || parsed < 0 || parsed > MAX_GRAMS * 3) {
      throw new AppError(
        `Valor real inválido. Debe ser un número entre 0 y ${MAX_GRAMS * 3} gramos.`,
        400
      );
    }
    realValue = parsed;
  }

  return { modelType: modelType as ModelType, realValueGrams: realValue };
}

export async function runPrediction(request: PredictionRequest): Promise<PredictionData> {
  const startTime = Date.now();
  // Un modelo personalizado subido por el usuario tiene prioridad sobre el integrado.
  const modelPath = request.customModelPath ?? path.join(MODEL_DIR, request.modelType);

  let predGrams = 0;
  
  try {
    // 1. Cargar el modelo ONNX
    const session = await ort.InferenceSession.create(modelPath);

    // 2. Nombre y forma de entrada esperada (leídos del propio modelo).
    const inputName = session.inputNames[0];
    // La dimensión de características se deriva de los METADATOS del modelo, no
    // del nombre del archivo. Así, cualquier modelo .onnx personalizado recibe
    // un tensor con la forma exacta que espera (evita el error "Got X Expected Y").
    const featureLength = resolveExpectedFeatureLength(session, inputName, request.modelType);

    // 3. Construir el vector de características de entrada.
    const envVars = [
      request.humedad_trama_pct ?? 0,
      request.temperatura_trama_c ?? 0,
      request.intensidad_uv_indice ?? 0,
      request.conductividad_trama_us_cm ?? 0,
      request.ph_trama ?? 0,
      request.nitrogeno_trama_mg_kg ?? 0,
      request.fosforo_trama_mg_kg ?? 0,
      request.potasio_trama_mg_kg ?? 0,
    ];

    // Características térmicas reales producidas por el MÓDULO DE PREPROCESAMIENTO
    // (Python). Es el punto donde el preprocesamiento se integra en la inferencia,
    // tanto para los modelos integrados como para los modelos .onnx personalizados.
    // La predicción SIEMPRE pasa por el preprocesamiento: si este no puede
    // ejecutarse, se propaga un error claro en lugar de inferir con datos crudos.
    const thermalFeatures = await extractThermalFeatures(request.imagePath);

    // Composición final: variables ambientales al inicio y el resto con las
    // características térmicas. Se ajusta exactamente a `featureLength` (se
    // trunca lo sobrante y se rellena con ceros lo faltante).
    const tensorData = new Float32Array(featureLength);
    let offset = 0;
    for (const value of envVars) {
      if (offset >= featureLength) break;
      tensorData[offset++] = value;
    }
    for (const value of thermalFeatures) {
      if (offset >= featureLength) break;
      tensorData[offset++] = value;
    }

    // 4. Inferencia
    try {
        const tensor = new ort.Tensor('float32', tensorData, [1, featureLength]);

        const feeds: Record<string, ort.Tensor> = {};
        feeds[inputName] = tensor;
        const results = await session.run(feeds);
        const outputName = session.outputNames[0];
        const outputTensor = results[outputName];

        predGrams = Number(outputTensor.data[0]);
    } catch(e: any) {
        // Si falló por mismatch de tensor, devolvemos el error de ONNX Runtime para que se sepa qué espera
        throw new Error("El modelo requiere otra forma de tensor: " + e.message);
    }

    if (isNaN(predGrams)) predGrams = 0;

  } catch (error: any) {
    throw new AppError(
      `Fallo en la inferencia ONNX: ${error.message || 'Error desconocido'}`,
      500
    );
  } finally {
    safeDeleteFile(request.imagePath);
    // Eliminar el modelo personalizado temporal si se usó uno.
    if (request.customModelPath) safeDeleteFile(request.customModelPath);
  }

  const densityPct = (predGrams / MAX_GRAMS) * 100;
  const processingTimeMs = Date.now() - startTime;

  const data: PredictionData = {
    prediction: { grams: Math.abs(predGrams), densityPct: Math.abs(densityPct) },
    estimatedCount: Math.round(Math.abs(predGrams) * 2.5),
    densityPerCm2: round2(Math.abs(densityPct) / 10),
    thermalMapBase64: '',
    sizeHistogram: { labels: [], values: [] },
    cumulativeData: { thresholds: [], counts: [] },
    imageResolution: 'generic',
    modelUsed: request.modelType,
    imageName: request.imageOriginalName,
    timestamp: new Date().toISOString(),
    processingTimeMs,
  };

  if (request.realValueGrams !== undefined) {
    const realGrams = request.realValueGrams;
    const realDensity = Math.min((realGrams / MAX_GRAMS) * 100, 100);
    data.realValue = { grams: realGrams, densityPct: realDensity };

    const errorGrams = predGrams - realGrams;
    const absError = Math.abs(errorGrams);
    data.metrics = {
      errorGrams: round2(errorGrams),
      absoluteErrorGrams: round2(absError),
    };
  }

  return data;
}

/**
 * Determina cuántas características (última dimensión concreta) espera la entrada
 * del modelo ONNX leyendo sus metadatos. Las dimensiones simbólicas/dinámicas
 * (p. ej. el tamaño de lote "N") se ignoran. Si no puede resolverse, recurre a
 * una heurística por compatibilidad con los modelos integrados históricos
 * (CatBoost → 71, resto → 40).
 */
function resolveExpectedFeatureLength(
  session: ort.InferenceSession,
  inputName: string,
  modelType: string
): number {
  const fallback = modelType.toLowerCase().includes('catboost') ? 71 : 40;

  try {
    const meta = (session as unknown as {
      inputMetadata?: Record<string, unknown> | Array<Record<string, unknown>>;
    }).inputMetadata;

    let entry: Record<string, unknown> | undefined;
    if (Array.isArray(meta)) {
      entry = meta.find((m) => m['name'] === inputName) ?? meta[0];
    } else if (meta) {
      entry = meta[inputName] as Record<string, unknown> | undefined;
    }

    const shape = (entry?.['shape'] ?? entry?.['dimensions']) as unknown;
    if (Array.isArray(shape) && shape.length > 0) {
      // Producto de las dimensiones concretas (> 0); las simbólicas se omiten.
      let product = 1;
      let concreteDims = 0;
      for (const dim of shape) {
        if (typeof dim === 'number' && Number.isFinite(dim) && dim > 0) {
          product *= dim;
          concreteDims += 1;
        }
      }
      if (concreteDims > 0 && product >= 1) return product;
    }
  } catch {
    // Metadatos no disponibles en esta versión de onnxruntime: usar heurística.
  }

  return fallback;
}

function safeDeleteFile(filePath: string): void {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {}
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
