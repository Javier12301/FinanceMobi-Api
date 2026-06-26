import { app } from './app';
import { env } from './core/config/env';
import { prisma } from './core/database/prisma';
import { redis } from './core/database/redis';

async function main() {
  await redis.connect();

  app.listen(env.PORT, () => {
    console.log(`[server] listening on port ${env.PORT} (${env.NODE_ENV})`);
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
