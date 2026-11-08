import { Pool } from 'pg';
import { config } from './config';

export const pool = new Pool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
});

pool.on('error', (err) => {
    console.error('Unexpected database error', err);
});
