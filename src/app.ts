import express from 'express';
import pinoHttp from 'pino-http';
import { errorHandler } from './core/middlewares/errorHandler';
import authRoutes from './features/auth/auth.routes';

export const app = express();

app.set('trust proxy', 1);

app.use(
  pinoHttp({
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        // prefiere IP original sobre dirección del socket (soporte Nginx)
        remoteAddress:
          (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() ??
          req.remoteAddress,
      }),
    },
  }),
);

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);

app.use(errorHandler);
