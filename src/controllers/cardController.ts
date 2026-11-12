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

const moveCardSchema = z.object({
    columnId: z.uuid(),
    index: z.number().int().min(0),
});

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

const findCardsSchema = z.object({
    boardId: z.uuid().optional(),
    columnId: z.uuid().optional(),
    status: z.enum(['completed', 'pending']).optional(),
    priority: z.enum(priorities).optional(),
    assigneeId: z.union([z.uuid(), z.literal('me')]).optional(),
    search: z.string().trim().min(1).max(100).optional(),
    sort: z.enum(['created_at', 'updated_at', 'priority', 'title']).default('created_at'),
    order: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Returns the task list with filters, search, sorting and pagination (GET /api/cards).
export async function find(req: Request, res: Response) {
    const query = findCardsSchema.parse(req.query);
    res.json(await cardService.findCards(query, req.user!));
}

// Returns every card on a board in order (GET /api/boards/:id/cards).
export async function list(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    res.json(await cardService.listCards(boardId, req.user!));
}

// Creates a card at the bottom of a column (POST /api/columns/:id/cards).
export async function create(req: Request, res: Response) {
    const columnId = idSchema.parse(req.params.id);
    const input = createCardSchema.parse(req.body);
    res.status(201).json(await cardService.createCard(columnId, input, req.user!));
}

// Returns one card (GET /api/cards/:id).
export async function getOne(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    res.json(await cardService.getCard(cardId, req.user!));
}

// Edits a card if the sent version is still the latest (PATCH /api/cards/:id).
export async function update(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    const input = updateCardSchema.parse(req.body);
    res.json(await cardService.updateCard(cardId, input, req.user!));
}

// Deletes a card (DELETE /api/cards/:id).
export async function remove(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    await cardService.deleteCard(cardId, req.user!);
    res.status(204).end();
}

// Moves a card to a new spot in a column (PATCH /api/cards/:id/move).
export async function move(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    const input = moveCardSchema.parse(req.body);
    res.json(await cardService.moveCard(cardId, input, req.user!));
}
