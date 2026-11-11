import { pool } from '../db';

export type Role = 'user' | 'admin' | 'super_admin';

export interface User {
    id: string;
    name: string;
    email: string;
    password_hash: string;
    role: Role;
}

export type PublicUser = Omit<User, 'password_hash'>;

export async function getByEmail(email: string): Promise<User | null> {
    const { rows } = await pool.query<User>(
        'SELECT id, name, email, password_hash, role FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email]
    );

    return rows[0] ?? null;
}

export async function getById(id: string): Promise<PublicUser | null> {
    const { rows } = await pool.query<PublicUser>(
        'SELECT id, name, email, role FROM users WHERE id = $1 AND deleted_at IS NULL',
        [id]
    );

    return rows[0] ?? null;
}

export async function create(
    name: string,
    email: string,
    passwordHash: string
): Promise<PublicUser> {
    const { rows } = await pool.query<PublicUser>(
        'INSERT INTO users (name, email, password_hash) VALUES($1,$2,$3) RETURNING id, name, email, role',
        [name, email, passwordHash]
    );

    return rows[0] ?? null;
}

export interface UserListItem extends PublicUser {
    created_at: Date;
}

export async function listAll(): Promise<UserListItem[]> {
    const { rows } = await pool.query<UserListItem>(
        `SELECT id, name, email, role, created_at FROM users
         WHERE deleted_at IS NULL
         ORDER BY created_at`
    );
    return rows;
}

export async function updateRole(id: string, role: Role): Promise<PublicUser | null> {
    const { rows } = await pool.query<PublicUser>(
        `UPDATE users SET role = $2
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id, name, email, role`,
        [id, role]
    );
    return rows[0] ?? null;
}

export async function createSuperAdmin(email: string, passwordHash: string): Promise<boolean> {
    const { rows } = await pool.query(
        `INSERT INTO users (name, email, password_hash, role) 
        VALUES ('Super Admin', $1, $2, 'super_admin') 
        ON CONFLICT (email) DO NOTHING RETURNING id`,
        [email, passwordHash]
    );
    return rows.length > 0;
}
