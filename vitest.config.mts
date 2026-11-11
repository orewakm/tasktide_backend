import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Tests talk to a real Postgres and Redis.
// Locally they use the same servers as dev (from .env); CI sets the variables itself.
// The database is always a separate one (tasktide_test), dropped and recreated on every run.
if (existsSync('.env')) process.loadEnvFile('.env');
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'tasktide_test';
if (process.env.TEST_REDIS_URL) process.env.REDIS_URL = process.env.TEST_REDIS_URL;

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
        globalSetup: ['./tests/globalSetup.ts'],
        setupFiles: ['./tests/setup.ts'],
        fileParallelism: false, // every file uses the same database
        testTimeout: 15_000,
    },
});
