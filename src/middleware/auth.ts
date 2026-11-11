import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import type { Role } from '../repositories/userRepository';
import * as authService from '../services/authService';

// Adds our own fields to Express's Request type, so req.user is typed in every handler.
// TR: Express'in Request tipine kendi alanlarımızı ekler, böylece req.user her handler'da tipli olur.
declare global {
    namespace Express {
        interface Request {
            user?: { id: string; role: Role };
            sessionToken?: string;
        }
    }
}

// Takes the token out of the header: "Bearer abc123" -> "abc123"
// TR: Header'dan token'ı çıkarır: "Bearer abc123" -> "abc123"
function getBearerToken(header: string | undefined): string | null {
    if (!header?.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    return token || null;
}

// Throwing is fine in async middleware: Express 5 catches the rejected promise and
// sends the error to errorHandler (Express 4 needed an explicit next(err)).
// TR: Async middleware içinde throw kullanmak sorun değil: Express 5 reddedilen promise'i yakalar
// TR: ve hatayı errorHandler'a gönderir (Express 4'te açıkça next(err) çağırmak gerekiyordu).
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
    const token = getBearerToken(req.headers.authorization);
    if (!token) throw new AppError(401, 'Missing token');

    // Also pushes the session's expiry forward, so active users stay logged in.
    // TR: Oturumun bitiş süresini de ileri atar, böylece aktif kullanıcılar oturumda kalır.
    const user = await authService.resolveSession(token);
    if (!user) throw new AppError(401, 'Invalid or expired session');

    req.user = { id: user.id, role: user.role };
    // Logout needs the token to delete this session and close its sockets.
    // TR: Logout, bu oturumu silmek ve socket'lerini kapatmak için token'a ihtiyaç duyar.
    req.sessionToken = token;
    next();
}

// Goes after authenticate, since it reads req.user. Example: requireRole('super_admin').
// TR: authenticate'ten sonra kullanılır, çünkü req.user'ı okur. Örnek: requireRole('super_admin').
export function requireRole(...roles: Role[]) {
    return (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) throw new AppError(403, 'Forbidden');
        next();
    };
}
