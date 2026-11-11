import { app } from './app';
import { config } from './config';
import { redis } from './redis';
import { ensureSuperAdmin } from './services/authService';

async function start() {
    await redis.connect();
    await ensureSuperAdmin();
    app.listen(config.PORT, () => {
        console.log(`TaskTide API listening on port ${config.PORT}`);
    });
}

start().catch((err) => {
    console.error('Failed to start', err);
    process.exit(1);
});
