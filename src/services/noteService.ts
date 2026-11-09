import { AppError } from '../errors/AppError';
import * as noteRepository from '../repositories/noteRepository';
import * as boardService from './boardService';
import type { Actor } from './boardService';
import * as cardService from './cardService';

// Finds the note and its board; non-members get 404.
async function getAccessibleNote(noteId: string, actor: Actor) {
    const note = await noteRepository.getById(noteId);
    if (!note) throw new AppError(404, 'Note not found');
    const board = await boardService.getAccessibleBoard(note.board_id, actor, 'Note not found');
    return { note, board };
}

// Any member can read the notes of a card.
export async function listNotes(cardId: string, actor: Actor) {
    await cardService.getAccessibleCard(cardId, actor);
    return noteRepository.listByCard(cardId);
}

// Only the card's assignee (or super admin) can add notes.
export async function addNote(cardId: string, content: string, actor: Actor) {
    const card = await cardService.getAccessibleCard(cardId, actor);
    if (card.assignee_id !== actor.id && actor.role !== 'super_admin') {
        throw new AppError(403, 'Only the assignee can add notes to this card');
    }
    return noteRepository.create(cardId, actor.id, content);
}

// Only the author (or super admin) can edit a note.
export async function editNote(noteId: string, content: string, actor: Actor) {
    const { note } = await getAccessibleNote(noteId, actor);
    if (note.author_id !== actor.id && actor.role !== 'super_admin') {
        throw new AppError(403, 'Only the author can edit this note');
    }
    const updated = await noteRepository.update(noteId, content);
    if (!updated) throw new AppError(404, 'Note not found');
    return updated;
}

// The author or the board owner (or super admin) can delete a note.
export async function deleteNote(noteId: string, actor: Actor) {
    const { note, board } = await getAccessibleNote(noteId, actor);
    if (note.author_id !== actor.id && !boardService.canManageBoard(board, actor)) {
        throw new AppError(403, 'Only the author or the board owner can delete this note');
    }
    const deleted = await noteRepository.remove(noteId);
    if (!deleted) throw new AppError(404, 'Note not found');
}
