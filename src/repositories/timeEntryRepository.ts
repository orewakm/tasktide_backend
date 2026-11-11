import { pool } from '../db';

export interface TimeEntry {
    id: string;
    card_id: string;
    user_id: string;
    started_at: Date;
    ended_at: Date | null; // null while the timer is running (TR: zamanlayıcı çalışırken null)
}

export interface TimeEntryWithUser extends TimeEntry {
    user_name: string;
    duration_seconds: number; // running timers count up to now (TR: çalışan zamanlayıcılar şu ana kadar sayılır)
}

// What start / stop / current return: enough for a "timer running on <card>" widget.
// TR: start / stop / current'ın döndürdüğü veri: "<kart> üzerinde zamanlayıcı çalışıyor" widget'ı için yeterli.
export interface TimeEntryDetails extends TimeEntryWithUser {
    card_title: string;
    board_id: string;
}

// An entry plus the board it belongs to (entry -> card -> column -> board).
// TR: Bir zaman kaydı ve ait olduğu pano (kayıt -> kart -> sütun -> pano).
export interface TimeEntryWithBoard extends TimeEntry {
    board_id: string;
}

const FIELDS = 'id, card_id, user_id, started_at, ended_at';

// Turns the rows of a CTE named "e" into TimeEntryDetails.
// EXTRACT gives back numeric, which pg returns as a string, so the duration is cast to ::int.
// TR: "e" adlı bir CTE'nin satırlarını TimeEntryDetails'e çevirir.
// TR: EXTRACT numeric döner, pg bunu string olarak verir; bu yüzden süre ::int'e çevrilir.
const DETAILS = `
    SELECT e.id, e.card_id, e.user_id, u.name AS user_name, e.started_at, e.ended_at,
           EXTRACT(EPOCH FROM (COALESCE(e.ended_at, now()) - e.started_at))::int AS duration_seconds,
           c.title AS card_title, col.board_id
    FROM e
    JOIN users u ON u.id = e.user_id
    JOIN cards c ON c.id = e.card_id
    JOIN columns col ON col.id = c.column_id`;

// Fails with 23505 if the user already has a running timer
// (unique index one_running_timer_per_user). Leaving this to the database avoids a race
// where two quick start requests both pass a "no running timer" check.
// TR: Kullanıcının zaten çalışan bir zamanlayıcısı varsa 23505 hatasıyla başarısız olur
// TR: (one_running_timer_per_user unique index'i). Bu kontrolü veritabanına bırakmak, art arda
// TR: gelen iki start isteğinin aynı anda "çalışan zamanlayıcı yok" kontrolünden geçmesini önler.
export async function start(cardId: string, userId: string): Promise<TimeEntryDetails> {
    const { rows } = await pool.query<TimeEntryDetails>(
        `WITH e AS (
            INSERT INTO time_entries (card_id, user_id) VALUES ($1, $2) RETURNING ${FIELDS}
         ) ${DETAILS}`,
        [cardId, userId]
    );
    return rows[0];
}

// Stops the user's running timer, whatever card it's on. The unique index allows at most one,
// so this changes one row or none (none = null).
// TR: Kullanıcının çalışan zamanlayıcısını, hangi kartta olursa olsun durdurur. Unique index en fazla
// TR: bir taneye izin verir, bu yüzden bu sorgu ya bir satırı değiştirir ya da hiçbirini (hiçbiri = null).
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

export async function getRunning(userId: string): Promise<TimeEntryDetails | null> {
    const { rows } = await pool.query<TimeEntryDetails>(
        `WITH e AS (
            SELECT ${FIELDS} FROM time_entries WHERE user_id = $1 AND ended_at IS NULL
         ) ${DETAILS}`,
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

// board_id is for the access check in the service. Entries on deleted cards or columns aren't found.
// TR: board_id servisteki erişim kontrolü için. Silinmiş kart veya sütunlardaki kayıtlar bulunmaz.
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
