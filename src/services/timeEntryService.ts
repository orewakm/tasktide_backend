import { AppError } from '../errors/AppError';
import * as timeEntryRepository from '../repositories/timeEntryRepository';
import * as realtime from '../sockets/realtime';
import * as boardService from './boardService';
import type { Actor } from './boardService';
import * as cardService from './cardService';

// Any member can track time on a card of their board.
// The database (one_running_timer_per_user) guarantees one running timer per user.
// A second start fails with 23505 (unique violation), which we turn into a 409.
// TR: Herhangi bir üye kendi panosundaki bir kartta zaman tutabilir.
// TR: Kullanıcı başına tek çalışan zamanlayıcıyı veritabanı (one_running_timer_per_user) garanti eder.
// TR: İkinci bir başlatma 23505 (unique violation) ile düşer, biz de bunu 409'a çeviririz.
export async function startTimer(cardId: string, actor: Actor) {
    const card = await cardService.getAccessibleCard(cardId, actor);
    const entry = await timeEntryRepository.start(card.id, actor.id).catch((err) => {
        if ((err as { code?: string }).code === '23505') {
            throw new AppError(409, 'You already have a running timer. Stop it first.');
        }
        throw err;
    });
    // Lets the board show who is working on which card right now.
    // TR: Panonun, şu anda kimin hangi kart üzerinde çalıştığını göstermesini sağlar.
    realtime.emitToBoard(entry.board_id, 'timer:started', entry);
    return entry;
}

// Users can only stop their own timer, so no board check is needed.
// TR: Kullanıcılar sadece kendi zamanlayıcılarını durdurabilir, bu yüzden pano kontrolüne gerek yok.
export async function stopTimer(actor: Actor) {
    const entry = await timeEntryRepository.stopRunning(actor.id);
    if (!entry) throw new AppError(404, 'No running timer');
    realtime.emitToBoard(entry.board_id, 'timer:stopped', entry);
    return entry;
}

// Returns null when no timer is running.
// TR: Çalışan bir zamanlayıcı yoksa null döner.
export async function getRunningTimer(actor: Actor) {
    return timeEntryRepository.getRunning(actor.id);
}

export async function listEntries(cardId: string, actor: Actor) {
    await cardService.getAccessibleCard(cardId, actor);
    return timeEntryRepository.listByCard(cardId);
}

// The entry's own user or the board owner (or super admin) can delete it.
// TR: Zaman kaydını, kaydı tutan kullanıcı ya da pano sahibi (veya süper admin) silebilir.
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
