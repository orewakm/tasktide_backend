import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db';

export const api = () => request(app);

export interface TestUser {
    id: string;
    name: string;
    email: string;
    token: string;
    auth: { Authorization: string };
}

let counter = 0;

// Registers a new user with a unique email and logs them in.
export async function createUser(name = 'User'): Promise<TestUser> {
    counter += 1;
    const email = `${name.toLowerCase().replace(/\W+/g, '')}-${Date.now()}-${counter}@test.dev`;
    const password = 'password123';

    const registered = await api().post('/api/auth/register').send({ name, email, password });
    if (registered.status !== 201) throw new Error(`register failed: ${registered.status}`);
    const loggedIn = await api().post('/api/auth/login').send({ email, password });
    if (loggedIn.status !== 200) throw new Error(`login failed: ${loggedIn.status}`);

    const token: string = loggedIn.body.token;
    return { id: registered.body.id, name, email, token, auth: { Authorization: `Bearer ${token}` } };
}

export async function setRole(user: TestUser, role: 'user' | 'admin' | 'super_admin') {
    await pool.query('UPDATE users SET role = $2 WHERE id = $1', [user.id, role]);
}

export async function createBoard(owner: TestUser, name = 'Board') {
    const res = await api().post('/api/boards').set(owner.auth).send({ name });
    if (res.status !== 201) throw new Error(`create board failed: ${res.status}`);
    return res.body as { id: string; name: string; owner_id: string };
}

// Adds the user straight in as an active member (no invitation step).
export async function addMember(owner: TestUser, boardId: string, user: TestUser) {
    const res = await api()
        .post(`/api/boards/${boardId}/members`)
        .set(owner.auth)
        .send({ email: user.email, status: 'active' });
    if (res.status !== 201) throw new Error(`add member failed: ${res.status}`);
}

export async function createColumn(user: TestUser, boardId: string, name = 'Column') {
    const res = await api().post(`/api/boards/${boardId}/columns`).set(user.auth).send({ name });
    if (res.status !== 201) throw new Error(`create column failed: ${res.status}`);
    return res.body as { id: string; board_id: string; name: string; position: number };
}

export async function createCard(user: TestUser, columnId: string, title = 'Card') {
    const res = await api().post(`/api/columns/${columnId}/cards`).set(user.auth).send({ title });
    if (res.status !== 201) throw new Error(`create card failed: ${res.status}`);
    return res.body as { id: string; column_id: string; title: string; position: number; version: number };
}
