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
    day: string; // YYYY-MM-DD (UTC) (TR: UTC'ye göre YYYY-MM-DD)
    seconds: number;
}

// What the stats are about: one board, one card, or one user's time across boards.
// TR: İstatistiklerin konusu: tek bir pano, tek bir kart ya da bir kullanıcının tüm panolardaki süresi.
export type Scope = 'board' | 'card' | 'user';

// Picked by scope and pasted into the SQL with ${}. That's safe because the text comes from
// this fixed map, never from the request; the id itself still goes in as $2.
// TR: Kapsama göre seçilip ${} ile SQL'e eklenir. Bu güvenli, çünkü metin istekten değil
// TR: bu sabit eşlemeden gelir; id'nin kendisi yine $2 olarak gönderilir.
const SCOPE_FILTER: Record<Scope, string> = {
    board: 'col.board_id = $2',
    card: 't.card_id = $2',
    user: 't.user_id = $2',
};

// Every stats query starts with these two CTEs ($1 = window start, $2 = board/card/user id):
//   bounds  - the window: from $1 until now
//   clipped - each time entry cut to the window, as s (start) and e (end).
//             GREATEST takes the later of the two starts, LEAST the earlier of the two ends.
//             A running timer counts up to now; an entry that started before
//             the window only counts the part inside it.
// The WHERE keeps only entries that overlap the window.
// Entries on deleted cards, columns or boards are left out.
// TR: Tüm istatistik sorguları bu iki CTE ile başlar ($1 = aralık başlangıcı, $2 = pano/kart/kullanıcı id'si):
// TR:   bounds  - zaman aralığı: $1'den şu ana kadar
// TR:   clipped - her zaman kaydı bu aralığa göre kırpılır, s (başlangıç) ve e (bitiş) olarak.
// TR:             GREATEST iki başlangıçtan daha geç olanı, LEAST iki bitişten daha erken olanı alır.
// TR:             Çalışan bir zamanlayıcı şu ana kadar sayılır; aralıktan önce başlamış
// TR:             bir kaydın yalnızca aralığın içinde kalan kısmı sayılır.
// TR: WHERE yalnızca aralıkla çakışan kayıtları bırakır.
// TR: Silinmiş kart, sütun veya panolardaki kayıtlar hesaba katılmaz.
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
// TR: (bitiş - başlangıç) toplamı, tam saniye olarak; hiç satır yoksa 0.
// TR: EXTRACT numeric döner, pg bunu bize string olarak verirdi; ::int bu yüzden var.
const SUM_SECONDS = 'COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM cl.e - cl.s))), 0)::int';

// Same order as in the SQL: $1 = from, $2 = id.
// null = all time: '-infinity' is a valid timestamp in Postgres, so the window has no start.
// TR: SQL'deki sırayla aynı: $1 = from, $2 = id.
// TR: null = tüm zamanlar: '-infinity' Postgres'te geçerli bir timestamp, bu yüzden aralığın başlangıç sınırı olmaz.
function params(id: string, from: Date | null) {
    return [from ?? '-infinity', id];
}

// SUM without GROUP BY always gives exactly one row, so rows[0] is always there.
// TR: GROUP BY olmadan SUM her zaman tam olarak bir satır döner, bu yüzden rows[0] her zaman vardır.
export async function total(scope: Scope, id: string, from: Date | null): Promise<number> {
    const { rows } = await pool.query<{ seconds: number }>(
        `${withClipped(scope)}
         SELECT ${SUM_SECONDS} AS seconds FROM clipped cl`,
        params(id, from)
    );
    return rows[0].seconds;
}

// byUser, byCard and byBoard split the same sum per user, per card and per board.
// Biggest first, then by name, so equal totals keep a stable order.
// TR: byUser, byCard ve byBoard aynı toplamı kullanıcıya, karta ve panoya göre böler.
// TR: En büyüğü önce gelir, sonra isme göre sıralanır; böylece eşit toplamların sırası değişmez.
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

// One row per UTC day in the window, including days with 0 seconds
// (LEFT JOIN keeps the empty days, COALESCE turns their null sum into 0).
// generate_series makes the list of days; each entry is cut again to each day it overlaps,
// so a timer running across midnight is split between the two days.
// AT TIME ZONE 'UTC' keeps the day label in UTC whatever time zone the DB session uses.
// `from` must be a UTC midnight (not all time).
// TR: Aralıktaki her UTC günü için bir satır döner, 0 saniyelik günler de dahil
// TR: (LEFT JOIN boş günleri korur, COALESCE onların null toplamını 0 yapar).
// TR: generate_series gün listesini üretir; her kayıt çakıştığı her güne göre tekrar kırpılır,
// TR: böylece gece yarısını geçen bir zamanlayıcı iki gün arasında bölünür.
// TR: AT TIME ZONE 'UTC', veritabanı oturumunun saat dilimi ne olursa olsun gün etiketini UTC'de tutar.
// TR: `from` bir UTC gece yarısı olmalı (tüm zamanlar seçilemez).
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
