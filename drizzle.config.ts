import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // Migrations prefer the direct connection (port 5432); the app uses the pooler (DATABASE_URL).
  dbCredentials: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || '' },
});
