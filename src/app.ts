import express from 'express';
import pinoHttp from 'pino-http';
import { errorHandler } from './core/middlewares/errorHandler';
import authRoutes from './features/auth/auth.routes';
import walletsRouter from './features/wallets/wallets.routes';
import categoriesRouter from './features/wallets/categories.routes';
import transactionsRouter from './features/transactions/transactions.routes';
import attachmentsRouter from './features/attachments/attachments.routes';

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
app.use('/api/wallets', walletsRouter);
app.use('/api', categoriesRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api', attachmentsRouter);

app.use(errorHandler);
