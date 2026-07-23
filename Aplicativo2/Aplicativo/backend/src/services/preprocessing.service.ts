import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

import { AppError, PreprocessCliOutput, PreprocessImageData } from '../types';

/** Directorio donde vive el módulo Python de preprocesamiento. */
const PYTHON_DIR = path.join(__dirname, '..', '..', 'python');

/** Script CLI que ejecuta la limpieza de la imagen térmica. */
const CLI_SCRIPT = path.join(PYTHON_DIR, 'preprocess_image_cli.py');

/**
 * Ejecutable de Python. Configurable por entorno para soportar distintas
 * instalaciones (`python`, `python3`, ruta absoluta a un venv, etc.).
 * En Windows el binario habitual es `python`; en Linux/macOS `python3`.
 */
const PYTHON_BIN =
  process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');

/** Tiempo máximo de ejecución del proceso Python (ms). */
const PYTHON_TIMEOUT_MS = Number(process.env.PYTHON_TIMEOUT_MS) || 30_000;

/** Tamaño máximo de salida aceptado del proceso Python (protección de memoria). */
const MAX_STDOUT_BYTES = 25 * 1024 * 1024; // 25 MB de base64 es más que suficiente.

/**
 * Ejecuta el preprocesamiento (limpieza) de una imagen térmica invocando el
 * script Python `preprocess_image_cli.py` y devuelve la imagen limpia en
 * forma de *data URL* lista para mostrarse en la vista previa del frontend.
 *
 * Responsabilidad única: orquestar el proceso hijo de Python, validar su
 * resultado y traducirlo al contrato `PreprocessImageData`. No conoce nada
 * de HTTP ni de Express.
 *
 * @param imagePath Ruta absoluta de la imagen subida (temporal).
 * @param imageOriginalName Nombre original del archivo, para trazabilidad.
 * @throws {AppError} Si el entorno Python falla o la imagen no puede procesarse.
 */
export async function preprocessThermalImage(
  imagePath: string,
  imageOriginalName: string
): Promise<PreprocessImageData> {
  if (!imagePath || !existsSync(imagePath)) {
    throw new AppError('No se encontró la imagen a preprocesar en el servidor.', 400);
  }

  if (!existsSync(CLI_SCRIPT)) {
    throw new AppError(
      'El script de preprocesamiento (preprocess_image_cli.py) no está disponible en el servidor.',
      500
    );
  }

  const startTime = Date.now();
  const cliOutput = await runPythonCli(imagePath);

  if (!cliOutput.success) {
    // Error de negocio proveniente del preprocesamiento (imagen inválida, etc.).
    throw new AppError(
      cliOutput.error || 'No se pudo preprocesar la imagen térmica.',
      422
    );
  }

  const {
    cleanedImageBase64,
    format,
    width,
    height,
    originalWidth,
    originalHeight,
    artifactPixelRatio,
  } = cliOutput;

  if (!cleanedImageBase64 || !format) {
    throw new AppError(
      'El preprocesamiento no devolvió una imagen válida.',
      500
    );
  }

  const mime = format === 'png' ? 'image/png' : 'image/jpeg';

  return {
    cleanedImageDataUrl: `data:${mime};base64,${cleanedImageBase64}`,
    format,
    width: width ?? 0,
    height: height ?? 0,
    originalWidth: originalWidth ?? 0,
    originalHeight: originalHeight ?? 0,
    artifactPixelRatio: artifactPixelRatio ?? 0,
    imageName: imageOriginalName,
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Lanza el proceso Python y resuelve con su salida JSON parseada.
 * Encapsula el manejo de STDOUT/STDERR, el timeout y los errores de arranque.
 */
function runPythonCli(imagePath: string): Promise<PreprocessCliOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      PYTHON_BIN,
      [CLI_SCRIPT, '--input', imagePath, '--format', 'png'],
      { cwd: PYTHON_DIR, windowsHide: true }
    );

    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let settled = false;

    const finalizeError = (err: AppError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeAllListeners();
      try {
        child.kill();
      } catch {
        /* best-effort */
      }
      reject(err);
    };

    const timer = setTimeout(() => {
      finalizeError(
        new AppError(
          `El preprocesamiento superó el tiempo máximo de ${PYTHON_TIMEOUT_MS} ms.`,
          504
        )
      );
    }, PYTHON_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        finalizeError(
          new AppError('La salida del preprocesamiento excede el tamaño permitido.', 500)
        );
        return;
      }
      stdout += chunk.toString('utf-8');
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      // ENOENT => el ejecutable de Python no se encontró en el sistema.
      if (err.code === 'ENOENT') {
        finalizeError(
          new AppError(
            `No se encontró el ejecutable de Python ("${PYTHON_BIN}"). ` +
              'Instale Python 3 o configure la variable de entorno PYTHON_BIN.',
            500
          )
        );
        return;
      }
      finalizeError(
        new AppError(`No se pudo iniciar el preprocesamiento: ${err.message}`, 500)
      );
    });

    child.on('close', (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const parsed = tryParseJson(stdout);

      if (parsed) {
        // El script comunica éxito/fallo tanto por exit code como por `success`.
        resolve(parsed);
        return;
      }

      // No hubo JSON legible: fallo de bajo nivel (excepción no capturada,
      // dependencias faltantes, etc.). Se prioriza STDERR para diagnóstico.
      const detail = (stderr || stdout || '').trim().slice(0, 500);
      reject(
        new AppError(
          `El preprocesamiento falló (código ${code ?? 'desconocido'}).` +
            (detail ? ` Detalle: ${detail}` : ''),
          500
        )
      );
    });
  });
}

/** Intenta parsear la última línea no vacía de STDOUT como JSON del contrato. */
function tryParseJson(raw: string): PreprocessCliOutput | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // El CLI emite un único objeto JSON; si por algún log se antepusieran
  // líneas, tomamos la última línea no vacía que sea un objeto JSON válido.
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const candidate = lines[i].trim();
    if (!candidate.startsWith('{')) continue;
    try {
      const obj = JSON.parse(candidate) as PreprocessCliOutput;
      if (typeof obj.success === 'boolean') return obj;
    } catch {
      /* seguir intentando con líneas anteriores */
    }
  }

  return null;
}
