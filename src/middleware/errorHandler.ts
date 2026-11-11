import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';

// Express treats a middleware as an error handler only if it takes 4 arguments
// (it checks fn.length === 4). So _next has to stay, even though it's never used.
// TR: Express bir middleware'i sadece 4 parametre alıyorsa hata yakalayıcı sayar
// TR: (fn.length === 4 kontrolü). Bu yüzden _next hiç kullanılmasa da kalmalı.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({ error: err.message });
    }

    // Thrown by schema.parse() in the controllers. Every bad field is listed,
    // so the client can show each message next to its input.
    // TR: Controller'lardaki schema.parse() fırlatır. Hatalı her alan listelenir,
    // TR: böylece istemci her mesajı ilgili input'un yanında gösterebilir.
    if (err instanceof ZodError) {
        const details = err.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
        }));
        return res.status(400).json({ error: 'Validation failed', details });
    }

    // express.json() throws a SyntaxError with a `body` field when the request body
    // isn't valid JSON. That's the client's mistake, so 400 instead of 500.
    // TR: İstek gövdesi geçerli JSON değilse express.json() `body` alanı olan bir SyntaxError fırlatır.
    // TR: Bu istemcinin hatası, o yüzden 500 değil 400 dönüyoruz.
    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({ error: 'Invalid JSON' });
    }

    // Anything else is a bug or an outage. The details go to the log,
    // the client only gets a generic message so we don't leak internals.
    // TR: Geri kalan her şey bir bug ya da kesinti demek. Detaylar loga yazılır,
    // TR: istemci sadece genel bir mesaj alır, böylece iç detaylar dışarı sızmaz.
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
}
