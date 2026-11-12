import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import type { Role } from '../repositories/userRepository';
import * as authService from '../services/authService';

declare global {
    namespace Express {
        interface Request {
            user?: { id: string; role: Role };
            sessionToken?: string;
        }
    }
}

// Extracts the token from an "Authorization: Bearer <token>" header.
function getBearerToken(header: string | undefined): string | null {
    if (!header?.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    return token || null;
}

// Loads the user from the session token, or rejects the request with 401.
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
    const token = getBearerToken(req.headers.authorization);
    if (!token) throw new AppError(401, 'Missing token');

    const user = await authService.resolveSession(token);
    if (!user) throw new AppError(401, 'Invalid or expired session');

    req.user = { id: user.id, role: user.role };
    req.sessionToken = token;
    next();
}

// Returns a middleware that only lets users with one of the given roles through.
export function requireRole(...roles: Role[]) {
    return (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) throw new AppError(403, 'Forbidden');
        next();
    };
}
