import { pool } from '../db';
import type { PoolClient } from 'pg';

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
         ORDER BY position, id`,
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

export async function lockBoard(client: PoolClient, boardId: string): Promise<boolean> {
    const { rows } = await client.query(
        'SELECT id FROM boards WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [boardId]
    );
    return rows.length > 0;
}

// Positions of the board's columns, left to right, without the column being moved.
export async function listPositions(
    client: PoolClient,
    boardId: string,
    excludeColumnId: string
): Promise<number[]> {
    const { rows } = await client.query<{ position: number }>(
        `SELECT position FROM columns
           WHERE board_id = $1 AND id <> $2 AND deleted_at IS NULL
           ORDER BY position, id`,
        [boardId, excludeColumnId]
    );
    return rows.map((r) => r.position);
}

// Spreads the board's columns back out to 1000, 2000, 3000... in their current order.
// Returns every column's new position so it can be sent to the other clients.
export async function renumber(
    client: PoolClient,
    boardId: string
): Promise<{ id: string; position: number }[]> {
    const { rows } = await client.query<{ id: string; position: number }>(
        `UPDATE columns c
           SET position = ordered.place * 1000
           FROM (
              SELECT id, ROW_NUMBER() OVER (ORDER BY position, id) AS place
              FROM columns
              WHERE board_id = $1 AND deleted_at IS NULL
           ) ordered
           WHERE c.id = ordered.id
           RETURNING c.id, c.position`,
        [boardId]
    );
    return rows;
}

export async function moveTo(
    client: PoolClient,
    id: string,
    position: number
): Promise<Column | null> {
    const { rows } = await client.query<Column>(
        `UPDATE columns SET position = $2
           WHERE id = $1 AND deleted_at IS NULL
           RETURNING ${FIELDS}`,
        [id, position]
    );
    return rows[0] ?? null;
}
