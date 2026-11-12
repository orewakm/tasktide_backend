import { Request, Response } from 'express';
import { z } from 'zod';
import * as authService from '../services/authService';

const registerSchema = z.object({
    name: z.string().trim().min(1).max(100),
    email: z.email().toLowerCase(),
    password: z.string().min(8).max(72),
});

const loginSchema = z.object({
    email: z.email().toLowerCase(),
    password: z.string().min(1),
});

// Creates a new account (POST /api/auth/register).
export async function register(req: Request, res: Response) {
    const { name, email, password } = registerSchema.parse(req.body);
    res.status(201).json(await authService.register(name, email, password));
}

// Logs the user in and returns a session token (POST /api/auth/login).
export async function login(req: Request, res: Response) {
    const { email, password } = loginSchema.parse(req.body);
    res.json(await authService.login(email, password));
}

// Returns the logged-in user's profile (GET /api/auth/me).
export async function me(req: Request, res: Response) {
    res.json(await authService.getProfile(req.user!.id));
}

// Ends the current session (POST /api/auth/logout).
export async function logout(req: Request, res: Response) {
    await authService.logout(req.sessionToken!, req.user!.id);
    res.status(204).end();
}
