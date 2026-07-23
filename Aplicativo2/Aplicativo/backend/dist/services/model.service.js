"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAvailableModels = getAvailableModels;
exports.validatePredictionRequest = validatePredictionRequest;
exports.runPrediction = runPrediction;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const ort = __importStar(require("onnxruntime-node"));
const types_1 = require("../types");
const feature_extraction_service_1 = require("./feature-extraction.service");
const MAX_GRAMS = 50.0;
const MODEL_DIR = path_1.default.join(__dirname, '..', '..', 'ModelosEntrenado');
function getAvailableModels() {
    if (!(0, fs_1.existsSync)(MODEL_DIR))
        return [];
    const files = (0, fs_1.readdirSync)(MODEL_DIR).filter(f => f.endsWith('.onnx'));
    return files.map(f => ({
        id: f,
        name: f.replace('.onnx', ''),
        description: `Modelo ONNX cargado dinámicamente: ${f}`
    }));
}
function validatePredictionRequest(modelType, realValueGrams, options = {}) {
    // Cuando se usa un modelo personalizado (.onnx) no se valida contra el catálogo.
    if (!options.skipModelCheck) {
        const models = getAvailableModels().map(m => m.id);
        if (!modelType || !models.includes(modelType)) {
            throw new types_1.AppError(`Tipo de modelo inválido. Opciones: ${models.join(', ')}`, 400);
        }
    }
    let realValue;
    if (realValueGrams !== undefined && realValueGrams !== null && realValueGrams !== '') {
        const parsed = parseFloat(realValueGrams);
        if (isNaN(parsed) || parsed < 0 || parsed > MAX_GRAMS * 3) {
            throw new types_1.AppError(`Valor real inválido. Debe ser un número entre 0 y ${MAX_GRAMS * 3} gramos.`, 400);
        }
        realValue = parsed;
    }
    return { modelType: modelType, realValueGrams: realValue };
}
async function runPrediction(request) {
    const startTime = Date.now();
    // Un modelo personalizado subido por el usuario tiene prioridad sobre el integrado.
    const modelPath = request.customModelPath ?? path_1.default.join(MODEL_DIR, request.modelType);
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
        const thermalFeatures = await (0, feature_extraction_service_1.extractThermalFeatures)(request.imagePath);
        // Composición final: variables ambientales al inicio y el resto con las
        // características térmicas. Se ajusta exactamente a `featureLength` (se
        // trunca lo sobrante y se rellena con ceros lo faltante).
        const tensorData = new Float32Array(featureLength);
        let offset = 0;
        for (const value of envVars) {
            if (offset >= featureLength)
                break;
            tensorData[offset++] = value;
        }
        for (const value of thermalFeatures) {
            if (offset >= featureLength)
                break;
            tensorData[offset++] = value;
        }
        // 4. Inferencia
        try {
            const tensor = new ort.Tensor('float32', tensorData, [1, featureLength]);
            const feeds = {};
            feeds[inputName] = tensor;
            const results = await session.run(feeds);
            const outputName = session.outputNames[0];
            const outputTensor = results[outputName];
            predGrams = Number(outputTensor.data[0]);
        }
        catch (e) {
            // Si falló por mismatch de tensor, devolvemos el error de ONNX Runtime para que se sepa qué espera
            throw new Error("El modelo requiere otra forma de tensor: " + e.message);
        }
        if (isNaN(predGrams))
            predGrams = 0;
    }
    catch (error) {
        throw new types_1.AppError(`Fallo en la inferencia ONNX: ${error.message || 'Error desconocido'}`, 500);
    }
    finally {
        safeDeleteFile(request.imagePath);
        // Eliminar el modelo personalizado temporal si se usó uno.
        if (request.customModelPath)
            safeDeleteFile(request.customModelPath);
    }
    const densityPct = (predGrams / MAX_GRAMS) * 100;
    const processingTimeMs = Date.now() - startTime;
    const data = {
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
function resolveExpectedFeatureLength(session, inputName, modelType) {
    const fallback = modelType.toLowerCase().includes('catboost') ? 71 : 40;
    try {
        const meta = session.inputMetadata;
        let entry;
        if (Array.isArray(meta)) {
            entry = meta.find((m) => m['name'] === inputName) ?? meta[0];
        }
        else if (meta) {
            entry = meta[inputName];
        }
        const shape = (entry?.['shape'] ?? entry?.['dimensions']);
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
            if (concreteDims > 0 && product >= 1)
                return product;
        }
    }
    catch {
        // Metadatos no disponibles en esta versión de onnxruntime: usar heurística.
    }
    return fallback;
}
function safeDeleteFile(filePath) {
    try {
        if ((0, fs_1.existsSync)(filePath))
            (0, fs_1.unlinkSync)(filePath);
    }
    catch { }
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
//# sourceMappingURL=model.service.js.map