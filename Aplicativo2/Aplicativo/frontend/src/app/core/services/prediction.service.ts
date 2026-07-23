import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  ApiResponse,
  ModelInfo,
  ModelType,
  PredictionData,
  PredictOptions,
  PreprocessImageData,
} from '../models/prediction.model';

/** Límite de tamaño para el modelo ONNX personalizado (debe coincidir con el backend). */
const MAX_CUSTOM_MODEL_MB = 50;

@Injectable({ providedIn: 'root' })
export class PredictionService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  /**
   * Obtiene la lista de modelos disponibles desde el backend.
   */
  getModels(): Observable<ModelInfo[]> {
    return this.http.get<ApiResponse<ModelInfo[]>>(`${this.apiUrl}/models`).pipe(
      map((res) => {
        if (!res.success || !res.data) throw new Error(res.error || 'Sin datos');
        return res.data;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Envía la imagen al backend para ejecutar la predicción.
   *
   * Si se proporciona un modelo personalizado (.onnx) en `options.customModelFile`,
   * este tiene prioridad y `modelType` se ignora en el servidor.
   *
   * @param imageFile Archivo de imagen térmica seleccionado por el usuario
   * @param modelType Identificador del modelo integrado a usar (opcional si hay modelo personalizado)
   * @param options   Valor real, variables ambientales y/o modelo personalizado
   */
  predict(
    imageFile: File,
    modelType: ModelType | null,
    options: PredictOptions = {}
  ): Observable<PredictionData> {
    const { realValueGrams, envData, customModelFile } = options;

    // Validación defensiva en cliente antes de la llamada de red.
    if (customModelFile) {
      if (!customModelFile.name.toLowerCase().endsWith('.onnx')) {
        return throwError(() => new Error('El modelo personalizado debe tener extensión .onnx'));
      }
      if (customModelFile.size > MAX_CUSTOM_MODEL_MB * 1024 * 1024) {
        return throwError(
          () => new Error(`El modelo personalizado supera el máximo de ${MAX_CUSTOM_MODEL_MB} MB.`)
        );
      }
    } else if (!modelType) {
      return throwError(
        () => new Error('Debe seleccionar un modelo integrado o subir un modelo personalizado.')
      );
    }

    const formData = new FormData();
    formData.append('image', imageFile, imageFile.name);

    if (customModelFile) {
      formData.append('customModel', customModelFile, customModelFile.name);
    } else if (modelType) {
      formData.append('modelType', modelType);
    }

    if (realValueGrams !== undefined && realValueGrams !== null) {
      formData.append('realValueGrams', String(realValueGrams));
    }

    if (envData) {
      Object.entries(envData).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          formData.append(key, String(value));
        }
      });
    }

    return this.http.post<ApiResponse<PredictionData>>(`${this.apiUrl}/predict`, formData).pipe(
      map((res) => {
        if (!res.success || !res.data) {
          throw new Error(res.error || 'Error en la predicción');
        }
        return res.data;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Envía la imagen térmica al backend para su preprocesamiento (limpieza:
   * recorte FLIR + remoción de artefactos) y devuelve la imagen resultante
   * lista para mostrarse en la "Vista previa".
   *
   * Este paso es independiente de la predicción y no ejecuta ningún modelo.
   *
   * @param imageFile Imagen térmica seleccionada por el usuario.
   */
  preprocessImage(imageFile: File): Observable<PreprocessImageData> {
    if (!imageFile || imageFile.size === 0) {
      return throwError(() => new Error('La imagen a preprocesar no es válida.'));
    }

    const formData = new FormData();
    formData.append('image', imageFile, imageFile.name);

    return this.http
      .post<ApiResponse<PreprocessImageData>>(`${this.apiUrl}/preprocess`, formData)
      .pipe(
        map((res) => {
          if (!res.success || !res.data) {
            throw new Error(res.error || 'No se pudo preprocesar la imagen.');
          }
          return res.data;
        }),
        catchError(this.handleError)
      );
  }

  /** Transforma errores HTTP a mensajes legibles */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let message = 'Error de conexión con el servidor';

    if (error.error instanceof ErrorEvent) {
      message = `Error de red: ${error.error.message}`;
    } else if (error.error?.error) {
      message = error.error.error;
    } else if (error.status === 0) {
      message = 'No se puede conectar al servidor. Verifique que el backend esté corriendo.';
    } else if (error.status === 413) {
      message = 'La imagen es demasiado grande. El límite es 15 MB.';
    } else if (error.status === 400) {
      message = error.error?.error || 'Solicitud inválida';
    } else if (error.status === 500) {
      message = error.error?.error || 'Error interno del servidor';
    }

    return throwError(() => new Error(message));
  }
}
