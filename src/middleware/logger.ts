import type { Request, Response, NextFunction } from 'express';

export function logger(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    // next() runs right away; the line is logged later, once the response has been sent.
    // By then the status code and the duration are final.
    // TR: next() hemen çalışır; satır daha sonra, yanıt gönderildiğinde loglanır.
    // TR: O anda status kodu ve süre artık kesinleşmiştir.
    res.on('finish', () => {
        const ms = Date.now() - start;
        console.log(
            `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms} ms`
        );
    });

    next();
}
