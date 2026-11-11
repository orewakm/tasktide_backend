import { pool } from '../db';

export interface Board {
    id: string;
    name: string;
    owner_id: string;
    created_at: Date;
}

// The board and the owner's active membership are inserted in one transaction,
// so we never end up with a board its owner can't open.
// A transaction has to stay on one connection, so we take a client from the pool
// (pool.query may use a different connection for every call).
// TR: Pano ve pano sahibinin aktif üyeliği tek bir transaction içinde eklenir,
// TR: böylece sahibinin açamadığı bir pano hiçbir zaman oluşmaz.
// TR: Transaction tek bir bağlantı üzerinde kalmalı, bu yüzden havuzdan bir client alıyoruz
// TR: (pool.query her çağrıda farklı bir bağlantı kullanabilir).
export async function create(name: string, ownerId: string): Promise<Board> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query<Board>(
            'INSERT INTO boards (name, owner_id) VALUES ($1, $2) RETURNING id, name, owner_id, created_at',
            [name, ownerId]
        );
        await client.query(
            "INSERT INTO board_members (board_id, user_id, status) VALUES ($1, $2, 'active')",
            [rows[0].id, ownerId]
        );
        await client.query('COMMIT');
        return rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// Only boards the user has joined; pending invitations come from listInvitations.
// TR: Yalnızca kullanıcının katıldığı panolar; bekleyen davetler listInvitations'tan gelir.
export async function listByUserId(userId: string): Promise<Board[]> {
    const { rows } = await pool.query<Board>(
        `SELECT b.id, b.name, b.owner_id, b.created_at
        FROM boards b
        JOIN board_members m ON m.board_id = b.id
        WHERE m.user_id = $1 AND m.status = 'active' AND b.deleted_at IS NULL
        ORDER BY b.created_at DESC`,
        [userId]
    );
    return rows;
}

// null both when the board doesn't exist and when the user isn't an active member,
// so the service answers 404 in both cases.
// rows[0] is undefined when no row matched; ?? null turns that into a plain null.
// TR: Pano yoksa da kullanıcı aktif üye değilse de null döner, böylece servis iki durumda da 404 verir.
// TR: Hiçbir satır eşleşmezse rows[0] undefined olur; ?? null bunu düz bir null'a çevirir.
export async function getForMember(boardId: string, userId: string): Promise<Board | null> {
    const { rows } = await pool.query<Board>(
        `SELECT b.id, b.name, b.owner_id, b.created_at
        FROM boards b
        JOIN board_members m on m.board_id = b.id
        WHERE b.id = $1 AND m.user_id = $2 AND m.status = 'active' AND b.deleted_at IS NULL`,
        [boardId, userId]
    );
    return rows[0] ?? null;
}

// No membership check here: used for super admins and where access is already settled.
// TR: Burada üyelik kontrolü yok: süper adminler için ve erişimin zaten kontrol edildiği yerlerde kullanılır.
export async function getById(boardId: string): Promise<Board | null> {
    const { rows } = await pool.query<Board>(
        `SELECT id, name, owner_id, created_at FROM boards WHERE id = $1 AND deleted_at IS NULL`,
        [boardId]
    );

    return rows[0] ?? null;
}

export async function rename(boardId: string, name: string): Promise<Board | null> {
    const { rows } = await pool.query<Board>(
        `UPDATE boards SET name = $2 WHERE id = $1
        AND deleted_at IS NULL
        RETURNING id, name, owner_id, created_at`,
        [boardId, name]
    );

    return rows[0] ?? null;
}

// Soft delete: the row stays, but every query that checks deleted_at IS NULL stops seeing it.
// The WHERE has the same check, so deleting the same board twice returns false.
// owner_id = $2 is an extra guard on top of the owner check in the service.
// TR: Soft delete: satır silinmez, ama deleted_at IS NULL kontrolü yapan her sorgu onu artık görmez.
// TR: WHERE içinde de aynı kontrol olduğu için aynı panoyu ikinci kez silmek false döner.
// TR: owner_id = $2, servisteki pano sahibi kontrolünün üstüne ek bir güvencedir.
export async function softDelete(boardId: string, ownerId: string): Promise<boolean> {
    const result = await pool.query(
        `UPDATE boards SET deleted_at = now() WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
        [boardId, ownerId]
    );

    return (result.rowCount ?? 0) > 0;
}
