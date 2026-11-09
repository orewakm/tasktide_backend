import { pool } from '../db';

export interface TimeEntry {
    id: string;
    card_id: string;
    user_id: string;
    started_at: Date;
    ended_at: Date | null; // null while the timer is running
}

export interface TimeEntryWithUser extends TimeEntry {
    user_name: string;
    duration_seconds: number; // running timers count up to now
}

// An entry plus the board it belongs to (entry -> card -> column -> board).
export interface TimeEntryWithBoard extends TimeEntry {
    board_id: string;
}

const FIELDS = 'id, card_id, user_id, started_at, ended_at';

// Fails with 23505 if the user already has a running timer
// (unique index one_running_timer_per_user).
export async function start(cardId: string, userId: string): Promise<TimeEntry> {
    const { rows } = await pool.query<TimeEntry>(
        `INSERT INTO time_entries (card_id, user_id) VALUES ($1, $2) RETURNING ${FIELDS}`,
        [cardId, userId]
    );
    return rows[0];
}

export async function stopRunning(userId: string): Promise<TimeEntry | null> {
    const { rows } = await pool.query<TimeEntry>(
        `UPDATE time_entries SET ended_at = now()
         WHERE user_id = $1 AND ended_at IS NULL
         RETURNING ${FIELDS}`,
        [userId]
    );
    return rows[0] ?? null;
}

export async function getRunning(userId: string): Promise<TimeEntry | null> {
    const { rows } = await pool.query<TimeEntry>(
        `SELECT ${FIELDS} FROM time_entries WHERE user_id = $1 AND ended_at IS NULL`,
        [userId]
    );
    return rows[0] ?? null;
}

export async function listByCard(cardId: string): Promise<TimeEntryWithUser[]> {
    const { rows } = await pool.query<TimeEntryWithUser>(
        `SELECT t.id, t.card_id, t.user_id, u.name AS user_name, t.started_at, t.ended_at,
                EXTRACT(EPOCH FROM (COALESCE(t.ended_at, now()) - t.started_at))::int AS duration_seconds
         FROM time_entries t
         JOIN users u ON u.id = t.user_id
         WHERE t.card_id = $1
         ORDER BY t.started_at DESC`,
        [cardId]
    );
    return rows;
}

export async function getById(id: string): Promise<TimeEntryWithBoard | null> {
    const { rows } = await pool.query<TimeEntryWithBoard>(
        `SELECT t.id, t.card_id, t.user_id, t.started_at, t.ended_at, col.board_id
         FROM time_entries t
         JOIN cards c ON c.id = t.card_id
         JOIN columns col ON col.id = c.column_id
         WHERE t.id = $1 AND c.deleted_at IS NULL AND col.deleted_at IS NULL`,
        [id]
    );
    return rows[0] ?? null;
}

export async function remove(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM time_entries WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
}
