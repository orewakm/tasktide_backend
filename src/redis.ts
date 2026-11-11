import { createClient } from 'redis';
import { config } from './config';

// One shared connection. server.ts calls redis.connect() before the API starts.
// TR: Tek, ortak bir bağlantı. server.ts, API başlamadan önce redis.connect() çağırır.
export const redis = createClient({ url: config.REDIS_URL });

// Without this listener a lost connection would crash the process.
// The client reconnects on its own; we only log it.
// TR: Bu listener olmasa kopan bir bağlantı process'i çökertirdi.
// TR: Client kendi kendine yeniden bağlanır; biz sadece logluyoruz.
redis.on('error', (err) => {
    console.error('Redis error', err);
});
