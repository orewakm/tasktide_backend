import { pool } from '../db';

export type Priority = 'low' | 'medium' | 'high';

export interface Card {
    id: string;
    column_id: string;
    assignee_id: string | null;
    title: string;
    description: string | null;
    priority: Priority;
    position: number;
    version: number;
    completed_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

// A card plus the board it belongs to (found through its column).
export interface CardWithBoard extends Card {
    board_id: string;
}

const FIELDS = [
    'id',
    'column_id',
    'assignee_id',
    'title',
    'description',
    'priority',
    'position',
    'version',
    'completed_at',
    'created_at',
    'updated_at',
];
const RETURN_FIELDS = FIELDS.join(', '); // for INSERT / UPDATE ... RETURNING
const SELECT_FIELDS = FIELDS.map((f) => `c.${f}`).join(', '); // for queries that join columns

export async function getById(id: string): Promise<CardWithBoard | null> {
    const { rows } = await pool.query<CardWithBoard>(
        `SELECT ${SELECT_FIELDS}, col.board_id
         FROM cards c
         JOIN columns col ON col.id = c.column_id
         WHERE c.id = $1 AND c.deleted_at IS NULL AND col.deleted_at IS NULL`,
        [id]
    );
    return rows[0] ?? null;
}

export async function listByBoard(boardId: string): Promise<Card[]> {
    const { rows } = await pool.query<Card>(
        `SELECT ${SELECT_FIELDS}
         FROM cards c
         JOIN columns col ON col.id = c.column_id
         WHERE col.board_id = $1 AND c.deleted_at IS NULL AND col.deleted_at IS NULL
         ORDER BY col.position, c.position`,
        [boardId]
    );
    return rows;
}

// New cards go to the bottom of the column (last position + 1000).
export async function create(
    columnId: string,
    title: string,
    description: string | null,
    priority: Priority,
    assigneeId: string | null
): Promise<Card> {
    const { rows } = await pool.query<Card>(
        `INSERT INTO cards (column_id, title, description, priority, assignee_id, position)
         VALUES (
            $1, $2, $3, $4, $5,
            (SELECT COALESCE(MAX(position), 0) + 1000 FROM cards WHERE column_id = $1 AND deleted_at IS NULL)
         )
         RETURNING ${RETURN_FIELDS}`,
        [columnId, title, description, priority, assigneeId]
    );
    return rows[0];
}

export interface CardChanges {
    title: string;
    description: string | null;
    priority: Priority;
    assigneeId: string | null;
    completedAt: Date | null;
}

// Optimistic locking: only updates if the version still matches what the client saw.
// Returns null when 0 rows changed (card deleted, or someone else saved first).
export async function update(id: string, version: number, changes: CardChanges): Promise<Card | null> {
    const { rows } = await pool.query<Card>(
        `UPDATE cards
         SET title = $3, description = $4, priority = $5, assignee_id = $6, completed_at = $7,
             version = version + 1, updated_at = now()
         WHERE id = $1 AND version = $2 AND deleted_at IS NULL
         RETURNING ${RETURN_FIELDS}`,
        [
            id,
            version,
            changes.title,
            changes.description,
            changes.priority,
            changes.assigneeId,
            changes.completedAt,
        ]
    );
    return rows[0] ?? null;
}

export async function softDelete(id: string): Promise<boolean> {
    const result = await pool.query(
        'UPDATE cards SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL',
        [id]
    );
    return (result.rowCount ?? 0) > 0;
}
