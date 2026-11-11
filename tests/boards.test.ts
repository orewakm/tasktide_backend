import { describe, expect, it } from 'vitest';
import {
    addMember,
    api,
    createBoard,
    createCard,
    createColumn,
    createUser,
    setRole,
} from './helpers';

describe('boards and access rules', () => {
    it('hides a board from non-members with 404', async () => {
        const owner = await createUser('Owner');
        const outsider = await createUser('Outsider');
        const board = await createBoard(owner);

        expect((await api().get(`/api/boards/${board.id}`).set(owner.auth)).status).toBe(200);
        expect((await api().get(`/api/boards/${board.id}`).set(outsider.auth)).status).toBe(404);
        expect((await api().delete(`/api/boards/${board.id}`).set(outsider.auth)).status).toBe(404);
    });

    it('lets an invited user in only after they accept', async () => {
        const owner = await createUser('Owner');
        const guest = await createUser('Guest');
        const board = await createBoard(owner, 'Invite board');

        const invite = await api()
            .post(`/api/boards/${board.id}/members`)
            .set(owner.auth)
            .send({ email: guest.email });
        expect(invite.status).toBe(201);
        expect(invite.body.status).toBe('invited');

        expect((await api().get(`/api/boards/${board.id}`).set(guest.auth)).status).toBe(404);
        const invitations = await api().get('/api/invitations').set(guest.auth);
        expect(invitations.body.map((b: { id: string }) => b.id)).toContain(board.id);

        expect((await api().post(`/api/invitations/${board.id}/accept`).set(guest.auth)).status).toBe(204);
        expect((await api().get(`/api/boards/${board.id}`).set(guest.auth)).status).toBe(200);
    });

    it('only lets the owner do destructive things (403 for members)', async () => {
        const owner = await createUser('Owner');
        const member = await createUser('Member');
        const board = await createBoard(owner);
        await addMember(owner, board.id, member);
        const column = await createColumn(member, board.id);
        const card = await createCard(member, column.id);

        expect((await api().delete(`/api/cards/${card.id}`).set(member.auth)).status).toBe(403);
        expect((await api().delete(`/api/columns/${column.id}`).set(member.auth)).status).toBe(403);
        expect((await api().delete(`/api/boards/${board.id}`).set(member.auth)).status).toBe(403);
        expect((await api().patch(`/api/boards/${board.id}`).set(member.auth).send({ name: 'x' })).status).toBe(403);

        expect((await api().delete(`/api/cards/${card.id}`).set(owner.auth)).status).toBe(204);
        expect((await api().delete(`/api/boards/${board.id}`).set(owner.auth)).status).toBe(204);
        expect((await api().get(`/api/boards/${board.id}`).set(owner.auth)).status).toBe(404);
    });

    it('lets the super admin open any board, but not deleted ones', async () => {
        const owner = await createUser('Owner');
        const admin = await createUser('Super');
        await setRole(admin, 'super_admin');
        const board = await createBoard(owner);

        expect((await api().get(`/api/boards/${board.id}`).set(admin.auth)).status).toBe(200);
        await api().delete(`/api/boards/${board.id}`).set(owner.auth);
        expect((await api().get(`/api/boards/${board.id}`).set(admin.auth)).status).toBe(404);
    });
});

describe('cards', () => {
    it('detects conflicting edits with the version number (409)', async () => {
        const owner = await createUser('Owner');
        const board = await createBoard(owner);
        const column = await createColumn(owner, board.id);
        const card = await createCard(owner, column.id, 'First title');

        const first = await api()
            .patch(`/api/cards/${card.id}`)
            .set(owner.auth)
            .send({ version: 1, title: 'Second title' });
        expect(first.status).toBe(200);
        expect(first.body.version).toBe(2);

        const stale = await api()
            .patch(`/api/cards/${card.id}`)
            .set(owner.auth)
            .send({ version: 1, title: 'Stale edit' });
        expect(stale.status).toBe(409);
    });

    it('only accepts active board members as assignees', async () => {
        const owner = await createUser('Owner');
        const outsider = await createUser('Outsider');
        const board = await createBoard(owner);
        const column = await createColumn(owner, board.id);

        const res = await api()
            .post(`/api/columns/${column.id}/cards`)
            .set(owner.auth)
            .send({ title: 'Task', assigneeId: outsider.id });
        expect(res.status).toBe(400);
    });

    it('only lets the assignee add notes', async () => {
        const owner = await createUser('Owner');
        const member = await createUser('Member');
        const board = await createBoard(owner);
        await addMember(owner, board.id, member);
        const column = await createColumn(owner, board.id);
        const res = await api()
            .post(`/api/columns/${column.id}/cards`)
            .set(owner.auth)
            .send({ title: 'Task', assigneeId: member.id });
        const cardId = res.body.id;

        const byOwner = await api().post(`/api/cards/${cardId}/notes`).set(owner.auth).send({ content: 'hi' });
        expect(byOwner.status).toBe(403);
        const byAssignee = await api().post(`/api/cards/${cardId}/notes`).set(member.auth).send({ content: 'hi' });
        expect(byAssignee.status).toBe(201);
        expect(byAssignee.body.author_name).toBe('Member');
    });
});
