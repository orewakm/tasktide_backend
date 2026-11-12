import { pool } from '../db';
import type { PoolClient } from 'pg';

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
const RETURN_FIELDS = FIELDS.join(', ');
const SELECT_FIELDS = FIELDS.map((f) => `c.${f}`).join(', ');

// Returns a card with its board id, or null if the card or its column is deleted.
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

// Returns every card on a board, ordered by column and position.
export async function listByBoard(boardId: string): Promise<Card[]> {
    const { rows } = await pool.query<Card>(
        `SELECT ${SELECT_FIELDS}
         FROM cards c
         JOIN columns col ON col.id = c.column_id
         WHERE col.board_id = $1 AND c.deleted_at IS NULL AND col.deleted_at IS NULL
         ORDER BY col.position, c.position, c.id`,
        [boardId]
    );
    return rows;
}

export interface CardListItem extends Card {
    board_id: string;
    board_name: string;
    column_name: string;
    assignee_name: string | null;
}

export type CardSort = 'created_at' | 'updated_at' | 'priority' | 'title';

export interface CardFilters {
    memberId: string | null;
    boardId?: string;
    columnId?: string;
    completed?: boolean;
    priority?: Priority;
    assigneeId?: string;
    search?: string;
    sort: CardSort;
    order: 'asc' | 'desc';
    limit: number;
    offset: number;
}

const SORT_COLUMNS: Record<CardSort, string> = {
    created_at: 'c.created_at',
    updated_at: 'c.updated_at',
    priority: 'c.priority',
    title: 'c.title',
};

// Escapes the ILIKE wildcards so the search text is matched literally.
function likePattern(text: string) {
    return `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

// Returns one page of cards that match the filters, plus the total count.
export async function find(filters: CardFilters): Promise<{ rows: CardListItem[]; total: number }> {
    const where = ['c.deleted_at IS NULL', 'col.deleted_at IS NULL', 'b.deleted_at IS NULL'];
    const params: unknown[] = [];
    const param = (value: unknown) => {
        params.push(value);
        return `$${params.length}`;
    };

    if (filters.memberId) {
        where.push(
            `EXISTS (SELECT 1 FROM board_members m
                     WHERE m.board_id = b.id AND m.user_id = ${param(filters.memberId)} AND m.status = 'active')`
        );
    }
    if (filters.boardId) where.push(`b.id = ${param(filters.boardId)}`);
    if (filters.columnId) where.push(`c.column_id = ${param(filters.columnId)}`);
    if (filters.completed !== undefined) {
        where.push(filters.completed ? 'c.completed_at IS NOT NULL' : 'c.completed_at IS NULL');
    }
    if (filters.priority) where.push(`c.priority = ${param(filters.priority)}`);
    if (filters.assigneeId) where.push(`c.assignee_id = ${param(filters.assigneeId)}`);
    if (filters.search) {
        const pattern = param(likePattern(filters.search));
        where.push(`(c.title ILIKE ${pattern} OR c.description ILIKE ${pattern})`);
    }

    const from = `FROM cards c
         JOIN columns col ON col.id = c.column_id
         JOIN boards b ON b.id = col.board_id
         LEFT JOIN users u ON u.id = c.assignee_id
         WHERE ${where.join(' AND ')}`;
    const order = filters.order === 'asc' ? 'ASC' : 'DESC';

    const countParams = [...params];
    const limit = param(filters.limit);
    const offset = param(filters.offset);

    const [count, page] = await Promise.all([
        pool.query<{ total: number }>(`SELECT COUNT(*)::int AS total ${from}`, countParams),
        pool.query<CardListItem>(
            `SELECT ${SELECT_FIELDS}, b.id AS board_id, b.name AS board_name,
                    col.name AS column_name, u.name AS assignee_name
             ${from}
             ORDER BY ${SORT_COLUMNS[filters.sort]} ${order}, c.id ${order}
             LIMIT ${limit} OFFSET ${offset}`,
            params
        ),
    ]);
    return { rows: page.rows, total: count.rows[0].total };
}

// Inserts a card at the bottom of its column.
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

// Updates a card only if its version still matches, otherwise returns null.
export async function update(
    id: string,
    version: number,
    changes: CardChanges
): Promise<Card | null> {
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

// Marks a card as deleted.
export async function softDelete(id: string): Promise<boolean> {
    const result = await pool.query(
        'UPDATE cards SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL',
        [id]
    );
    return (result.rowCount ?? 0) > 0;
}

// Locks a column row until the transaction ends, so moves into it run one at a time.
export async function lockColumn(client: PoolClient, columnId: string): Promise<boolean> {
    const { rows } = await client.query(
        'SELECT id FROM columns WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [columnId]
    );
    return rows.length > 0;
}

// Returns the positions of a column's cards, leaving out the card being moved.
export async function listPositions(
    client: PoolClient,
    columnId: string,
    excludeCardId: string
): Promise<number[]> {
    const { rows } = await client.query<{ position: number }>(
        `SELECT position FROM cards
           WHERE column_id = $1 AND id <> $2 AND deleted_at IS NULL
           ORDER BY position, id`,
        [columnId, excludeCardId]
    );
    return rows.map((r) => r.position);
}

// Resets a column's card positions to 1000, 2000, 3000... and returns them.
export async function renumber(
    client: PoolClient,
    columnId: string
): Promise<{ id: string; position: number }[]> {
    const { rows } = await client.query<{ id: string; position: number }>(
        `UPDATE cards c
           SET position = ordered.place * 1000
           FROM (
              SELECT id, ROW_NUMBER() OVER (ORDER BY position, id) AS place
              FROM cards
              WHERE column_id = $1 AND deleted_at IS NULL
           ) ordered
           WHERE c.id = ordered.id
           RETURNING c.id, c.position`,
        [columnId]
    );
    return rows;
}

// Sets a card's column and position.
export async function moveTo(
    client: PoolClient,
    cardId: string,
    columnId: string,
    position: number
): Promise<Card | null> {
    const { rows } = await client.query<Card>(
        `UPDATE cards SET column_id = $2, position = $3, updated_at = now()
           WHERE id = $1 AND deleted_at IS NULL
           RETURNING ${RETURN_FIELDS}`,
        [cardId, columnId, position]
    );
    return rows[0] ?? null;
}
