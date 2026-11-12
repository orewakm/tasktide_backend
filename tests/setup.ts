import { afterAll, beforeAll } from 'vitest';
import { pool } from '../src/db';
import { redis } from '../src/redis';

beforeAll(async () => {
    if (!redis.isOpen) await redis.connect();
});

afterAll(async () => {
    await redis.close();
    await pool.end();
});
