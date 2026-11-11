import { AppError } from '../errors/AppError';
import * as timeEntryRepository from '../repositories/timeEntryRepository';
import * as realtime from '../sockets/realtime';
import * as boardService from './boardService';
import type { Actor } from './boardService';
import * as cardService from './cardService';

// Any member can track time on a card of their board.
// The database (one_running_timer_per_user) guarantees one running timer per user.
export async function startTimer(cardId: string, actor: Actor) {
    const card = await cardService.getAccessibleCard(cardId, actor);
    const entry = await timeEntryRepository.start(card.id, actor.id).catch((err) => {
        if ((err as { code?: string }).code === '23505') {
            throw new AppError(409, 'You already have a running timer. Stop it first.');
        }
        throw err;
    });
    // Lets the board show who is working on which card right now.
    realtime.emitToBoard(entry.board_id, 'timer:started', entry);
    return entry;
}

// Users can only stop their own timer, so no board check is needed.
export async function stopTimer(actor: Actor) {
    const entry = await timeEntryRepository.stopRunning(actor.id);
    if (!entry) throw new AppError(404, 'No running timer');
    realtime.emitToBoard(entry.board_id, 'timer:stopped', entry);
    return entry;
}

// Returns null when no timer is running.
export async function getRunningTimer(actor: Actor) {
    return timeEntryRepository.getRunning(actor.id);
}

export async function listEntries(cardId: string, actor: Actor) {
    await cardService.getAccessibleCard(cardId, actor);
    return timeEntryRepository.listByCard(cardId);
}

// The entry's own user or the board owner (or super admin) can delete it.
export async function deleteEntry(entryId: string, actor: Actor) {
    const entry = await timeEntryRepository.getById(entryId);
    if (!entry) throw new AppError(404, 'Time entry not found');
    const board = await boardService.getAccessibleBoard(entry.board_id, actor, 'Time entry not found');

    if (entry.user_id !== actor.id && !boardService.canManageBoard(board, actor)) {
        throw new AppError(403, 'Only the user who tracked it or the board owner can delete this entry');
    }
    const deleted = await timeEntryRepository.remove(entryId);
    if (!deleted) throw new AppError(404, 'Time entry not found');
    realtime.emitToBoard(entry.board_id, 'time-entry:deleted', {
        id: entry.id,
        card_id: entry.card_id,
        user_id: entry.user_id,
    });
}
