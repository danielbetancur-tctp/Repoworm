"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadSingleImage = exports.uploadPredictionFiles = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const types_1 = require("../types");
const UPLOADS_DIR = path_1.default.join(__dirname, '..', '..', 'uploads');
/** Extensiones de archivo aceptadas por campo del formulario multipart */
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.bmp']);
const MODEL_EXTENSIONS = new Set(['.onnx']);
/** Límite global de tamaño (el modelo personalizado puede pesar hasta 50 MB). */
const MAX_FILE_SIZE_MB = 50;
/** Almacenamiento en disco con nombre UUID para evitar colisiones */
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        cb(null, `${(0, uuid_1.v4)()}${ext}`);
    },
});
/**
 * Filtro de archivos: valida la extensión según el campo del formulario.
 *   - `image`       → imágenes térmicas (JPG, PNG, TIFF, BMP)
 *   - `customModel` → modelo ONNX personalizado (.onnx)
 */
const fileFilter = (_req, file, cb) => {
    const ext = path_1.default.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'image') {
        if (IMAGE_EXTENSIONS.has(ext))
            return cb(null, true);
        return cb(new types_1.AppError(`Imagen no permitida. Formatos aceptados: JPG, PNG, TIFF, BMP. Recibido: ${file.originalname}`, 400));
    }
    if (file.fieldname === 'customModel') {
        if (MODEL_EXTENSIONS.has(ext))
            return cb(null, true);
        return cb(new types_1.AppError(`Modelo personalizado no válido. Solo se acepta el formato .onnx. Recibido: ${file.originalname}`, 400));
    }
    // Campo desconocido: rechazar por seguridad.
    cb(new types_1.AppError(`Campo de archivo no soportado: ${file.fieldname}`, 400));
};
/**
 * Instancia de Multer que acepta la imagen (obligatoria) y, opcionalmente,
 * un modelo ONNX personalizado. Se expone mediante `.fields()`.
 */
exports.upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
        files: 2,
    },
});
/** Middleware listo para la ruta de predicción (imagen + modelo opcional). */
exports.uploadPredictionFiles = exports.upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'customModel', maxCount: 1 },
]);
/**
 * Middleware para la ruta de preprocesamiento: acepta únicamente la imagen
 * térmica en el campo `image`. Deja el archivo disponible en `req.file`.
 */
exports.uploadSingleImage = exports.upload.single('image');
//# sourceMappingURL=upload.middleware.js.map