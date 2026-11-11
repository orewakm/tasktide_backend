import bcrypt from 'bcryptjs';
import { config } from '../config';
import * as sessionRepository from '../repositories/sessionRepository';
import * as userRepository from '../repositories/userRepository';
import type { PublicUser } from '../repositories/userRepository';
import { AppError } from '../errors/AppError';

export async function register(name: string, email: string, password: string) {
    const passwordHash = await bcrypt.hash(password, 10);
    try {
        return await userRepository.create(name, email, passwordHash);
    } catch (err) {
        if ((err as { code?: string }).code === '23505') {
            throw new AppError(409, 'Email already in use');
        }
        throw err;
    }
}

// On success a new session is stored in Redis; the token is its key.
export async function login(email: string, password: string) {
    const user = await userRepository.getByEmail(email);
    const isValid = user !== null && (await bcrypt.compare(password, user.password_hash));
    if (!user || !isValid) throw new AppError(401, 'Invalid credentials');

    const token = await sessionRepository.create(user.id);
    return {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
}

// Ends this session only (other devices stay logged in).
export async function logout(token: string, userId: string) {
    await sessionRepository.remove(token);
}

// Token -> session in Redis -> user in Postgres.
// Loading the user every time means a role change or a deleted user takes effect at once.
export async function resolveSession(token: string): Promise<PublicUser | null> {
    const userId = await sessionRepository.getUserId(token);
    if (!userId) return null;
    return userRepository.getById(userId);
}

export async function getProfile(id: string) {
    const user = await userRepository.getById(id);
    if (!user) throw new AppError(404, 'User not found');
    return user;
}

export async function ensureSuperAdmin() {
    const hash = await bcrypt.hash(config.SUPER_ADMIN_PASSWORD, 10);
    const created = await userRepository.createSuperAdmin(
        config.SUPER_ADMIN_EMAIL.toLowerCase(),
        hash
    );
    console.log(created ? 'Super admin created' : 'Super admin already exists');
}
