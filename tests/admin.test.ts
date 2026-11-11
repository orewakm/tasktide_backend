import { describe, expect, it } from 'vitest';
import { api, createUser, setRole } from './helpers';

describe('admin', () => {
    it('only admins and the super admin can list users', async () => {
        const user = await createUser('Plain');
        const admin = await createUser('Admin');
        await setRole(admin, 'admin');

        expect((await api().get('/api/admin/users').set(user.auth)).status).toBe(403);
        const res = await api().get('/api/admin/users').set(admin.auth);
        expect(res.status).toBe(200);
        expect(res.body.map((u: { id: string }) => u.id)).toContain(user.id);
        expect(res.body[0].password_hash).toBeUndefined();
    });

    it('only the super admin changes roles, and the change applies at once', async () => {
        const superAdmin = await createUser('Super');
        await setRole(superAdmin, 'super_admin');
        const admin = await createUser('Admin');
        await setRole(admin, 'admin');
        const user = await createUser('Promoted');

        const byAdmin = await api().patch(`/api/admin/users/${user.id}/role`).set(admin.auth).send({ role: 'admin' });
        expect(byAdmin.status).toBe(403);

        const promoted = await api()
            .patch(`/api/admin/users/${user.id}/role`)
            .set(superAdmin.auth)
            .send({ role: 'admin' });
        expect(promoted.status).toBe(200);
        expect(promoted.body.role).toBe('admin');

        // Same token, no re-login: the role is read from the database on every request.
        expect((await api().get('/api/admin/users').set(user.auth)).status).toBe(200);
    });

    it('refuses to change your own role, the super admin, or to make a super admin', async () => {
        const superAdmin = await createUser('Super');
        await setRole(superAdmin, 'super_admin');
        const otherSuper = await createUser('Super2');
        await setRole(otherSuper, 'super_admin');
        const user = await createUser('Plain');

        const own = await api().patch(`/api/admin/users/${superAdmin.id}/role`).set(superAdmin.auth).send({ role: 'user' });
        expect(own.status).toBe(400);
        const demote = await api().patch(`/api/admin/users/${otherSuper.id}/role`).set(superAdmin.auth).send({ role: 'user' });
        expect(demote.status).toBe(400);
        const toSuper = await api().patch(`/api/admin/users/${user.id}/role`).set(superAdmin.auth).send({ role: 'super_admin' });
        expect(toSuper.status).toBe(400);
    });
});
