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
export declare function extractThermalFeatures(imagePath: string): Promise<number[]>;
