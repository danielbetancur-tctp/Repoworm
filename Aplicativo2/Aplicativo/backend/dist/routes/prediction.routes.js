"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.predictionRoutes = void 0;
const express_1 = require("express");
const upload_middleware_1 = require("../middleware/upload.middleware");
const prediction_controller_1 = require("../controllers/prediction.controller");
const preprocessing_controller_1 = require("../controllers/preprocessing.controller");
exports.predictionRoutes = (0, express_1.Router)();
/** GET /api/models → Lista de modelos disponibles */
exports.predictionRoutes.get('/models', prediction_controller_1.listModels);
/** POST /api/preprocess → Limpieza de la imagen térmica para la vista previa */
exports.predictionRoutes.post('/preprocess', upload_middleware_1.uploadSingleImage, preprocessing_controller_1.preprocessImage);
/** POST /api/predict → Ejecutar predicción de densidad (imagen + modelo opcional) */
exports.predictionRoutes.post('/predict', upload_middleware_1.uploadPredictionFiles, prediction_controller_1.predict);
//# sourceMappingURL=prediction.routes.js.map