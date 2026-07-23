import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import {
  runPrediction,
  validatePredictionRequest,
  getAvailableModels,
} from '../services/model.service';
import { AppError } from '../types';

/** Estructura de `req.files` cuando se usa `upload.fields()`. */
type MulterFilesByField = Record<string, Express.Multer.File[] | undefined>;

/**
 * GET /api/models
 * Lista los modelos ML disponibles con sus metadatos.
 */
export async function listModels(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const models = getAvailableModels();
    res.json({ success: true, data: models });
  } catch (err) {
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
export async function predict(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const files = (req.files as MulterFilesByField) ?? {};
  const imageFile = files['image']?.[0];
  const customModelFile = files['customModel']?.[0];

  try {
    if (!imageFile) {
      throw new AppError(
        'No se subió ninguna imagen. Use el campo "image" en el formulario multipart.',
        400
      );
    }

    // Determinar el modelo a usar: el personalizado tiene prioridad sobre el integrado.
    // Cuando hay modelo personalizado se omite la validación contra el catálogo.
    const skipModelCheck = !!customModelFile;
    const validated = validatePredictionRequest(
      skipModelCheck ? undefined : req.body.modelType,
      req.body.realValueGrams,
      { skipModelCheck }
    );

    const modelType = customModelFile ? customModelFile.originalname : validated.modelType;
    const customModelPath = customModelFile?.path;
    const { realValueGrams } = validated;

    const parseNum = (val: unknown): number | undefined =>
      val !== undefined && val !== null && val !== '' ? Number(val) : undefined;

    const result = await runPrediction({
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
  } catch (err) {
    next(err);
  } finally {
    // Limpieza defensiva: `runPrediction` ya borra los archivos en su `finally`,
    // pero si falló antes de llegar allí garantizamos no dejar residuos.
    safeUnlink(imageFile?.path);
    safeUnlink(customModelFile?.path);
  }
}

/** Elimina un archivo si aún existe, ignorando errores. */
function safeUnlink(filePath?: string): void {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Ignorar: la limpieza es best-effort.
  }
}
