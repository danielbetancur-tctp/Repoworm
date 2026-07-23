import { PreprocessImageData } from '../types';
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
export declare function preprocessThermalImage(imagePath: string, imageOriginalName: string): Promise<PreprocessImageData>;
