import type { Request, Response, NextFunction } from 'express';

export function logger(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    res.on('finish', () => {
        const ms = Date.now() - start;
        console.log(
            `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms} ms`
        );
    });

    next();
}
