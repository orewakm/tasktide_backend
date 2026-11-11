import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { redis } from '../src/redis';
import { api, createUser } from './helpers';

describe('auth', () => {
    it('registers a user without exposing the password hash', async () => {
        const res = await api()
            .post('/api/auth/register')
            .send({ name: 'Ada', email: `ada-${Date.now()}@test.dev`, password: 'password123' });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ name: 'Ada', role: 'user' });
        expect(res.body.password_hash).toBeUndefined();
    });

    it('rejects a duplicate email with 409', async () => {
        const user = await createUser('Dup');
        const res = await api()
            .post('/api/auth/register')
            .send({ name: 'Dup', email: user.email, password: 'password123' });
        expect(res.status).toBe(409);
    });

    it('validates the body with 400 and field details', async () => {
        const res = await api().post('/api/auth/register').send({ name: '', email: 'nope', password: '1' });
        expect(res.status).toBe(400);
        expect(res.body.details.map((d: { field: string }) => d.field)).toEqual(
            expect.arrayContaining(['name', 'email', 'password'])
        );
    });

    it('gives the same 401 for a wrong password and an unknown email', async () => {
        const user = await createUser('Login');
        const wrongPassword = await api()
            .post('/api/auth/login')
            .send({ email: user.email, password: 'wrong-password' });
        const unknownEmail = await api()
            .post('/api/auth/login')
            .send({ email: 'nobody@test.dev', password: 'password123' });
        expect(wrongPassword.status).toBe(401);
        expect(unknownEmail.status).toBe(401);
        expect(wrongPassword.body).toEqual(unknownEmail.body);
    });

    it('logs in, stores only a hash of the token in Redis, and returns the user', async () => {
        const user = await createUser('Session');
        const hashed = createHash('sha256').update(user.token).digest('hex');
        expect(await redis.exists(`session:${hashed}`)).toBe(1);
        expect(await redis.exists(`session:${user.token}`)).toBe(0);

        const me = await api().get('/api/auth/me').set(user.auth);
        expect(me.status).toBe(200);
        expect(me.body).toMatchObject({ id: user.id, email: user.email });
    });

    it('returns 401 without a token or with a made-up token', async () => {
        expect((await api().get('/api/auth/me')).status).toBe(401);
        const fake = await api().get('/api/auth/me').set({ Authorization: 'Bearer not-a-real-token' });
        expect(fake.status).toBe(401);
    });

    it('logout deletes the session, so the same token stops working', async () => {
        const user = await createUser('Logout');
        expect((await api().post('/api/auth/logout').set(user.auth)).status).toBe(204);
        expect((await api().get('/api/auth/me').set(user.auth)).status).toBe(401);
    });

    it('health check answers when Postgres and Redis are up', async () => {
        const res = await api().get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'ok' });
    });
});
