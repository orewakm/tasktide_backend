import { Request, Response } from 'express';
import { z } from 'zod';
import * as timeEntryService from '../services/timeEntryService';

const idSchema = z.uuid();

// POST /api/cards/:id/time-entries
// Starts a timer on this card for the logged-in user. A user can only have one running
// timer (the database enforces it), so a second start gets 409.
// TR: Giriş yapmış kullanıcı için bu kartta bir zamanlayıcı başlatır. Kullanıcının aynı anda
// TR: tek bir çalışan zamanlayıcısı olabilir (veritabanı bunu zorlar), bu yüzden ikinci başlatma 409 alır.
export async function start(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    res.status(201).json(await timeEntryService.startTimer(cardId, req.user!));
}

// GET /api/cards/:id/time-entries
export async function listForCard(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    res.json(await timeEntryService.listEntries(cardId, req.user!));
}

// GET /api/time-entries/current
// Responds 200 with null when nothing is running. Having no timer is normal, so it's not a 404.
// TR: Çalışan bir şey yoksa 200 ile null döner. Zamanlayıcının olmaması normaldir, bu yüzden 404 değil.
export async function current(req: Request, res: Response) {
    res.json(await timeEntryService.getRunningTimer(req.user!));
}

// POST /api/time-entries/stop
// No id needed: it stops whichever timer the user has running (404 if none).
// TR: id gerekmez: kullanıcının o an çalışan zamanlayıcısını durdurur (yoksa 404).
export async function stop(req: Request, res: Response) {
    res.json(await timeEntryService.stopTimer(req.user!));
}

// DELETE /api/time-entries/:id
// The user who tracked the time or the board owner can delete it.
// TR: Süreyi kaydeden kullanıcı veya pano sahibi bu zaman kaydını silebilir.
export async function remove(req: Request, res: Response) {
    const entryId = idSchema.parse(req.params.id);
    await timeEntryService.deleteEntry(entryId, req.user!);
    res.status(204).end();
}
