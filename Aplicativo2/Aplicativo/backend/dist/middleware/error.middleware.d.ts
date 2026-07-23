import { Request, Response, NextFunction } from 'express';
/**
 * Middleware global de manejo de errores.
 * Debe ser el último middleware registrado en Express.
 */
export declare function errorMiddleware(err: Error, req: Request, res: Response, _next: NextFunction): void;
