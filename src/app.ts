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

export const app = express();
app.use(logger);
app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json());

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

app.use((_req, _res, next) => {
    next(new AppError(404, 'Route not found'));
});
app.use(errorHandler);
