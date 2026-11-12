import { Request, Response } from 'express';
import { z } from 'zod';
import * as boardService from '../services/boardService';

const idSchema = z.uuid();
const boardSchema = z.object({ name: z.string().trim().min(1).max(100) });

// Creates a board owned by the logged-in user (POST /api/boards).
export async function create(req: Request, res: Response) {
    const { name } = boardSchema.parse(req.body);
    res.status(201).json(await boardService.createBoard(name, req.user!));
}

// Returns the boards the user is a member of (GET /api/boards).
export async function list(req: Request, res: Response) {
    res.json(await boardService.listBoards(req.user!));
}

// Returns one board (GET /api/boards/:id).
export async function getOne(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    res.json(await boardService.getAccessibleBoard(boardId, req.user!));
}

// Renames a board (PATCH /api/boards/:id).
export async function rename(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    const { name } = boardSchema.parse(req.body);
    res.json(await boardService.renameBoard(boardId, name, req.user!));
}

// Deletes a board (DELETE /api/boards/:id).
export async function remove(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    await boardService.deleteBoard(boardId, req.user!);
    res.status(204).end();
}
