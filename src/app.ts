import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { env } from './core/config/env';
import { errorHandler } from './core/middlewares/errorHandler';
import authRoutes from './features/auth/auth.routes';
import { meController } from './features/auth/auth.controller';
import { authMiddleware } from './core/middlewares/auth';
import walletsRouter from './features/wallets/wallets.routes';
import categoriesRouter from './features/wallets/categories.routes';
import transactionsRouter from './features/transactions/transactions.routes';
import attachmentsRouter from './features/attachments/attachments.routes';
import delegationsRouter from './features/delegations/delegation.routes';
import budgetsRouter from './features/budgets/budgets.routes';
import recurringRouter from './features/recurring/recurring.routes';

export const app = express();

app.set('trust proxy', 1);

const allowedOrigins = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : [];
const isLanMode = process.argv.includes('--lan');

function isPrivateLanFrontendOrigin(origin: string) {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    const firstOctets = host.split('.').map(Number);
    const isPrivateIp =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      (firstOctets[0] === 172 && firstOctets[1] >= 16 && firstOctets[1] <= 31);

    return url.protocol === 'http:' && url.port === '5173' && isPrivateIp;
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (isLanMode && isPrivateLanFrontendOrigin(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  }),
);

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
app.get('/api/me', authMiddleware, meController);
app.use('/api/delegations', delegationsRouter);
app.use('/api/wallets', walletsRouter);
app.use('/api', categoriesRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api', attachmentsRouter);
app.use('/api/budgets', budgetsRouter);
app.use('/api/recurring-rules', recurringRouter);

app.use(errorHandler);
