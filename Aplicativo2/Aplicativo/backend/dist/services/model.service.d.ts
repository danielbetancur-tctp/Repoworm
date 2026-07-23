import { PredictionData, PredictionRequest, ModelType, ModelInfo } from '../types';
export declare function getAvailableModels(): ModelInfo[];
export declare function validatePredictionRequest(modelType: unknown, realValueGrams: unknown, options?: {
    skipModelCheck?: boolean;
}): {
    modelType: ModelType;
    realValueGrams: number | undefined;
};
export declare function runPrediction(request: PredictionRequest): Promise<PredictionData>;
