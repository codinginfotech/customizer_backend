// Test environment — set before any application module loads env.ts.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.STORAGE_PROVIDER = 'local';
// Shopify module under test (dummy credentials — nothing talks to Shopify).
process.env.SHOPIFY_API_KEY = 'test-key';
process.env.SHOPIFY_API_SECRET = 'test-secret-with-enough-entropy';
process.env.SHOPIFY_APP_URL = 'https://app.example.com';
