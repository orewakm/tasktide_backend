import { AppError } from '../errors/AppError';
import * as userRepository from '../repositories/userRepository';
import type { Actor } from './boardService';

// Admins and the super admin can see every user.
export async function listUsers() {
    return userRepository.listAll();
}

// Only the super admin changes roles (checked in the route).
// There is exactly one super admin (created from the env on startup),
// so nobody can be made super admin here and the super admin can't be demoted.
export async function changeRole(userId: string, role: 'user' | 'admin', actor: Actor) {
    if (userId === actor.id) throw new AppError(400, "You can't change your own role");

    const user = await userRepository.getById(userId);
    if (!user) throw new AppError(404, 'User not found');
    if (user.role === 'super_admin') {
        throw new AppError(400, "The super admin's role can't be changed");
    }

    const updated = await userRepository.updateRole(userId, role);
    if (!updated) throw new AppError(404, 'User not found');
    return updated;
}
