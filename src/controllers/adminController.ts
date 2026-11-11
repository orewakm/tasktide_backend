import { Request, Response } from 'express';
import { z } from 'zod';
import * as adminService from '../services/adminService';

// Validating the id here gives a clean 400. Without it, a malformed id would reach
// Postgres as an invalid uuid and come back as a 500.
// TR: id'yi burada doğrulamak temiz bir 400 verir. Bu olmasa hatalı bir id Postgres'e
// TR: geçersiz uuid olarak gider ve 500 olarak geri dönerdi.
const idSchema = z.uuid();
// 'super_admin' is left out on purpose: there is exactly one, created from the env on startup.
// TR: 'super_admin' bilerek listede yok: tam olarak bir tane var ve açılışta env'den oluşturuluyor.
const roleSchema = z.object({ role: z.enum(['user', 'admin']) });

// GET /api/admin/users
export async function listUsers(_req: Request, res: Response) {
    res.json(await adminService.listUsers());
}

// PATCH /api/admin/users/:id/role   body: { role: "user" | "admin" }
// Only the super admin reaches this (adminRoutes checks it). The service still refuses
// to change your own role or the super admin's.
// TR: Buraya yalnızca süper admin ulaşır (adminRoutes bunu kontrol eder). Servis yine de
// TR: kişinin kendi rolünü veya süper adminin rolünü değiştirmeyi reddeder.
export async function changeRole(req: Request, res: Response) {
    const userId = idSchema.parse(req.params.id);
    const { role } = roleSchema.parse(req.body);
    res.json(await adminService.changeRole(userId, role, req.user!));
}
