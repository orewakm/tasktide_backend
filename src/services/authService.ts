import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config';
import * as userRepository from '../repositories/userRepository';
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

export async function login(email: string, password: string) {
    const user = await userRepository.getByEmail(email);
    const isValid = user !== null && (await bcrypt.compare(password, user.password_hash));
    if (!user || !isValid) throw new AppError(401, 'Invalid credentials');

    const token = jwt.sign({ role: user.role }, config.JWT_SECRET, {
        subject: user.id,
        expiresIn: config.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    });

    return { token };
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
