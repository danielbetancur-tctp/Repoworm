import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';

import { predictionRoutes } from './routes/prediction.routes';
import { errorMiddleware } from './middleware/error.middleware';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Orígenes permitidos por CORS. Se pueden configurar varios separados por coma
// en la variable de entorno CORS_ORIGIN. Por defecto se admite el frontend de
// desarrollo tanto en `localhost` como en `127.0.0.1`.
const DEFAULT_ORIGINS = ['http://localhost:4200', 'http://127.0.0.1:4200'];
const CONFIGURED_ORIGINS = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter((o) => o.length > 0);
const ALLOWED_ORIGINS = CONFIGURED_ORIGINS.length > 0 ? CONFIGURED_ORIGINS : DEFAULT_ORIGINS;

// En desarrollo, cualquier `localhost`/`127.0.0.1` (cualquier puerto) es válido.
// Esto evita el error "status 0 / No se puede conectar" cuando el navegador
// abre el frontend por 127.0.0.1 en lugar de localhost (u otro puerto).
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// Crear directorio de uploads si no existe
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ── Seguridad ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: (origin, callback) => {
      // Peticiones sin origin (curl, same-origin, apps nativas): permitir.
      if (!origin) return callback(null, true);
      // Coincidencia exacta con la lista configurada, o cualquier localhost/127.0.0.1.
      if (ALLOWED_ORIGINS.includes(origin) || LOCALHOST_ORIGIN.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);

// ── Logging ──────────────────────────────────────────────────────────────────
app.use(morgan('combined'));

// ── Parseo de body ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── Rutas de la API ──────────────────────────────────────────────────────────
app.use('/api', predictionRoutes);

// ── Manejo global de errores (debe ser el último middleware) ─────────────────
app.use(errorMiddleware);

// ── Inicio del servidor ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[API] Worm Density Backend corriendo en http://localhost:${PORT}`);
  console.log(`[API] CORS permitido para: ${ALLOWED_ORIGINS.join(', ')} (+ localhost/127.0.0.1 en cualquier puerto)`);
  console.log(`[API] Directorio de uploads: ${UPLOADS_DIR}`);
});

export default app;
