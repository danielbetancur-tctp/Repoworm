import { Request, Response, NextFunction } from 'express';
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
export declare function preprocessImage(req: Request, res: Response, next: NextFunction): Promise<void>;
