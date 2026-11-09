import express from 'express';
import { pool } from './db';
import { AppError } from './errors/AppError';
import { logger } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';
import { authRoutes } from './routes/authRoutes';
import { boardRoutes } from './routes/boardRoutes';
import { invitationRoutes } from './routes/invitationRoutes';
import { columnRoutes } from './routes/columnRoutes';
import { cardRoutes } from './routes/cardRoutes';

export const app = express();
app.use(logger);
app.use(express.json());

app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/columns', columnRoutes);
app.use('/api/cards', cardRoutes);

app.use((_req, _res, next) => {
    next(new AppError(404, 'Route not found'));
});
app.use(errorHandler);
