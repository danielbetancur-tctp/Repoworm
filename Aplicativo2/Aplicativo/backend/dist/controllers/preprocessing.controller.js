"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.preprocessImage = preprocessImage;
const fs_1 = __importDefault(require("fs"));
const preprocessing_service_1 = require("../services/preprocessing.service");
const types_1 = require("../types");
/**
 * POST /api/preprocess
 * Ejecuta la limpieza (preprocesamiento) de una imagen térmica y devuelve la
 * imagen resultante en base64 (data URL) para mostrarla en la "Vista previa".
 *
 * Body (multipart/form-data):
 *   - image: File   Imagen térmica (JPG, PNG, TIFF, BMP) — obligatoria
 *
 * No ejecuta ninguna predicción: es un paso previo e independiente.
 */
async function preprocessImage(req, res, next) {
    const imageFile = req.file;
    try {
        if (!imageFile) {
            throw new types_1.AppError('No se subió ninguna imagen. Use el campo "image" en el formulario multipart.', 400);
        }
        const data = await (0, preprocessing_service_1.preprocessThermalImage)(imageFile.path, imageFile.originalname);
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
    finally {
        // La imagen subida es temporal: se elimina siempre tras procesarla.
        safeUnlink(imageFile?.path);
    }
}
/** Elimina un archivo si aún existe, ignorando errores (limpieza best-effort). */
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
//# sourceMappingURL=preprocessing.controller.js.map