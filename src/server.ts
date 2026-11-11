import { createServer } from 'node:http';
import { app } from './app';
import { config } from './config';
import { pool } from './db';
import { redis } from './redis';
import { ensureSuperAdmin } from './services/authService';
import { initSockets } from './sockets';

async function start() {
    // Get everything ready before listening. ensureSuperAdmin() is also the first
    // Postgres query, so a wrong DB config fails here instead of on a user's request.
    // TR: Dinlemeye başlamadan önce her şeyi hazırla. ensureSuperAdmin() aynı zamanda ilk
    // TR: Postgres sorgusu, yani yanlış bir DB ayarı kullanıcı isteğinde değil burada patlar.
    await redis.connect();
    await ensureSuperAdmin();

    // Express and Socket.IO share one HTTP server (and one port).
    // TR: Express ve Socket.IO tek bir HTTP sunucusunu (ve tek bir portu) paylaşır.
    const server = createServer(app);
    const io = initSockets(server);
    server.listen(config.PORT, () => {
        console.log(`TaskTide API listening on port ${config.PORT}`);
    });

    // `docker compose down` / Ctrl+C: stop taking requests, then close the connections.
    // TR: `docker compose down` / Ctrl+C: yeni istek almayı bırak, sonra bağlantıları kapat.
    let shuttingDown = false;
    async function shutdown(signal: string) {
        // A second signal (Ctrl+C pressed twice) shouldn't start it again.
        // TR: İkinci bir sinyal (iki kez Ctrl+C) kapanışı tekrar başlatmamalı.
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`${signal} received, shutting down`);
        // If closing gets stuck, force exit after 10 seconds so we don't hang forever.
        // unref() means this timer alone won't keep the process alive.
        // TR: Kapanış takılırsa 10 saniye sonra zorla çık, sonsuza kadar asılı kalmayalım.
        // TR: unref() sayesinde bu zamanlayıcı tek başına process'i ayakta tutmaz.
        setTimeout(() => process.exit(1), 10_000).unref();

        await io.close(); // also closes the HTTP server (TR: HTTP sunucusunu da kapatır)
        // Both close in parallel. allSettled never rejects, so one failed close can't skip the exit below.
        // TR: İkisi paralel kapanır. allSettled asla reject etmez, bu yüzden biri hata verse de aşağıdaki çıkış atlanmaz.
        await Promise.allSettled([pool.end(), redis.close()]);
        process.exit(0);
    }
    // `void` marks the promise as deliberately not awaited; signal listeners don't wait for it anyway.
    // TR: `void`, promise'in bilerek beklenmediğini belirtir; sinyal listener'ları onu zaten beklemez.
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
}

// If startup fails (e.g. Redis or Postgres not reachable), exit with code 1. In Docker,
// `restart: unless-stopped` then brings the container back up to try again.
// TR: Başlangıç başarısız olursa (ör. Redis veya Postgres'e ulaşılamazsa) 1 koduyla çıkılır. Docker'da
// TR: `restart: unless-stopped` container'ı tekrar ayağa kaldırıp yeniden dener.
start().catch((err) => {
    console.error('Failed to start', err);
    process.exit(1);
});
