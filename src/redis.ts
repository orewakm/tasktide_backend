import { createClient } from 'redis';
import { config } from './config';

// One shared connection. server.ts calls redis.connect() before the API starts.
export const redis = createClient({ url: config.REDIS_URL });

// Without this listener a lost connection would crash the process.
// The client reconnects on its own; we only log it.
redis.on('error', (err) => {
    console.error('Redis error', err);
});
