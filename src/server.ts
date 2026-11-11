import { createServer } from 'node:http';
import { app } from './app';
import { config } from './config';
import { redis } from './redis';
import { ensureSuperAdmin } from './services/authService';
import { initSockets } from './sockets';

async function start() {
    await redis.connect();
    await ensureSuperAdmin();

    // Express and Socket.IO share one HTTP server (and one port).
    const server = createServer(app);
    initSockets(server);
    server.listen(config.PORT, () => {
        console.log(`TaskTide API listening on port ${config.PORT}`);
    });
}

start().catch((err) => {
    console.error('Failed to start', err);
    process.exit(1);
});
