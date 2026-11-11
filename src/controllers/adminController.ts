import { Request, Response } from 'express';
import { z } from 'zod';
import * as adminService from '../services/adminService';

const idSchema = z.uuid();
const roleSchema = z.object({ role: z.enum(['user', 'admin']) });

// GET /api/admin/users
export async function listUsers(_req: Request, res: Response) {
    res.json(await adminService.listUsers());
}

// PATCH /api/admin/users/:id/role   body: { role: "user" | "admin" }
export async function changeRole(req: Request, res: Response) {
    const userId = idSchema.parse(req.params.id);
    const { role } = roleSchema.parse(req.body);
    res.json(await adminService.changeRole(userId, role, req.user!));
}
