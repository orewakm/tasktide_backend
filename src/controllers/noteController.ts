import { Request, Response } from 'express';
import { z } from 'zod';
import * as noteService from '../services/noteService';

const idSchema = z.uuid();
const noteSchema = z.object({ content: z.string().trim().min(1).max(5000) });

// Returns the notes of a card (GET /api/cards/:id/notes).
export async function list(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    res.json(await noteService.listNotes(cardId, req.user!));
}

// Adds a note to a card (POST /api/cards/:id/notes).
export async function create(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    const { content } = noteSchema.parse(req.body);
    res.status(201).json(await noteService.addNote(cardId, content, req.user!));
}

// Edits a note (PATCH /api/notes/:id).
export async function update(req: Request, res: Response) {
    const noteId = idSchema.parse(req.params.id);
    const { content } = noteSchema.parse(req.body);
    res.json(await noteService.editNote(noteId, content, req.user!));
}

// Deletes a note (DELETE /api/notes/:id).
export async function remove(req: Request, res: Response) {
    const noteId = idSchema.parse(req.params.id);
    await noteService.deleteNote(noteId, req.user!);
    res.status(204).end();
}
