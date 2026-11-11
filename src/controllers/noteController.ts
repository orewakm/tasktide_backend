import { Request, Response } from 'express';
import { z } from 'zod';
import * as noteService from '../services/noteService';

const idSchema = z.uuid();
// Same shape for adding and editing a note.
// TR: Not eklerken ve düzenlerken aynı yapı kullanılır.
const noteSchema = z.object({ content: z.string().trim().min(1).max(5000) });

// GET /api/cards/:id/notes
// Any member of the card's board can read its notes.
// TR: Kartın panosundaki her üye notları okuyabilir.
export async function list(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    res.json(await noteService.listNotes(cardId, req.user!));
}

// POST /api/cards/:id/notes
// Only the card's assignee can add notes; other members get 403.
// TR: Sadece kartın atanan kişisi not ekleyebilir; diğer üyeler 403 alır.
export async function create(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    const { content } = noteSchema.parse(req.body);
    res.status(201).json(await noteService.addNote(cardId, content, req.user!));
}

// PATCH /api/notes/:id
// Only the author can edit, not even the board owner.
// TR: Sadece notu yazan kişi düzenleyebilir, pano sahibi bile düzenleyemez.
export async function update(req: Request, res: Response) {
    const noteId = idSchema.parse(req.params.id);
    const { content } = noteSchema.parse(req.body);
    res.json(await noteService.editNote(noteId, content, req.user!));
}

// DELETE /api/notes/:id
// The author or the board owner can delete.
// TR: Notu yazan kişi veya pano sahibi silebilir.
export async function remove(req: Request, res: Response) {
    const noteId = idSchema.parse(req.params.id);
    await noteService.deleteNote(noteId, req.user!);
    res.status(204).end();
}
