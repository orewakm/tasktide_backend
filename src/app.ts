import cors from 'cors';
import express from 'express';
import { config } from './config';
import { pool } from './db';
import { AppError } from './errors/AppError';
import { redis } from './redis';
import { logger } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';
import { adminRoutes } from './routes/adminRoutes';
import { authRoutes } from './routes/authRoutes';
import { boardRoutes } from './routes/boardRoutes';
import { invitationRoutes } from './routes/invitationRoutes';
import { columnRoutes } from './routes/columnRoutes';
import { cardRoutes } from './routes/cardRoutes';
import { noteRoutes } from './routes/noteRoutes';
import { timeEntryRoutes } from './routes/timeEntryRoutes';

// The app is built here but started in server.ts, so tests can send requests
// to it with supertest without opening a real port.
// TR: Uygulama burada kurulur ama server.ts'te başlatılır. Böylece testler
// TR: gerçek bir port açmadan supertest ile istek gönderebilir.
export const app = express();
// Logger comes first so every request is timed, including 404s and errors.
// TR: Logger en başta, böylece 404'ler ve hatalar dahil her istek ölçülür.
app.use(logger);
app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json());

// Docker's healthcheck calls this: 200 only when both Postgres and Redis answer.
// TR: Docker healthcheck'i bunu çağırır: sadece Postgres ve Redis ikisi de yanıt verirse 200 döner.
app.get('/api/health', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        await redis.ping();
        res.json({ status: 'ok' });
    } catch {
        res.status(503).json({ status: 'unavailable' });
    }
});

app.use('/api/auth', authRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/columns', columnRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/time-entries', timeEntryRoutes);
app.use('/api/admin', adminRoutes);

// Reached only when no route above matched. Order matters: this and the
// error handler have to stay after all the routes.
// TR: Buraya sadece yukarıdaki hiçbir route eşleşmezse gelinir. Sıra önemli:
// TR: bu ve hata yakalayıcı tüm route'lardan sonra kalmalı.
app.use((_req, _res, next) => {
    next(new AppError(404, 'Route not found'));
});
app.use(errorHandler);
