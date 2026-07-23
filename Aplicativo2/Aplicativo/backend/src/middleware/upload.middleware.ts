import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';
import { AppError } from '../types';

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

/** Extensiones de archivo aceptadas por campo del formulario multipart */
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.bmp']);
const MODEL_EXTENSIONS = new Set(['.onnx']);

/** Límite global de tamaño (el modelo personalizado puede pesar hasta 50 MB). */
const MAX_FILE_SIZE_MB = 50;

/** Almacenamiento en disco con nombre UUID para evitar colisiones */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

/**
 * Filtro de archivos: valida la extensión según el campo del formulario.
 *   - `image`       → imágenes térmicas (JPG, PNG, TIFF, BMP)
 *   - `customModel` → modelo ONNX personalizado (.onnx)
 */
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (file.fieldname === 'image') {
    if (IMAGE_EXTENSIONS.has(ext)) return cb(null, true);
    return cb(
      new AppError(
        `Imagen no permitida. Formatos aceptados: JPG, PNG, TIFF, BMP. Recibido: ${file.originalname}`,
        400
      )
    );
  }

  if (file.fieldname === 'customModel') {
    if (MODEL_EXTENSIONS.has(ext)) return cb(null, true);
    return cb(
      new AppError(
        `Modelo personalizado no válido. Solo se acepta el formato .onnx. Recibido: ${file.originalname}`,
        400
      )
    );
  }

  // Campo desconocido: rechazar por seguridad.
  cb(new AppError(`Campo de archivo no soportado: ${file.fieldname}`, 400));
};

/**
 * Instancia de Multer que acepta la imagen (obligatoria) y, opcionalmente,
 * un modelo ONNX personalizado. Se expone mediante `.fields()`.
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 2,
  },
});

/** Middleware listo para la ruta de predicción (imagen + modelo opcional). */
export const uploadPredictionFiles = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'customModel', maxCount: 1 },
]);

/**
 * Middleware para la ruta de preprocesamiento: acepta únicamente la imagen
 * térmica en el campo `image`. Deja el archivo disponible en `req.file`.
 */
export const uploadSingleImage = upload.single('image');
