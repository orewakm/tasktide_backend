import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from '../errors/AppError';
import type { Role } from '../repositories/userRepository';

declare global {
    namespace Express {
        interface Request {
            user?: { id: string; role: Role };
        }
    }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
    const headers = req.headers.authorization;
    if (!headers?.startsWith('Bearer ')) throw new AppError(401, 'Missing token');

    let payload: jwt.JwtPayload;
    try {
        payload = jwt.verify(headers.slice(7), config.JWT_SECRET) as jwt.JwtPayload;
    } catch {
        throw new AppError(401, 'Invalid or expired token');
    }

    req.user = { id: payload.sub as string, role: payload.role };
    next();
}

export function requireRole(...roles: Role[]) {
    return (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) throw new AppError(403, 'Forbidden');
        next();
    };
}
