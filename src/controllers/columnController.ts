import { Request, Response } from 'express';
import { z } from 'zod';
import * as columnService from '../services/columnService';

const idSchema = z.uuid();
const columnSchema = z.object({ name: z.string().trim().min(1).max(100) });
const moveColumnSchema = z.object({ index: z.number().int().min(0) });
// GET /api/boards/:id/columns
export async function list(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    res.json(await columnService.listColumns(boardId, req.user!));
}

// POST /api/boards/:id/columns
export async function create(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    const { name } = columnSchema.parse(req.body);
    res.status(201).json(await columnService.createColumn(boardId, name, req.user!));
}

// PATCH /api/columns/:id
export async function rename(req: Request, res: Response) {
    const columnId = idSchema.parse(req.params.id);
    const { name } = columnSchema.parse(req.body);
    res.json(await columnService.renameColumn(columnId, name, req.user!));
}

// DELETE /api/columns/:id
export async function remove(req: Request, res: Response) {
    const columnId = idSchema.parse(req.params.id);
    await columnService.deleteColumn(columnId, req.user!);
    res.status(204).end();
}

export async function move(req: Request, res: Response) {
    const columnId = idSchema.parse(req.params.id);
    const { index } = moveColumnSchema.parse(req.body);
    res.json(await columnService.moveColumn(columnId, index, req.user!));
}
