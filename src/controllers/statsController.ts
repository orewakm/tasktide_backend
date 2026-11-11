import { Request, Response } from 'express';
import { z } from 'zod';
import * as statsService from '../services/statsService';

const idSchema = z.uuid();

// ?days=N (1 to 365). Query values are strings, so coerce turns "30" into 30.
function daysQuery(fallback: number) {
    return z.object({ days: z.coerce.number().int().min(1).max(365).default(fallback) });
}

// GET /api/boards/:id/stats?days=30
export async function board(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    const { days } = daysQuery(30).parse(req.query);
    res.json(await statsService.boardStats(boardId, days, req.user!));
}

// GET /api/cards/:id/stats
export async function card(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    res.json(await statsService.cardStats(cardId, req.user!));
}

// GET /api/time-entries/stats?days=7
export async function mine(req: Request, res: Response) {
    const { days } = daysQuery(7).parse(req.query);
    res.json(await statsService.myStats(days, req.user!));
}
