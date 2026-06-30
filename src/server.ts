import { app } from './app';
import { env } from './core/config/env';
import { prisma } from './core/database/prisma';
import { redis } from './core/database/redis';

async function main() {
  if (redis.status === 'wait') await redis.connect();

  // En Docker/producción hay que escuchar en 0.0.0.0 para que Caddy y el puerto
  // publicado lleguen al backend; en dev local queda en loopback salvo --lan.
  const host =
    process.argv.includes('--lan') || env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

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
