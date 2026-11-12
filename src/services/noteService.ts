import { AppError } from '../errors/AppError';
import * as noteRepository from '../repositories/noteRepository';
import * as realtime from '../sockets/realtime';
import * as boardService from './boardService';
import type { Actor } from './boardService';
import * as cardService from './cardService';

// Returns the note and its board if the user can access them, otherwise throws 404.
async function getAccessibleNote(noteId: string, actor: Actor) {
    const note = await noteRepository.getById(noteId);
    if (!note) throw new AppError(404, 'Note not found');
    const board = await boardService.getAccessibleBoard(note.board_id, actor, 'Note not found');
    return { note, board };
}

// Returns a card's notes.
export async function listNotes(cardId: string, actor: Actor) {
    await cardService.getAccessibleCard(cardId, actor);
    return noteRepository.listByCard(cardId);
}

// Adds a note to a card for the card's assignee.
export async function addNote(cardId: string, content: string, actor: Actor) {
    const card = await cardService.getAccessibleCard(cardId, actor);
    if (card.assignee_id !== actor.id && actor.role !== 'super_admin') {
        throw new AppError(403, 'Only the assignee can add notes to this card');
    }
    const note = await noteRepository.create(cardId, actor.id, content);
    realtime.emitToBoard(card.board_id, 'note:created', note);
    return note;
}

// Edits a note for its author.
export async function editNote(noteId: string, content: string, actor: Actor) {
    const { note } = await getAccessibleNote(noteId, actor);
    if (note.author_id !== actor.id && actor.role !== 'super_admin') {
        throw new AppError(403, 'Only the author can edit this note');
    }
    const updated = await noteRepository.update(noteId, content);
    if (!updated) throw new AppError(404, 'Note not found');
    realtime.emitToBoard(note.board_id, 'note:updated', updated);
    return updated;
}

// Deletes a note for its author or the board owner.
export async function deleteNote(noteId: string, actor: Actor) {
    const { note, board } = await getAccessibleNote(noteId, actor);
    if (note.author_id !== actor.id && !boardService.canManageBoard(board, actor)) {
        throw new AppError(403, 'Only the author or the board owner can delete this note');
    }
    const deleted = await noteRepository.remove(noteId);
    if (!deleted) throw new AppError(404, 'Note not found');
    realtime.emitToBoard(note.board_id, 'note:deleted', { id: note.id, card_id: note.card_id });
}
