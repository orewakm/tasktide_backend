import { describe, expect, it } from 'vitest';
import { addMember, api, createBoard, createColumn, createUser, type TestUser } from './helpers';

// Creates a card through the API and returns it.
async function card(user: TestUser, columnId: string, body: Record<string, unknown>) {
    const res = await api().post(`/api/columns/${columnId}/cards`).set(user.auth).send(body);
    if (res.status !== 201) throw new Error(`create card failed: ${res.status}`);
    return res.body as { id: string; title: string; version: number };
}

// Marks a card as completed.
async function complete(user: TestUser, cardId: string) {
    const res = await api().patch(`/api/cards/${cardId}`).set(user.auth).send({ version: 1, completed: true });
    if (res.status !== 200) throw new Error(`complete card failed: ${res.status}`);
}

// Returns the card titles from a task list response.
const titles = (res: { body: { data: { title: string }[] } }) => res.body.data.map((c) => c.title);

describe('task list: GET /api/cards', () => {
    it('filters, searches, sorts and paginates across the boards you are a member of', async () => {
        const alice = await createUser('Alice');
        const bob = await createUser('Bob');
        const team = await createBoard(alice, 'Team');
        const solo = await createBoard(alice, 'Solo');
        await addMember(alice, team.id, bob);
        const todo = await createColumn(alice, team.id, 'To Do');
        const done = await createColumn(alice, team.id, 'Done');
        const soloColumn = await createColumn(alice, solo.id);

        const login = await card(alice, todo.id, {
            title: 'Build login API',
            description: 'backend auth',
            priority: 'high',
            assigneeId: bob.id,
        });
        await complete(alice, login.id);
        await card(alice, todo.id, { title: 'Design landing page', priority: 'low' });
        await card(alice, done.id, { title: 'Write 50% discount banner', assigneeId: alice.id });
        await card(alice, soloColumn.id, { title: 'Secret board task', priority: 'high' });

        const all = await api().get('/api/cards').set(alice.auth);
        expect(all.status).toBe(200);
        expect(all.body).toMatchObject({ page: 1, limit: 20, total: 4, total_pages: 1 });
        expect(all.body.data[0]).toMatchObject({
            title: 'Secret board task',
            board_id: solo.id,
            board_name: 'Solo',
            column_name: 'Column',
            assignee_name: null,
        });

        expect((await api().get('/api/cards').set(bob.auth)).body.total).toBe(3);

        const query = (q: Record<string, string>) => api().get('/api/cards').query(q).set(alice.auth);

        expect((await query({ boardId: team.id })).body.total).toBe(3);
        expect(titles(await query({ status: 'completed' }))).toEqual(['Build login API']);
        expect((await query({ status: 'pending', boardId: team.id })).body.total).toBe(2);
        expect((await query({ priority: 'high' })).body.total).toBe(2);
        expect(titles(await query({ assigneeId: 'me' }))).toEqual(['Write 50% discount banner']);
        expect(titles(await query({ assigneeId: bob.id }))).toEqual(['Build login API']);
        expect(titles(await query({ columnId: done.id }))).toEqual(['Write 50% discount banner']);
        expect(titles(await query({ boardId: team.id, priority: 'high', status: 'completed' }))).toEqual([
            'Build login API',
        ]);

        expect(titles(await query({ search: 'LOGIN' }))).toEqual(['Build login API']);
        expect(titles(await query({ search: 'backend' }))).toEqual(['Build login API']);
        expect(titles(await query({ search: '%' }))).toEqual(['Write 50% discount banner']);

        expect(titles(await query({ sort: 'title', order: 'asc' }))).toEqual([
            'Build login API',
            'Design landing page',
            'Secret board task',
            'Write 50% discount banner',
        ]);
        const byPriority = await query({ sort: 'priority', order: 'desc' });
        expect(byPriority.body.data.map((c: { priority: string }) => c.priority)).toEqual([
            'high',
            'high',
            'medium',
            'low',
        ]);

        const page1 = await query({ sort: 'title', order: 'asc', limit: '2', page: '1' });
        expect(page1.body).toMatchObject({ page: 1, limit: 2, total: 4, total_pages: 2 });
        expect(titles(page1)).toEqual(['Build login API', 'Design landing page']);
        const page2 = await query({ sort: 'title', order: 'asc', limit: '2', page: '2' });
        expect(titles(page2)).toEqual(['Secret board task', 'Write 50% discount banner']);
        const page3 = await query({ limit: '2', page: '3' });
        expect(page3.body).toMatchObject({ total: 4, data: [] });
    });

    it('answers 404 for a board you are not a member of and 400 for bad query values', async () => {
        const owner = await createUser('Owner');
        const outsider = await createUser('Outsider');
        const board = await createBoard(owner);

        const asOutsider = await api().get('/api/cards').query({ boardId: board.id }).set(outsider.auth);
        expect(asOutsider.status).toBe(404);

        for (const bad of [{ limit: '0' }, { limit: '101' }, { page: '0' }, { priority: 'urgent' }, { assigneeId: 'nope' }, { sort: 'position' }]) {
            const res = await api().get('/api/cards').query(bad).set(owner.auth);
            expect(res.status).toBe(400);
        }
        expect((await api().get('/api/cards')).status).toBe(401);
    });
});

describe('board summary: GET /api/boards/:id/summary', () => {
    it('counts completed and pending cards per column, priority and assignee', async () => {
        const alice = await createUser('Alice');
        const bob = await createUser('Bob');
        const outsider = await createUser('Outsider');
        const board = await createBoard(alice);
        await addMember(alice, board.id, bob);
        const todo = await createColumn(alice, board.id, 'To Do');
        const doing = await createColumn(alice, board.id, 'Doing');
        const done = await createColumn(alice, board.id, 'Done');

        const a = await card(alice, todo.id, { title: 'A', priority: 'high', assigneeId: bob.id });
        await complete(alice, a.id);
        await card(alice, todo.id, { title: 'B', priority: 'high' });
        const c = await card(alice, done.id, { title: 'C', priority: 'low', assigneeId: alice.id });
        await complete(alice, c.id);
        const gone = await card(alice, doing.id, { title: 'Gone' });
        expect((await api().delete(`/api/cards/${gone.id}`).set(alice.auth)).status).toBe(204);

        const res = await api().get(`/api/boards/${board.id}/summary`).set(bob.auth);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            total: 3,
            completed: 2,
            pending: 1,
            by_column: [
                { column_id: todo.id, name: 'To Do', total: 2, completed: 1, pending: 1 },
                { column_id: doing.id, name: 'Doing', total: 0, completed: 0, pending: 0 },
                { column_id: done.id, name: 'Done', total: 1, completed: 1, pending: 0 },
            ],
            by_priority: [
                { priority: 'high', total: 2, completed: 1, pending: 1 },
                { priority: 'medium', total: 0, completed: 0, pending: 0 },
                { priority: 'low', total: 1, completed: 1, pending: 0 },
            ],
            by_assignee: [
                { user_id: alice.id, name: 'Alice', total: 1, completed: 1, pending: 0 },
                { user_id: bob.id, name: 'Bob', total: 1, completed: 1, pending: 0 },
                { user_id: null, name: null, total: 1, completed: 0, pending: 1 },
            ],
        });

        expect((await api().get(`/api/boards/${board.id}/summary`).set(outsider.auth)).status).toBe(404);
    });
});
