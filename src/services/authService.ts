import bcrypt from 'bcryptjs';
import { config } from '../config';
import * as sessionRepository from '../repositories/sessionRepository';
import * as userRepository from '../repositories/userRepository';
import type { PublicUser } from '../repositories/userRepository';
import { AppError } from '../errors/AppError';
import * as realtime from '../sockets/realtime';

// Hashes the password and creates the user, with 409 if the email is taken.
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

// Checks the email and password and creates a new session.
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

// Ends one session and closes its sockets.
export async function logout(token: string, userId: string) {
    await sessionRepository.remove(token);
    await realtime.disconnectSession(userId, token);
}

// Returns the user a session token belongs to, or null.
export async function resolveSession(token: string): Promise<PublicUser | null> {
    const userId = await sessionRepository.getUserId(token);
    if (!userId) return null;
    return userRepository.getById(userId);
}

// Returns a user's profile, or throws 404.
export async function getProfile(id: string) {
    const user = await userRepository.getById(id);
    if (!user) throw new AppError(404, 'User not found');
    return user;
}

// Creates the super admin from the environment variables if it doesn't exist yet.
export async function ensureSuperAdmin() {
    const hash = await bcrypt.hash(config.SUPER_ADMIN_PASSWORD, 10);
    const created = await userRepository.createSuperAdmin(
        config.SUPER_ADMIN_EMAIL.toLowerCase(),
        hash
    );
    console.log(created ? 'Super admin created' : 'Super admin already exists');
}
