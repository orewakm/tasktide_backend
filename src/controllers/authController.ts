import { Request, Response } from 'express';
import { z } from 'zod';
import * as authService from '../services/authService';

const registerSchema = z.object({
    name: z.string().trim().min(1).max(100),
    // Lowercased so "Ali@x.com" and "ali@x.com" can't become two separate accounts.
    // TR: Küçük harfe çevriliyor, böylece "Ali@x.com" ve "ali@x.com" iki ayrı hesap olamaz.
    email: z.email().toLowerCase(),
    // bcrypt ignores anything past 72 bytes, so longer passwords aren't accepted at all.
    // TR: bcrypt 72 byte'tan sonrasını yok sayar, bu yüzden daha uzun şifreleri hiç kabul etmiyoruz.
    password: z.string().min(8).max(72),
});

// Login only checks that a password was sent. Length rules belong to register;
// a wrong password here is simply a 401.
// TR: Login sadece bir şifre gönderilip gönderilmediğine bakar. Uzunluk kuralları register'a ait;
// TR: burada yanlış şifre basitçe 401 döner.
const loginSchema = z.object({
    email: z.email().toLowerCase(),
    password: z.string().min(1),
});

// POST /api/auth/register
// No try/catch in these handlers: Express 5 forwards errors thrown in async handlers
// to errorHandler. A ZodError from parse() becomes a 400 that lists each bad field.
// TR: Bu handler'larda try/catch yok: Express 5, async handler'larda fırlatılan hataları
// TR: errorHandler'a iletir. parse()'tan gelen ZodError, her hatalı alanı listeleyen bir 400'e dönüşür.
// The response is the new user without a token; the client logs in afterwards.
// TR: Yanıt token içermeyen yeni kullanıcıdır; client ardından giriş yapar.
export async function register(req: Request, res: Response) {
    const { name, email, password } = registerSchema.parse(req.body);
    res.status(201).json(await authService.register(name, email, password));
}

// POST /api/auth/login
// Returns { token, user }. The client sends the token back as "Authorization: Bearer <token>".
// TR: { token, user } döner. Client token'ı "Authorization: Bearer <token>" olarak geri gönderir.
export async function login(req: Request, res: Response) {
    const { email, password } = loginSchema.parse(req.body);
    res.json(await authService.login(email, password));
}

// GET /api/auth/me
// req.user! is safe: this route runs authenticate first, and that is what sets req.user.
// TR: req.user! güvenli: bu route önce authenticate'i çalıştırır ve req.user'ı o atar.
export async function me(req: Request, res: Response) {
    res.json(await authService.getProfile(req.user!.id));
}

// POST /api/auth/logout
// Deletes only this session from Redis; the user's other devices stay logged in.
// authenticate sets sessionToken together with user, so the ! is safe here too.
// TR: Redis'ten yalnızca bu oturumu siler; kullanıcının diğer cihazları oturumda kalır.
// TR: authenticate, sessionToken'ı user ile birlikte atar, bu yüzden buradaki ! de güvenli.
export async function logout(req: Request, res: Response) {
    await authService.logout(req.sessionToken!, req.user!.id);
    res.status(204).end();
}
