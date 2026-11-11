import { Request, Response } from 'express';
import { z } from 'zod';
import * as boardService from '../services/boardService';

// A malformed id fails here with 400 instead of hitting Postgres as an invalid uuid (500).
// TR: Hatalı bir id, Postgres'e geçersiz uuid olarak gidip 500 vermek yerine burada 400 ile düşer.
const idSchema = z.uuid();
// Shared by create and rename. trim() runs before min(1), so a name of only spaces is rejected.
// TR: create ve rename ortak kullanır. trim(), min(1)'den önce çalışır, yani sadece boşluktan oluşan isim reddedilir.
const boardSchema = z.object({ name: z.string().trim().min(1).max(100) });

// POST /api/boards
// The creator becomes the owner and is added as an active member in the same transaction.
// req.user! is fine in every handler here: boardRoutes runs authenticate before all of them.
// TR: Panoyu oluşturan kişi pano sahibi olur ve aynı transaction içinde aktif üye olarak eklenir.
// TR: Buradaki tüm handler'larda req.user! sorunsuz: boardRoutes hepsinden önce authenticate'i çalıştırır.
export async function create(req: Request, res: Response) {
    const { name } = boardSchema.parse(req.body);
    res.status(201).json(await boardService.createBoard(name, req.user!));
}

// GET /api/boards
// Only boards where the user is an active member. Pending invitations are under /api/invitations.
// TR: Yalnızca kullanıcının aktif üye olduğu panolar. Bekleyen davetler /api/invitations altında.
export async function list(req: Request, res: Response) {
    res.json(await boardService.listBoards(req.user!));
}

// GET /api/boards/:id
// Non-members get 404, not 403, so they can't even tell the board exists.
// TR: Üye olmayanlar 403 değil 404 alır, böylece panonun var olduğunu bile anlayamazlar.
export async function getOne(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    res.json(await boardService.getAccessibleBoard(boardId, req.user!));
}

// PATCH /api/boards/:id
// Owner only: other members get 403.
// TR: Sadece pano sahibi: diğer üyeler 403 alır.
export async function rename(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    const { name } = boardSchema.parse(req.body);
    res.json(await boardService.renameBoard(boardId, name, req.user!));
}

// DELETE /api/boards/:id
// Owner only. It's a soft delete: the row is only marked as deleted.
// 204 means "done, no body", hence end() and not json().
// TR: Sadece pano sahibi silebilir. Bu bir soft delete: satır silinmez, yalnızca silinmiş olarak işaretlenir.
// TR: 204 "tamam, gövde yok" demektir, bu yüzden json() değil end() kullanılır.
export async function remove(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    await boardService.deleteBoard(boardId, req.user!);
    res.status(204).end();
}
