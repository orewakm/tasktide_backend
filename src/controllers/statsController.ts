import { Request, Response } from 'express';
import { z } from 'zod';
import * as statsService from '../services/statsService';

const idSchema = z.uuid();

// ?days=N (1 to 365). Query string values are always strings, so z.coerce turns "30" into 30.
// Missing days falls back to the default; out of range is a 400.
// TR: ?days=N (1 ile 365 arası). Query string değerleri her zaman string'dir, bu yüzden z.coerce "30"u 30'a çevirir.
// TR: days gönderilmezse varsayılan değer kullanılır; aralık dışı bir değer 400 verir.
function daysQuery(fallback: number) {
    return z.object({ days: z.coerce.number().int().min(1).max(365).default(fallback) });
}

// GET /api/boards/:id/stats?days=30
// days includes today, so 30 means today plus the 29 days before it.
// TR: days bugünü de kapsar, yani 30 bugün artı önceki 29 gün demektir.
export async function board(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    const { days } = daysQuery(30).parse(req.query);
    res.json(await statsService.boardStats(boardId, days, req.user!));
}

// GET /api/cards/:id/stats
// All-time totals for the card, so there's no days parameter here.
// TR: Kartın tüm zamanlardaki toplamları, bu yüzden burada days parametresi yok.
export async function card(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    res.json(await statsService.cardStats(cardId, req.user!));
}

// GET /api/time-entries/stats?days=7
// Only the logged-in user's own time, across all their boards.
// TR: Sadece giriş yapmış kullanıcının kendi süresi, tüm panoları genelinde.
export async function mine(req: Request, res: Response) {
    const { days } = daysQuery(7).parse(req.query);
    res.json(await statsService.myStats(days, req.user!));
}
