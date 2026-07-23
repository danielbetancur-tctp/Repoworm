"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listModels = listModels;
exports.predict = predict;
const fs_1 = __importDefault(require("fs"));
const model_service_1 = require("../services/model.service");
const types_1 = require("../types");
/**
 * GET /api/models
 * Lista los modelos ML disponibles con sus metadatos.
 */
async function listModels(_req, res, next) {
    try {
        const models = (0, model_service_1.getAvailableModels)();
        res.json({ success: true, data: models });
    }
    catch (err) {
        next(err);
    }
}
/**
 * POST /api/predict
 * Ejecuta la predicción de densidad de lombrices sobre la imagen subida.
 *
 * Body (multipart/form-data):
 *   - image: File          Imagen térmica (JPG, PNG, TIFF, BMP) — obligatoria
 *   - customModel: File?   Modelo ONNX personalizado (.onnx) — opcional
 *   - modelType: string?   Modelo integrado a usar (ignorado si hay customModel)
 *   - realValueGrams: number? Valor real opcional para comparación
 *   - variables ambientales opcionales (humedad_trama_pct, etc.)
 */
async function predict(req, res, next) {
    const files = req.files ?? {};
    const imageFile = files['image']?.[0];
    const customModelFile = files['customModel']?.[0];
    try {
        if (!imageFile) {
            throw new types_1.AppError('No se subió ninguna imagen. Use el campo "image" en el formulario multipart.', 400);
        }
        // Determinar el modelo a usar: el personalizado tiene prioridad sobre el integrado.
        // Cuando hay modelo personalizado se omite la validación contra el catálogo.
        const skipModelCheck = !!customModelFile;
        const validated = (0, model_service_1.validatePredictionRequest)(skipModelCheck ? undefined : req.body.modelType, req.body.realValueGrams, { skipModelCheck });
        const modelType = customModelFile ? customModelFile.originalname : validated.modelType;
        const customModelPath = customModelFile?.path;
        const { realValueGrams } = validated;
        const parseNum = (val) => val !== undefined && val !== null && val !== '' ? Number(val) : undefined;
        const result = await (0, model_service_1.runPrediction)({
            modelType,
            customModelPath,
            imagePath: imageFile.path,
            imageOriginalName: imageFile.originalname,
            realValueGrams,
            humedad_trama_pct: parseNum(req.body.humedad_trama_pct),
            temperatura_trama_c: parseNum(req.body.temperatura_trama_c),
            intensidad_uv_indice: parseNum(req.body.intensidad_uv_indice),
            conductividad_trama_us_cm: parseNum(req.body.conductividad_trama_us_cm),
            ph_trama: parseNum(req.body.ph_trama),
            nitrogeno_trama_mg_kg: parseNum(req.body.nitrogeno_trama_mg_kg),
            fosforo_trama_mg_kg: parseNum(req.body.fosforo_trama_mg_kg),
            potasio_trama_mg_kg: parseNum(req.body.potasio_trama_mg_kg),
        });
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
    finally {
        // Limpieza defensiva: `runPrediction` ya borra los archivos en su `finally`,
        // pero si falló antes de llegar allí garantizamos no dejar residuos.
        safeUnlink(imageFile?.path);
        safeUnlink(customModelFile?.path);
    }
}
/** Elimina un archivo si aún existe, ignorando errores. */
function safeUnlink(filePath) {
    if (!filePath)
        return;
    try {
        if (fs_1.default.existsSync(filePath))
            fs_1.default.unlinkSync(filePath);
    }
    catch {
        // Ignorar: la limpieza es best-effort.
    }
}
//# sourceMappingURL=prediction.controller.js.map