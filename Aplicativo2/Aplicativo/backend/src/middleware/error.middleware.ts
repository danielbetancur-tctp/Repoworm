import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { AppError } from '../types';

/** Mensajes de error de Multer traducidos al español */
const MULTER_ERROR_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: 'El archivo es demasiado grande. El tamaño máximo es 15 MB.',
  LIMIT_FILE_COUNT: 'Solo se puede subir un archivo a la vez.',
  LIMIT_UNEXPECTED_FILE: 'Campo de archivo inesperado. Use "image" como nombre del campo.',
  LIMIT_FIELD_KEY: 'El nombre del campo es demasiado largo.',
  LIMIT_FIELD_VALUE: 'El valor del campo es demasiado largo.',
  LIMIT_FIELD_COUNT: 'Demasiados campos en la solicitud.',
  LIMIT_PART_COUNT: 'Demasiadas partes en la solicitud multipart.',
};

/**
 * Middleware global de manejo de errores.
 * Debe ser el último middleware registrado en Express.
 */
export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Limpiar archivo temporal subido si existe
  if (req.file?.path) {
    try {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch {
      // Ignorar errores de limpieza
    }
  }

  // Errores operacionales conocidos (AppError)
  if (err instanceof AppError && err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // Errores de Multer
  if (err.name === 'MulterError') {
    const code = (err as any).code as string;
    res.status(400).json({
      success: false,
      error: MULTER_ERROR_MESSAGES[code] || err.message,
    });
    return;
  }

  // Errores inesperados (no revelar detalles internos en producción)
  console.error('[ErrorMiddleware] Error no controlado:', err.message, err.stack);
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor. Inténtelo nuevamente.',
  });
}
