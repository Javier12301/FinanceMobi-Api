import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'mysql://test:test@localhost:3306/test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'test-secret-minimo-32-chars-xxxxxxxxxxx',
      JWT_EXPIRES_IN: '7d',
      ENCRYPTION_KEY: '0'.repeat(64),
      GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
    },
  },
});
