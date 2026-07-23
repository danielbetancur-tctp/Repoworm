import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

import { AppError, FeatureExtractionCliOutput } from '../types';

/** Directorio donde vive el módulo Python de preprocesamiento. */
const PYTHON_DIR = path.join(__dirname, '..', '..', 'python');

/** Script CLI que extrae el vector de características térmicas. */
const CLI_SCRIPT = path.join(PYTHON_DIR, 'extract_features_cli.py');

/**
 * Ejecutable de Python. Configurable por entorno (`PYTHON_BIN`) para soportar
 * distintas instalaciones. En Windows el binario habitual es `python`.
 */
const PYTHON_BIN =
  process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');

/** Tiempo máximo de ejecución del proceso Python (ms). */
const PYTHON_TIMEOUT_MS = Number(process.env.PYTHON_TIMEOUT_MS) || 30_000;

/** Tamaño máximo de salida aceptado (protección de memoria). */
const MAX_STDOUT_BYTES = 25 * 1024 * 1024;

/**
 * Extrae el vector de características térmicas de una imagen invocando el
 * módulo de preprocesamiento (`extract_features_cli.py`). Este vector es la
 * base numérica que alimenta al modelo ONNX durante la predicción, tanto para
 * los modelos integrados como para modelos personalizados.
 *
 * Responsabilidad única: orquestar el proceso Python y devolver el vector de
 * características. No conoce nada de ONNX ni de HTTP.
 *
 * @param imagePath Ruta absoluta de la imagen a procesar.
 * @returns Vector de características (floats finitos, sin NaN/inf).
 * @throws {AppError} Si el entorno Python falla o la imagen no puede procesarse.
 */
export async function extractThermalFeatures(imagePath: string): Promise<number[]> {
  if (!imagePath || !existsSync(imagePath)) {
    throw new AppError('No se encontró la imagen para extraer características.', 400);
  }

  if (!existsSync(CLI_SCRIPT)) {
    throw new AppError(
      'El script de extracción de características (extract_features_cli.py) no está disponible.',
      500
    );
  }

  const output = await runPythonCli(imagePath);

  if (!output.success) {
    throw new AppError(
      output.error || 'No se pudieron extraer las características de la imagen.',
      422
    );
  }

  if (!Array.isArray(output.features) || output.features.length === 0) {
    throw new AppError('La extracción de características no devolvió datos válidos.', 500);
  }

  // Blindaje adicional: garantizamos números finitos en el lado de Node.
  return output.features.map((v) => {
    const num = Number(v);
    return Number.isFinite(num) ? num : 0;
  });
}

/** Lanza el proceso Python y resuelve con su salida JSON parseada. */
function runPythonCli(imagePath: string): Promise<FeatureExtractionCliOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [CLI_SCRIPT, '--input', imagePath], {
      cwd: PYTHON_DIR,
      windowsHide: true,
    });

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
          `La extracción de características superó el tiempo máximo de ${PYTHON_TIMEOUT_MS} ms.`,
          504
        )
      );
    }, PYTHON_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        finalizeError(
          new AppError('La salida de la extracción excede el tamaño permitido.', 500)
        );
        return;
      }
      stdout += chunk.toString('utf-8');
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
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
        new AppError(`No se pudo iniciar la extracción de características: ${err.message}`, 500)
      );
    });

    child.on('close', (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const parsed = tryParseJson(stdout);
      if (parsed) {
        resolve(parsed);
        return;
      }

      const detail = (stderr || stdout || '').trim().slice(0, 500);
      reject(
        new AppError(
          `La extracción de características falló (código ${code ?? 'desconocido'}).` +
            (detail ? ` Detalle: ${detail}` : ''),
          500
        )
      );
    });
  });
}

/** Intenta parsear la última línea no vacía de STDOUT como JSON del contrato. */
function tryParseJson(raw: string): FeatureExtractionCliOutput | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const candidate = lines[i].trim();
    if (!candidate.startsWith('{')) continue;
    try {
      const obj = JSON.parse(candidate) as FeatureExtractionCliOutput;
      if (typeof obj.success === 'boolean') return obj;
    } catch {
      /* seguir intentando */
    }
  }
  return null;
}
