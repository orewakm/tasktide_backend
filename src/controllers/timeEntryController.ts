import { Request, Response } from 'express';
import { z } from 'zod';
import * as timeEntryService from '../services/timeEntryService';

const idSchema = z.uuid();

// Starts a timer on a card (POST /api/cards/:id/time-entries).
export async function start(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    res.status(201).json(await timeEntryService.startTimer(cardId, req.user!));
}

// Returns the time entries of a card (GET /api/cards/:id/time-entries).
export async function listForCard(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    res.json(await timeEntryService.listEntries(cardId, req.user!));
}

// Returns the user's running timer, or null (GET /api/time-entries/current).
export async function current(req: Request, res: Response) {
    res.json(await timeEntryService.getRunningTimer(req.user!));
}

// Stops the user's running timer (POST /api/time-entries/stop).
export async function stop(req: Request, res: Response) {
    res.json(await timeEntryService.stopTimer(req.user!));
}

// Deletes a time entry (DELETE /api/time-entries/:id).
export async function remove(req: Request, res: Response) {
    const entryId = idSchema.parse(req.params.id);
    await timeEntryService.deleteEntry(entryId, req.user!);
    res.status(204).end();
}
