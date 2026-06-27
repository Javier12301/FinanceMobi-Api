import { app } from './app';
import { env } from './core/config/env';
import { prisma } from './core/database/prisma';
import { redis } from './core/database/redis';

async function main() {
  if (redis.status === 'wait') await redis.connect();

  const host = process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1';

  app.listen(env.PORT, host, () => {
    console.log(`[server] listening on ${host}:${env.PORT} (${env.NODE_ENV})`);
  });
}

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});
