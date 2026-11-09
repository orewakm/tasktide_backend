import { Request, Response } from 'express';
import { z } from 'zod';
import * as cardService from '../services/cardService';

const idSchema = z.uuid();
const priorities = ['low', 'medium', 'high'] as const;

const createCardSchema = z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000).nullish(),
    priority: z.enum(priorities).default('medium'),
    assigneeId: z.uuid().nullish(),
});

// version is required; at least one other field must be sent.
const updateCardSchema = z
    .object({
        version: z.number().int().positive(),
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(5000).nullable().optional(),
        priority: z.enum(priorities).optional(),
        assigneeId: z.uuid().nullable().optional(),
        completed: z.boolean().optional(),
    })
    .refine((body) => Object.keys(body).length > 1, { message: 'Nothing to update' });

// GET /api/boards/:id/cards
export async function list(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    res.json(await cardService.listCards(boardId, req.user!));
}

// POST /api/columns/:id/cards
export async function create(req: Request, res: Response) {
    const columnId = idSchema.parse(req.params.id);
    const input = createCardSchema.parse(req.body);
    res.status(201).json(await cardService.createCard(columnId, input, req.user!));
}

// GET /api/cards/:id
export async function getOne(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    res.json(await cardService.getCard(cardId, req.user!));
}

// PATCH /api/cards/:id
export async function update(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    const input = updateCardSchema.parse(req.body);
    res.json(await cardService.updateCard(cardId, input, req.user!));
}

// DELETE /api/cards/:id
export async function remove(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    await cardService.deleteCard(cardId, req.user!);
    res.status(204).end();
}
