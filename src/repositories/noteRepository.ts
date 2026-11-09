import { pool } from '../db';

export interface Note {
    id: string;
    card_id: string;
    author_id: string;
    content: string;
    created_at: Date;
}

export interface NoteWithAuthor extends Note {
    author_name: string;
}

// A note plus the board it belongs to (note -> card -> column -> board).
export interface NoteWithBoard extends Note {
    board_id: string;
}

const FIELDS = 'id, card_id, author_id, content, created_at';

export async function listByCard(cardId: string): Promise<NoteWithAuthor[]> {
    const { rows } = await pool.query<NoteWithAuthor>(
        `SELECT n.id, n.card_id, n.author_id, u.name AS author_name, n.content, n.created_at
         FROM card_notes n
         JOIN users u ON u.id = n.author_id
         WHERE n.card_id = $1
         ORDER BY n.created_at`,
        [cardId]
    );
    return rows;
}

export async function getById(id: string): Promise<NoteWithBoard | null> {
    const { rows } = await pool.query<NoteWithBoard>(
        `SELECT n.id, n.card_id, n.author_id, n.content, n.created_at, col.board_id
         FROM card_notes n
         JOIN cards c ON c.id = n.card_id
         JOIN columns col ON col.id = c.column_id
         WHERE n.id = $1 AND c.deleted_at IS NULL AND col.deleted_at IS NULL`,
        [id]
    );
    return rows[0] ?? null;
}

export async function create(cardId: string, authorId: string, content: string): Promise<Note> {
    const { rows } = await pool.query<Note>(
        `INSERT INTO card_notes (card_id, author_id, content)
         VALUES ($1, $2, $3)
         RETURNING ${FIELDS}`,
        [cardId, authorId, content]
    );
    return rows[0];
}

export async function update(id: string, content: string): Promise<Note | null> {
    const { rows } = await pool.query<Note>(
        `UPDATE card_notes SET content = $2 WHERE id = $1 RETURNING ${FIELDS}`,
        [id, content]
    );
    return rows[0] ?? null;
}

// card_notes has no deleted_at, so this is a real delete.
export async function remove(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM card_notes WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
}
