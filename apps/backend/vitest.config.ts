import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Dummy, non-secret values so env.ts validation passes in CI/local
    // test runs without requiring a real .env file.
    env: {
      NODE_ENV: 'test',
      PORT: '4000',
      MONGODB_URI: 'mongodb://localhost:27017/beautybook_test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'test-access-secret-not-for-real-use-000000',
      JWT_REFRESH_SECRET: 'test-refresh-secret-not-for-real-use-00000',
      PUBLIC_BOOKING_TOKEN_SECRET: 'test-public-booking-token-secret-32-chars-min',
      ADMIN_JWT_ACCESS_SECRET: 'test-admin-access-secret-not-for-real-000',
      ADMIN_JWT_REFRESH_SECRET: 'test-admin-refresh-secret-not-for-real-00',
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
      STRIPE_PRICE_ID_STARTER: 'price_test_starter_dummy',
      STRIPE_PRICE_ID_BUSINESS: 'price_test_business_dummy',
      SMS_PROVIDER: 'console',
      S3_BUCKET: 'beautybook-test',
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY_ID: 's3_test_dummy',
      S3_SECRET_ACCESS_KEY: 's3_test_dummy',
      S3_PUBLIC_BASE_URL: 'http://localhost:9000/beautybook-test',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
      ADMIN_CORS_ALLOWED_ORIGINS: 'http://localhost:3100',
    },
  },
});
