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

// A card plus the board it belongs to (found through its column).
// TR: Bir kart ve ait olduğu pano (sütunu üzerinden bulunur).
export interface CardWithBoard extends Card {
    board_id: string;
}

// These names are our own constants, so putting them into the SQL with ${} is safe.
// Values from the request never go in this way; they are always passed as $1, $2...
// TR: Bu isimler bizim sabitlerimiz, bu yüzden ${} ile SQL'e eklemek güvenli.
// TR: İstekten gelen değerler asla bu şekilde eklenmez; her zaman $1, $2... olarak gönderilir.
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
const RETURN_FIELDS = FIELDS.join(', '); // for INSERT / UPDATE ... RETURNING (TR: INSERT / UPDATE ... RETURNING için)
const SELECT_FIELDS = FIELDS.map((f) => `c.${f}`).join(', '); // for queries that join columns (TR: columns tablosuyla join yapan sorgular için)

// A card in a deleted column counts as gone too. board_id comes along so the service can
// check board access (the board's own deleted_at is checked there).
// TR: Silinmiş bir sütundaki kart da yok sayılır. board_id de döner, böylece servis pano erişimini
// TR: kontrol edebilir (panonun kendi deleted_at kontrolü orada yapılır).
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

// Column by column, then top to bottom. id breaks ties, so two cards with the same
// position always come back in the same order.
// TR: Önce sütun sırasına, sonra yukarıdan aşağıya sıralanır. Eşitlik olursa id belirler,
// TR: böylece aynı pozisyondaki iki kart her zaman aynı sırayla döner.
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

// New cards go to the bottom of the column (last position + 1000).
// In an empty column MAX is null, and COALESCE makes the first card 1000.
// TR: Yeni kartlar sütunun en altına eklenir (son pozisyon + 1000).
// TR: Boş bir sütunda MAX null döner, COALESCE sayesinde ilk kartın pozisyonu 1000 olur.
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
// TR: İyimser kilitleme (optimistic locking): yalnızca versiyon hâlâ istemcinin gördüğüyle aynıysa günceller.
// TR: Hiçbir satır değişmezse null döner (kart silinmiş ya da başkası önce kaydetmiş).
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

export async function softDelete(id: string): Promise<boolean> {
    const result = await pool.query(
        'UPDATE cards SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL',
        [id]
    );
    return (result.rowCount ?? 0) > 0;
}

// SELECT ... FOR UPDATE locks the target column's row until the transaction ends.
// Two moves into the same column then wait for each other instead of reading the same
// positions at the same time. Pass the transaction's client, or the lock is released
// right after this query. false = the column was deleted in the meantime.
// TR: SELECT ... FOR UPDATE, hedef sütunun satırını transaction bitene kadar kilitler.
// TR: Böylece aynı sütuna yapılan iki taşıma, aynı pozisyonları aynı anda okumak yerine
// TR: birbirini bekler. Transaction'ın client'ı verilmeli, yoksa kilit bu sorgudan hemen
// TR: sonra kalkar. false = sütun bu arada silinmiş.
export async function lockColumn(client: PoolClient, columnId: string): Promise<boolean> {
    const { rows } = await client.query(
        'SELECT id FROM columns WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [columnId]
    );
    return rows.length > 0;
}

// Positions of the column's cards, top to bottom, without the card being moved
// (it may already be in this column).
// TR: Sütundaki kartların yukarıdan aşağıya pozisyonları, taşınan kart hariç
// TR: (kart zaten bu sütunda olabilir).
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

// Spreads the column's cards back out to 1000, 2000, 3000... in their current order
// (ROW_NUMBER numbers them 1, 2, 3... by position, then we multiply by 1000).
// Returns every card's new position so it can be sent to the other clients.
// TR: Sütundaki kartları mevcut sıralarını koruyarak tekrar 1000, 2000, 3000... olarak dağıtır
// TR: (ROW_NUMBER onları pozisyona göre 1, 2, 3... diye numaralar, biz de 1000 ile çarparız).
// TR: Her kartın yeni pozisyonunu döner, böylece diğer istemcilere gönderilebilir.
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

// version stays the same: a move isn't an edit, so it won't make someone's open edit
// fail with a conflict.
// TR: version değişmez: taşımak bir düzenleme sayılmaz, bu yüzden başkasının açık
// TR: düzenlemesini çakışma hatasına düşürmez.
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
