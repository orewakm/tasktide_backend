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
    day: string;
    seconds: number;
}

export type Scope = 'board' | 'card' | 'user';

const SCOPE_FILTER: Record<Scope, string> = {
    board: 'col.board_id = $2',
    card: 't.card_id = $2',
    user: 't.user_id = $2',
};

// Builds the shared CTEs that cut each time entry to the stats window.
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

const SUM_SECONDS = 'COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM cl.e - cl.s))), 0)::int';

// Builds the query parameters for the window start and the board, card or user id.
function params(id: string, from: Date | null) {
    return [from ?? '-infinity', id];
}

// Returns the total tracked seconds in the window.
export async function total(scope: Scope, id: string, from: Date | null): Promise<number> {
    const { rows } = await pool.query<{ seconds: number }>(
        `${withClipped(scope)}
         SELECT ${SUM_SECONDS} AS seconds FROM clipped cl`,
        params(id, from)
    );
    return rows[0].seconds;
}

// Returns tracked seconds per user, highest first.
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

// Returns tracked seconds per card, highest first.
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

// Returns tracked seconds per board, highest first.
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

// Returns tracked seconds for every day in the window, including empty days.
export async function byDay(scope: Scope, id: string, from: Date): Promise<DayTime[]> {
    const { rows } = await pool.query<DayTime>(
        `${withClipped(scope)}
         SELECT to_char(d.day AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
                COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM
                    LEAST(cl.e, d.day + interval '24 hours') - GREATEST(cl.s, d.day)
                )) FILTER (WHERE cl.s IS NOT NULL)), 0)::int AS seconds
         FROM bounds b
         CROSS JOIN generate_series(b.from_ts, b.to_ts, interval '24 hours') AS d(day)
         LEFT JOIN clipped cl ON cl.s < d.day + interval '24 hours' AND cl.e > d.day
         GROUP BY d.day
         ORDER BY d.day`,
        params(id, from)
    );
    return rows;
}

export interface CardCounts {
    total: number;
    completed: number;
    pending: number;
}

export interface ColumnCounts extends CardCounts {
    column_id: string;
    name: string;
}

export interface PriorityCounts extends CardCounts {
    priority: 'low' | 'medium' | 'high';
}

export interface AssigneeCounts extends CardCounts {
    user_id: string | null;
    name: string | null;
}

const BOARD_CARDS = `
    WITH bc AS (
        SELECT c.id, c.column_id, c.assignee_id, c.priority, c.completed_at
        FROM cards c
        JOIN columns col ON col.id = c.column_id
        WHERE col.board_id = $1 AND c.deleted_at IS NULL AND col.deleted_at IS NULL
    )`;

const COUNTS = `
    COUNT(bc.id)::int AS total,
    COUNT(bc.id) FILTER (WHERE bc.completed_at IS NOT NULL)::int AS completed,
    COUNT(bc.id) FILTER (WHERE bc.completed_at IS NULL)::int AS pending`;

// Counts a board's cards in total, completed and pending.
export async function cardTotals(boardId: string): Promise<CardCounts> {
    const { rows } = await pool.query<CardCounts>(`${BOARD_CARDS} SELECT ${COUNTS} FROM bc`, [boardId]);
    return rows[0];
}

// Counts a board's cards per column, including empty columns.
export async function cardsByColumn(boardId: string): Promise<ColumnCounts[]> {
    const { rows } = await pool.query<ColumnCounts>(
        `${BOARD_CARDS}
         SELECT col.id AS column_id, col.name, ${COUNTS}
         FROM columns col
         LEFT JOIN bc ON bc.column_id = col.id
         WHERE col.board_id = $1 AND col.deleted_at IS NULL
         GROUP BY col.id
         ORDER BY col.position, col.id`,
        [boardId]
    );
    return rows;
}

// Counts a board's cards per priority, including priorities with no cards.
export async function cardsByPriority(boardId: string): Promise<PriorityCounts[]> {
    const { rows } = await pool.query<PriorityCounts>(
        `${BOARD_CARDS}
         SELECT p.priority, ${COUNTS}
         FROM unnest(enum_range(NULL::card_priority)) AS p(priority)
         LEFT JOIN bc ON bc.priority = p.priority
         GROUP BY p.priority
         ORDER BY p.priority DESC`,
        [boardId]
    );
    return rows;
}

// Counts a board's cards per assignee, with unassigned cards in their own row.
export async function cardsByAssignee(boardId: string): Promise<AssigneeCounts[]> {
    const { rows } = await pool.query<AssigneeCounts>(
        `${BOARD_CARDS}
         SELECT bc.assignee_id AS user_id, u.name, ${COUNTS}
         FROM bc
         LEFT JOIN users u ON u.id = bc.assignee_id
         GROUP BY bc.assignee_id, u.name
         ORDER BY total DESC, u.name NULLS LAST`,
        [boardId]
    );
    return rows;
}
