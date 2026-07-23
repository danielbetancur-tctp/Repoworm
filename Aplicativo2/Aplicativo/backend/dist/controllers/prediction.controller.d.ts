import { Request, Response, NextFunction } from 'express';
/**
 * GET /api/models
 * Lista los modelos ML disponibles con sus metadatos.
 */
export declare function listModels(_req: Request, res: Response, next: NextFunction): Promise<void>;
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
export declare function predict(req: Request, res: Response, next: NextFunction): Promise<void>;
