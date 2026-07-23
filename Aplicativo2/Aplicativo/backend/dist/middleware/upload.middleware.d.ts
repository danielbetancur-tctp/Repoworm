import multer from 'multer';
/**
 * Instancia de Multer que acepta la imagen (obligatoria) y, opcionalmente,
 * un modelo ONNX personalizado. Se expone mediante `.fields()`.
 */
export declare const upload: multer.Multer;
/** Middleware listo para la ruta de predicción (imagen + modelo opcional). */
export declare const uploadPredictionFiles: import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
/**
 * Middleware para la ruta de preprocesamiento: acepta únicamente la imagen
 * térmica en el campo `image`. Deja el archivo disponible en `req.file`.
 */
export declare const uploadSingleImage: import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
