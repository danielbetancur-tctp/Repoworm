import { Request, Response, NextFunction } from 'express';
import fs from 'fs';

import { preprocessThermalImage } from '../services/preprocessing.service';
import { AppError } from '../types';

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
export async function preprocessImage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const imageFile = req.file;

  try {
    if (!imageFile) {
      throw new AppError(
        'No se subió ninguna imagen. Use el campo "image" en el formulario multipart.',
        400
      );
    }

    const data = await preprocessThermalImage(imageFile.path, imageFile.originalname);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  } finally {
    // La imagen subida es temporal: se elimina siempre tras procesarla.
    safeUnlink(imageFile?.path);
  }
}

/** Elimina un archivo si aún existe, ignorando errores (limpieza best-effort). */
function safeUnlink(filePath?: string): void {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Ignorar: la limpieza es best-effort.
  }
}
