import { Router } from 'express';
import { uploadPredictionFiles, uploadSingleImage } from '../middleware/upload.middleware';
import { predict, listModels } from '../controllers/prediction.controller';
import { preprocessImage } from '../controllers/preprocessing.controller';

export const predictionRoutes = Router();

/** GET /api/models → Lista de modelos disponibles */
predictionRoutes.get('/models', listModels);

/** POST /api/preprocess → Limpieza de la imagen térmica para la vista previa */
predictionRoutes.post('/preprocess', uploadSingleImage, preprocessImage);

/** POST /api/predict → Ejecutar predicción de densidad (imagen + modelo opcional) */
predictionRoutes.post('/predict', uploadPredictionFiles, predict);
