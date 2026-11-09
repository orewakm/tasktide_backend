import { pool } from '../db';

export interface Column {
    id: string;
    board_id: string;
    name: string;
    position: number;
}

const FIELDS = 'id, board_id, name, position';

export async function listByBoard(boardId: string): Promise<Column[]> {
    const { rows } = await pool.query<Column>(
        `SELECT ${FIELDS} FROM columns
         WHERE board_id = $1 AND deleted_at IS NULL
         ORDER BY position`,
        [boardId]
    );
    return rows;
}

export async function getById(id: string): Promise<Column | null> {
    const { rows } = await pool.query<Column>(
        `SELECT ${FIELDS} FROM columns WHERE id = $1 AND deleted_at IS NULL`,
        [id]
    );
    return rows[0] ?? null;
}

// New columns go to the end of the board (last position + 1000).
export async function create(boardId: string, name: string): Promise<Column> {
    const { rows } = await pool.query<Column>(
        `INSERT INTO columns (board_id, name, position)
         VALUES (
            $1, $2,
            (SELECT COALESCE(MAX(position), 0) + 1000 FROM columns WHERE board_id = $1 AND deleted_at IS NULL)
         )
         RETURNING ${FIELDS}`,
        [boardId, name]
    );
    return rows[0];
}

export async function rename(id: string, name: string): Promise<Column | null> {
    const { rows } = await pool.query<Column>(
        `UPDATE columns SET name = $2
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING ${FIELDS}`,
        [id, name]
    );
    return rows[0] ?? null;
}

export async function softDelete(id: string): Promise<boolean> {
    const result = await pool.query(
        'UPDATE columns SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL',
        [id]
    );
    return (result.rowCount ?? 0) > 0;
}
