import { describe, expect, it } from 'vitest';
import { pool } from '../src/db';
import { api, createBoard, createCard, createColumn, createUser, type TestUser } from './helpers';

// Returns the titles of a column's cards in order.
async function cardTitlesIn(user: TestUser, boardId: string, columnId: string) {
    const res = await api().get(`/api/boards/${boardId}/cards`).set(user.auth);
    return res.body
        .filter((card: { column_id: string }) => card.column_id === columnId)
        .map((card: { title: string }) => card.title);
}

// Sends a card move request.
function moveCard(user: TestUser, cardId: string, columnId: string, index: number) {
    return api().patch(`/api/cards/${cardId}/move`).set(user.auth).send({ columnId, index });
}

describe('moving cards', () => {
    it('moves to the top, the middle and another column', async () => {
        const owner = await createUser('Owner');
        const board = await createBoard(owner);
        const todo = await createColumn(owner, board.id, 'To Do');
        const done = await createColumn(owner, board.id, 'Done');
        const a = await createCard(owner, todo.id, 'A');
        const b = await createCard(owner, todo.id, 'B');
        const c = await createCard(owner, todo.id, 'C');
        expect([a.position, b.position, c.position]).toEqual([1000, 2000, 3000]);

        const top = await moveCard(owner, c.id, todo.id, 0);
        expect(top.status).toBe(200);
        expect(top.body.position).toBe(0);
        expect(await cardTitlesIn(owner, board.id, todo.id)).toEqual(['C', 'A', 'B']);

        const middle = await moveCard(owner, b.id, todo.id, 1);
        expect(middle.body.position).toBe(500);
        expect(await cardTitlesIn(owner, board.id, todo.id)).toEqual(['C', 'B', 'A']);

        const other = await moveCard(owner, a.id, done.id, 99);
        expect(other.body.column_id).toBe(done.id);
        expect(await cardTitlesIn(owner, board.id, done.id)).toEqual(['A']);
        expect(await cardTitlesIn(owner, board.id, todo.id)).toEqual(['C', 'B']);
    });

    it('does not change the version, so an open edit still saves', async () => {
        const owner = await createUser('Owner');
        const board = await createBoard(owner);
        const column = await createColumn(owner, board.id);
        const card = await createCard(owner, column.id);

        const moved = await moveCard(owner, card.id, column.id, 0);
        expect(moved.body.version).toBe(1);
        const edit = await api().patch(`/api/cards/${card.id}`).set(owner.auth).send({ version: 1, title: 'Edited' });
        expect(edit.status).toBe(200);
    });

    it('renumbers the column when two neighbours are too close', async () => {
        const owner = await createUser('Owner');
        const board = await createBoard(owner);
        const column = await createColumn(owner, board.id);
        const p = await createCard(owner, column.id, 'P');
        const q = await createCard(owner, column.id, 'Q');
        const r = await createCard(owner, column.id, 'R');
        await pool.query('UPDATE cards SET position = $2 WHERE id = $1', [q.id, 1000.0000001]);

        const res = await moveCard(owner, r.id, column.id, 1);
        expect(res.status).toBe(200);
        expect(res.body.position).toBe(1500);

        const { rows } = await pool.query('SELECT id, position FROM cards WHERE column_id = $1 ORDER BY position', [column.id]);
        expect(rows).toEqual([
            { id: p.id, position: 1000 },
            { id: r.id, position: 1500 },
            { id: q.id, position: 2000 },
        ]);
    });

    it('rejects moving a card to another board (400) or by outsiders (404)', async () => {
        const owner = await createUser('Owner');
        const outsider = await createUser('Outsider');
        const board1 = await createBoard(owner, 'One');
        const board2 = await createBoard(owner, 'Two');
        const column1 = await createColumn(owner, board1.id);
        const column2 = await createColumn(owner, board2.id);
        const card = await createCard(owner, column1.id);

        expect((await moveCard(owner, card.id, column2.id, 0)).status).toBe(400);
        expect((await moveCard(outsider, card.id, column1.id, 0)).status).toBe(404);
        expect((await moveCard(owner, card.id, column1.id, -1)).status).toBe(400);
    });
});

describe('moving columns', () => {
    it('reorders the columns of a board', async () => {
        const owner = await createUser('Owner');
        const board = await createBoard(owner);
        await createColumn(owner, board.id, 'To Do');
        await createColumn(owner, board.id, 'Doing');
        const done = await createColumn(owner, board.id, 'Done');

        const res = await api().patch(`/api/columns/${done.id}/move`).set(owner.auth).send({ index: 0 });
        expect(res.status).toBe(200);
        expect(res.body.position).toBe(0);

        const list = await api().get(`/api/boards/${board.id}/columns`).set(owner.auth);
        expect(list.body.map((c: { name: string }) => c.name)).toEqual(['Done', 'To Do', 'Doing']);
    });
});
