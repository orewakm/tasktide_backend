import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({ error: err.message });
    }

    if (err instanceof ZodError) {
        const details = err.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
        }));
        return res.status(400).json({ error: 'Validation failed', details });
    }

    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({ error: 'Invalid JSON' });
    }

    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
}
