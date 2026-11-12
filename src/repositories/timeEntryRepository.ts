import { pool } from '../db';

export interface TimeEntry {
    id: string;
    card_id: string;
    user_id: string;
    started_at: Date;
    ended_at: Date | null;
}

export interface TimeEntryWithUser extends TimeEntry {
    user_name: string;
    duration_seconds: number;
}

export interface TimeEntryDetails extends TimeEntryWithUser {
    card_title: string;
    board_id: string;
}

export interface TimeEntryWithBoard extends TimeEntry {
    board_id: string;
}

const FIELDS = 'id, card_id, user_id, started_at, ended_at';

const DETAILS = `
    SELECT e.id, e.card_id, e.user_id, u.name AS user_name, e.started_at, e.ended_at,
           EXTRACT(EPOCH FROM (COALESCE(e.ended_at, now()) - e.started_at))::int AS duration_seconds,
           c.title AS card_title, col.board_id
    FROM e
    JOIN users u ON u.id = e.user_id
    JOIN cards c ON c.id = e.card_id
    JOIN columns col ON col.id = c.column_id`;

// Starts a timer for the user on a card.
export async function start(cardId: string, userId: string): Promise<TimeEntryDetails> {
    const { rows } = await pool.query<TimeEntryDetails>(
        `WITH e AS (
            INSERT INTO time_entries (card_id, user_id) VALUES ($1, $2) RETURNING ${FIELDS}
         ) ${DETAILS}`,
        [cardId, userId]
    );
    return rows[0];
}

// Stops the user's running timer and returns it, or null if none is running.
export async function stopRunning(userId: string): Promise<TimeEntryDetails | null> {
    const { rows } = await pool.query<TimeEntryDetails>(
        `WITH e AS (
            UPDATE time_entries SET ended_at = now()
            WHERE user_id = $1 AND ended_at IS NULL
            RETURNING ${FIELDS}
         ) ${DETAILS}`,
        [userId]
    );
    return rows[0] ?? null;
}

// Returns the user's running timer, or null.
export async function getRunning(userId: string): Promise<TimeEntryDetails | null> {
    const { rows } = await pool.query<TimeEntryDetails>(
        `WITH e AS (
            SELECT ${FIELDS} FROM time_entries WHERE user_id = $1 AND ended_at IS NULL
         ) ${DETAILS}`,
        [userId]
    );
    return rows[0] ?? null;
}

// Returns a card's time entries with the users' names.
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

// Returns a time entry with its board id, or null if its card is deleted.
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

// Deletes a time entry.
export async function remove(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM time_entries WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
}
