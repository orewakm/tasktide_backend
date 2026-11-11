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
// TR: Bir not ve ait olduğu pano (not -> kart -> sütun -> pano).
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

// Notes on a deleted card or column count as not found.
// TR: Silinmiş bir kart veya sütundaki notlar bulunamadı sayılır.
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

// INSERT/UPDATE inside a CTE so we can join users and return author_name,
// the same shape listByCard returns.
// TR: INSERT/UPDATE bir CTE içinde çalışır, böylece users ile join yapıp author_name döndürebiliriz;
// TR: dönen veri listByCard'ınkiyle aynı yapıda olur.
export async function create(cardId: string, authorId: string, content: string): Promise<NoteWithAuthor> {
    const { rows } = await pool.query<NoteWithAuthor>(
        `WITH inserted AS (
            INSERT INTO card_notes (card_id, author_id, content)
            VALUES ($1, $2, $3)
            RETURNING ${FIELDS}
         )
         SELECT i.id, i.card_id, i.author_id, u.name AS author_name, i.content, i.created_at
         FROM inserted i JOIN users u ON u.id = i.author_id`,
        [cardId, authorId, content]
    );
    return rows[0];
}

export async function update(id: string, content: string): Promise<NoteWithAuthor | null> {
    const { rows } = await pool.query<NoteWithAuthor>(
        `WITH updated AS (
            UPDATE card_notes SET content = $2 WHERE id = $1 RETURNING ${FIELDS}
         )
         SELECT n.id, n.card_id, n.author_id, u.name AS author_name, n.content, n.created_at
         FROM updated n JOIN users u ON u.id = n.author_id`,
        [id, content]
    );
    return rows[0] ?? null;
}

// card_notes has no deleted_at, so this is a real delete.
// TR: card_notes tablosunda deleted_at yok, bu yüzden bu gerçek bir silme işlemi.
export async function remove(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM card_notes WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
}
