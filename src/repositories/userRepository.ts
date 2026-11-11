import { pool } from '../db';

export type Role = 'user' | 'admin' | 'super_admin';

export interface User {
    id: string;
    name: string;
    email: string;
    password_hash: string;
    role: Role;
}

// User without password_hash: the shape we send in responses.
// TR: password_hash olmadan User: yanıtlarda gönderdiğimiz hali.
export type PublicUser = Omit<User, 'password_hash'>;

// The only query that selects password_hash, because login has to compare it.
// $1 is a placeholder: pg sends the value separately from the SQL text, so whatever the user
// typed can't change the query (no SQL injection). Every query in these files works this way.
// TR: password_hash'i seçen tek sorgu bu, çünkü giriş işleminin onu karşılaştırması gerekiyor.
// TR: $1 bir yer tutucudur: pg değeri SQL metninden ayrı gönderir, böylece kullanıcının yazdığı şey
// TR: sorguyu değiştiremez (SQL injection olmaz). Bu dosyalardaki tüm sorgular böyle çalışır.
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

// A taken email fails with 23505 (unique violation); authService turns that into a 409.
// TR: Zaten kullanılan bir email 23505 (unique violation) hatası verir; authService bunu 409'a çevirir.
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

// Runs every time the app starts. ON CONFLICT (email) DO NOTHING makes that safe: if the email
// already exists, nothing is inserted, RETURNING gives no row and we return false.
// An existing account with that email is left as it is (not promoted).
// TR: Uygulama her başladığında çalışır. ON CONFLICT (email) DO NOTHING bunu güvenli kılar: email
// TR: zaten varsa hiçbir şey eklenmez, RETURNING satır döndürmez ve false döneriz.
// TR: Bu email'e sahip mevcut bir hesap olduğu gibi bırakılır (rolü yükseltilmez).
export async function createSuperAdmin(email: string, passwordHash: string): Promise<boolean> {
    const { rows } = await pool.query(
        `INSERT INTO users (name, email, password_hash, role) 
        VALUES ('Super Admin', $1, $2, 'super_admin') 
        ON CONFLICT (email) DO NOTHING RETURNING id`,
        [email, passwordHash]
    );
    return rows.length > 0;
}
