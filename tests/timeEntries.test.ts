import { describe, expect, it } from 'vitest';
import { pool } from '../src/db';
import { addMember, api, createBoard, createCard, createColumn, createUser } from './helpers';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Returns UTC midnight the given number of days ago.
function utcMidnight(daysAgo: number) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return new Date(today.getTime() - daysAgo * DAY);
}

// Formats a date as YYYY-MM-DD.
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

// Inserts a finished time entry directly into the database.
async function insertEntry(cardId: string, userId: string, start: Date, end: Date) {
    await pool.query(
        'INSERT INTO time_entries (card_id, user_id, started_at, ended_at) VALUES ($1, $2, $3, $4)',
        [cardId, userId, start, end]
    );
}

describe('timers', () => {
    it('allows one running timer per user', async () => {
        const owner = await createUser('Owner');
        const board = await createBoard(owner);
        const column = await createColumn(owner, board.id);
        const card1 = await createCard(owner, column.id, 'One');
        const card2 = await createCard(owner, column.id, 'Two');

        const started = await api().post(`/api/cards/${card1.id}/time-entries`).set(owner.auth);
        expect(started.status).toBe(201);
        expect(started.body).toMatchObject({ card_title: 'One', board_id: board.id, user_name: 'Owner', ended_at: null });

        const second = await api().post(`/api/cards/${card2.id}/time-entries`).set(owner.auth);
        expect(second.status).toBe(409);

        const current = await api().get('/api/time-entries/current').set(owner.auth);
        expect(current.body.id).toBe(started.body.id);

        const stopped = await api().post('/api/time-entries/stop').set(owner.auth);
        expect(stopped.status).toBe(200);
        expect(stopped.body.ended_at).not.toBeNull();

        expect((await api().post('/api/time-entries/stop').set(owner.auth)).status).toBe(404);
        expect((await api().get('/api/time-entries/current').set(owner.auth)).body).toBeNull();
    });

    it('lets only the tracker or the board owner delete an entry', async () => {
        const owner = await createUser('Owner');
        const member = await createUser('Member');
        const other = await createUser('Other');
        const board = await createBoard(owner);
        await addMember(owner, board.id, member);
        await addMember(owner, board.id, other);
        const column = await createColumn(owner, board.id);
        const card = await createCard(owner, column.id);

        const entry = await api().post(`/api/cards/${card.id}/time-entries`).set(member.auth);
        await api().post('/api/time-entries/stop').set(member.auth);

        expect((await api().delete(`/api/time-entries/${entry.body.id}`).set(other.auth)).status).toBe(403);
        expect((await api().delete(`/api/time-entries/${entry.body.id}`).set(owner.auth)).status).toBe(204);
    });
});

describe('time stats', () => {
    it('sums time per user, card and day, splitting entries at midnight', async () => {
        const alice = await createUser('Alice');
        const bob = await createUser('Bob');
        const board = await createBoard(alice, 'Stats');
        await addMember(alice, board.id, bob);
        const column = await createColumn(alice, board.id);
        const card1 = await createCard(alice, column.id, 'Design');
        const card2 = await createCard(alice, column.id, 'Build');

        await insertEntry(card1.id, alice.id, new Date(utcMidnight(2).getTime() - HOUR), new Date(utcMidnight(2).getTime() + HOUR));
        await insertEntry(card2.id, bob.id, new Date(utcMidnight(2).getTime() + 10 * HOUR), new Date(utcMidnight(2).getTime() + 10.5 * HOUR));
        await insertEntry(card1.id, alice.id, new Date(utcMidnight(40).getTime() + 9 * HOUR), new Date(utcMidnight(40).getTime() + 10 * HOUR));

        const res = await api().get(`/api/boards/${board.id}/stats?days=30`).set(bob.auth);
        expect(res.status).toBe(200);
        expect(res.body.total_seconds).toBe(9000);
        expect(res.body.by_user).toEqual([
            { user_id: alice.id, name: 'Alice', seconds: 7200 },
            { user_id: bob.id, name: 'Bob', seconds: 1800 },
        ]);
        expect(res.body.by_card).toEqual([
            { card_id: card1.id, title: 'Design', seconds: 7200 },
            { card_id: card2.id, title: 'Build', seconds: 1800 },
        ]);

        const byDay: { day: string; seconds: number }[] = res.body.by_day;
        expect(byDay).toHaveLength(30);
        expect(byDay.at(-1)!.day).toBe(isoDay(utcMidnight(0)));
        expect(byDay.find((d) => d.day === isoDay(utcMidnight(3)))!.seconds).toBe(3600);
        expect(byDay.find((d) => d.day === isoDay(utcMidnight(2)))!.seconds).toBe(5400);

        const card = await api().get(`/api/cards/${card1.id}/stats`).set(alice.auth);
        expect(card.body).toEqual({
            total_seconds: 10800,
            by_user: [{ user_id: alice.id, name: 'Alice', seconds: 10800 }],
        });

        const mine = await api().get('/api/time-entries/stats?days=7').set(alice.auth);
        expect(mine.body.total_seconds).toBe(7200);
        expect(mine.body.by_board).toEqual([{ board_id: board.id, name: 'Stats', seconds: 7200 }]);
        expect(mine.body.by_day).toHaveLength(7);
    });

    it('counts a running timer up to now and hides stats from outsiders', async () => {
        const owner = await createUser('Owner');
        const outsider = await createUser('Outsider');
        const board = await createBoard(owner);
        const column = await createColumn(owner, board.id);
        const card = await createCard(owner, column.id);
        await pool.query(
            'INSERT INTO time_entries (card_id, user_id, started_at) VALUES ($1, $2, now() - interval \'10 minutes\')',
            [card.id, owner.id]
        );

        const res = await api().get(`/api/cards/${card.id}/stats`).set(owner.auth);
        expect(res.body.total_seconds).toBeGreaterThanOrEqual(600);
        expect(res.body.total_seconds).toBeLessThan(700);

        expect((await api().get(`/api/boards/${board.id}/stats`).set(outsider.auth)).status).toBe(404);
        expect((await api().get(`/api/boards/${board.id}/stats?days=0`).set(owner.auth)).status).toBe(400);
    });
});
