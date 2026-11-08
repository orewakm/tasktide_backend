import { pool } from '../db';

export interface Board {
    id: string;
    name: string;
    owner_id: string;
    created_at: Date;
}

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

export async function getById(boardId: string): Promise<Board | null> {
    const { rows } = await pool.query<Board>(
        `SELECT id, name, owner_id, created_at FROM boards WHERE id = $1`,
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

export async function softDelete(boardId: string, ownerId: string): Promise<boolean> {
    const result = await pool.query(
        `UPDATE boards SET deleted_at = now() WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
        [boardId, ownerId]
    );

    return (result.rowCount ?? 0) > 0;
}
