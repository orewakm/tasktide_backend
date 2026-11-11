import { createServer } from 'node:http';
import { app } from './app';
import { config } from './config';
import { pool } from './db';
import { redis } from './redis';
import { ensureSuperAdmin } from './services/authService';
import { initSockets } from './sockets';

async function start() {
    await redis.connect();
    await ensureSuperAdmin();

    // Express and Socket.IO share one HTTP server (and one port).
    const server = createServer(app);
    const io = initSockets(server);
    server.listen(config.PORT, () => {
        console.log(`TaskTide API listening on port ${config.PORT}`);
    });

    // `docker compose down` / Ctrl+C: stop taking requests, then close the connections.
    let shuttingDown = false;
    async function shutdown(signal: string) {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`${signal} received, shutting down`);
        setTimeout(() => process.exit(1), 10_000).unref(); // don't hang forever

        await io.close(); // also closes the HTTP server
        await Promise.allSettled([pool.end(), redis.close()]);
        process.exit(0);
    }
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((err) => {
    console.error('Failed to start', err);
    process.exit(1);
});
