import { Request, Response } from 'express';
import { z } from 'zod';
import * as columnService from '../services/columnService';

const idSchema = z.uuid();
const columnSchema = z.object({ name: z.string().trim().min(1).max(100) });
// index is the column's final position on the board, counted without the column being moved.
// 0 = first; a number past the end puts it last.
// TR: index, sütunun panodaki son pozisyonudur ve taşınan sütun hariç tutularak sayılır.
// TR: 0 = ilk sıra; sondan büyük bir sayı sütunu en sona koyar.
const moveColumnSchema = z.object({ index: z.number().int().min(0) });
// GET /api/boards/:id/columns
// Sorted by position, left to right.
// TR: Pozisyona göre soldan sağa sıralı.
export async function list(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    res.json(await columnService.listColumns(boardId, req.user!));
}

// POST /api/boards/:id/columns
// Any member can add a column; it's placed after the last one.
// TR: Her üye sütun ekleyebilir; yeni sütun en sondakinin arkasına yerleşir.
export async function create(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    const { name } = columnSchema.parse(req.body);
    res.status(201).json(await columnService.createColumn(boardId, name, req.user!));
}

// PATCH /api/columns/:id
// Any member can rename.
// TR: Her üye yeniden adlandırabilir.
export async function rename(req: Request, res: Response) {
    const columnId = idSchema.parse(req.params.id);
    const { name } = columnSchema.parse(req.body);
    res.json(await columnService.renameColumn(columnId, name, req.user!));
}

// DELETE /api/columns/:id
// Owner only, because the column's cards disappear with it.
// TR: Sadece pano sahibi, çünkü sütunun kartları da onunla birlikte kaybolur.
export async function remove(req: Request, res: Response) {
    const columnId = idSchema.parse(req.params.id);
    await columnService.deleteColumn(columnId, req.user!);
    res.status(204).end();
}

// PATCH /api/columns/:id/move   body: { index }
// Any member can reorder; nothing is lost, so it doesn't need the owner.
// TR: Her üye sırayı değiştirebilir; hiçbir şey kaybolmadığı için pano sahibi gerekmez.
export async function move(req: Request, res: Response) {
    const columnId = idSchema.parse(req.params.id);
    const { index } = moveColumnSchema.parse(req.body);
    res.json(await columnService.moveColumn(columnId, index, req.user!));
}
