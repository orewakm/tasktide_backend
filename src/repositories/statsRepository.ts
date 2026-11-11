import { pool } from '../db';

export interface UserTime {
    user_id: string;
    name: string;
    seconds: number;
}

export interface CardTime {
    card_id: string;
    title: string;
    seconds: number;
}

export interface BoardTime {
    board_id: string;
    name: string;
    seconds: number;
}

export interface DayTime {
    day: string; // YYYY-MM-DD (UTC)
    seconds: number;
}

// What the stats are about: one board, one card, or one user's time across boards.
export type Scope = 'board' | 'card' | 'user';

const SCOPE_FILTER: Record<Scope, string> = {
    board: 'col.board_id = $2',
    card: 't.card_id = $2',
    user: 't.user_id = $2',
};

// Every stats query starts with these two CTEs ($1 = window start, $2 = board/card/user id):
//   bounds  - the window: from $1 until now
//   clipped - each time entry cut to the window, as s (start) and e (end).
//             A running timer counts up to now; an entry that started before
//             the window only counts the part inside it.
// Entries on deleted cards, columns or boards are left out.
function withClipped(scope: Scope) {
    return `
        WITH bounds AS (
            SELECT $1::timestamptz AS from_ts, now() AS to_ts
        ),
        clipped AS (
            SELECT t.user_id, t.card_id, col.board_id,
                   GREATEST(t.started_at, b.from_ts) AS s,
                   LEAST(COALESCE(t.ended_at, now()), b.to_ts) AS e
            FROM time_entries t
            JOIN cards c ON c.id = t.card_id AND c.deleted_at IS NULL
            JOIN columns col ON col.id = c.column_id AND col.deleted_at IS NULL
            JOIN boards bo ON bo.id = col.board_id AND bo.deleted_at IS NULL
            CROSS JOIN bounds b
            WHERE ${SCOPE_FILTER[scope]}
              AND t.started_at < b.to_ts
              AND COALESCE(t.ended_at, now()) > b.from_ts
        )`;
}

// Total of (end - start) in whole seconds, 0 when there are no rows.
// EXTRACT returns numeric, which pg would hand us as a string, hence ::int.
const SUM_SECONDS = 'COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM cl.e - cl.s))), 0)::int';

// null = all time
function params(id: string, from: Date | null) {
    return [from ?? '-infinity', id];
}

export async function total(scope: Scope, id: string, from: Date | null): Promise<number> {
    const { rows } = await pool.query<{ seconds: number }>(
        `${withClipped(scope)}
         SELECT ${SUM_SECONDS} AS seconds FROM clipped cl`,
        params(id, from)
    );
    return rows[0].seconds;
}

export async function byUser(scope: Scope, id: string, from: Date | null): Promise<UserTime[]> {
    const { rows } = await pool.query<UserTime>(
        `${withClipped(scope)}
         SELECT cl.user_id, u.name, ${SUM_SECONDS} AS seconds
         FROM clipped cl
         JOIN users u ON u.id = cl.user_id
         GROUP BY cl.user_id, u.name
         ORDER BY seconds DESC, u.name`,
        params(id, from)
    );
    return rows;
}

export async function byCard(scope: Scope, id: string, from: Date | null): Promise<CardTime[]> {
    const { rows } = await pool.query<CardTime>(
        `${withClipped(scope)}
         SELECT cl.card_id, c.title, ${SUM_SECONDS} AS seconds
         FROM clipped cl
         JOIN cards c ON c.id = cl.card_id
         GROUP BY cl.card_id, c.title
         ORDER BY seconds DESC, c.title`,
        params(id, from)
    );
    return rows;
}

export async function byBoard(scope: Scope, id: string, from: Date | null): Promise<BoardTime[]> {
    const { rows } = await pool.query<BoardTime>(
        `${withClipped(scope)}
         SELECT cl.board_id, bo.name, ${SUM_SECONDS} AS seconds
         FROM clipped cl
         JOIN boards bo ON bo.id = cl.board_id
         GROUP BY cl.board_id, bo.name
         ORDER BY seconds DESC, bo.name`,
        params(id, from)
    );
    return rows;
}

// One row per UTC day in the window, including days with 0 seconds.
// generate_series makes the list of days; each entry is cut again to each day it overlaps,
// so a timer running across midnight is split between the two days.
// `from` must be a UTC midnight (not all time).
export async function byDay(scope: Scope, id: string, from: Date): Promise<DayTime[]> {
    const { rows } = await pool.query<DayTime>(
        `${withClipped(scope)}
         SELECT to_char(d.day AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
                COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM
                    LEAST(cl.e, d.day + interval '24 hours') - GREATEST(cl.s, d.day)
                ))), 0)::int AS seconds
         FROM bounds b
         CROSS JOIN generate_series(b.from_ts, b.to_ts, interval '24 hours') AS d(day)
         LEFT JOIN clipped cl ON cl.s < d.day + interval '24 hours' AND cl.e > d.day
         GROUP BY d.day
         ORDER BY d.day`,
        params(id, from)
    );
    return rows;
}
