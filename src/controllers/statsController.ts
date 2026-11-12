import { Request, Response } from 'express';
import { z } from 'zod';
import * as statsService from '../services/statsService';

const idSchema = z.uuid();

// Builds the schema for the ?days query parameter with the given default.
function daysQuery(fallback: number) {
    return z.object({ days: z.coerce.number().int().min(1).max(365).default(fallback) });
}

// Returns a board's tracked time per user, card and day (GET /api/boards/:id/stats).
export async function board(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    const { days } = daysQuery(30).parse(req.query);
    res.json(await statsService.boardStats(boardId, days, req.user!));
}

// Returns a card's all-time tracked time per user (GET /api/cards/:id/stats).
export async function card(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    res.json(await statsService.cardStats(cardId, req.user!));
}

// Returns the user's own tracked time per board and day (GET /api/time-entries/stats).
export async function mine(req: Request, res: Response) {
    const { days } = daysQuery(7).parse(req.query);
    res.json(await statsService.myStats(days, req.user!));
}
