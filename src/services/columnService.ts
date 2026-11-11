import { AppError } from '../errors/AppError';
import * as columnRepository from '../repositories/columnRepository';
import * as boardService from './boardService';
import type { Actor } from './boardService';
import { withTransaction } from '../db';
import { positionAt } from '../utils/position';
import * as realtime from '../sockets/realtime';

// Finds the column, then checks the actor can access its board (404 if not).
// TR: Sütunu bulur, sonra kullanıcının sütunun panosuna erişimi olup olmadığına bakar (yoksa 404).
export async function getAccessibleColumn(columnId: string, actor: Actor) {
    const column = await columnRepository.getById(columnId);
    if (!column) throw new AppError(404, 'Column not found');
    await boardService.getAccessibleBoard(column.board_id, actor, 'Column not found');
    return column;
}

export async function listColumns(boardId: string, actor: Actor) {
    await boardService.getAccessibleBoard(boardId, actor);
    return columnRepository.listByBoard(boardId);
}

// Any member can add or rename columns; only deleting is owner-only.
// TR: Sütun eklemek ve adını değiştirmek her üyeye açık; sadece silmek pano sahibine özel.
export async function createColumn(boardId: string, name: string, actor: Actor) {
    await boardService.getAccessibleBoard(boardId, actor);
    const column = await columnRepository.create(boardId, name);
    realtime.emitToBoard(boardId, 'column:created', column);
    return column;
}

export async function renameColumn(columnId: string, name: string, actor: Actor) {
    await getAccessibleColumn(columnId, actor);
    const column = await columnRepository.rename(columnId, name);
    if (!column) throw new AppError(404, 'Column not found');
    realtime.emitToBoard(column.board_id, 'column:updated', column);
    return column;
}

// Deleting a column hides all its cards, so only the board owner can do it.
// TR: Bir sütunu silmek içindeki tüm kartları gizler, bu yüzden sadece pano sahibi yapabilir.
export async function deleteColumn(columnId: string, actor: Actor) {
    const column = await getAccessibleColumn(columnId, actor); // 404 for non-members (TR: üye değilse 404)
    await boardService.getOwnedBoard(column.board_id, actor); // 403 for non-owners (TR: pano sahibi değilse 403)
    const deleted = await columnRepository.softDelete(columnId);
    if (!deleted) throw new AppError(404, 'Column not found');
    realtime.emitToBoard(column.board_id, 'column:deleted', {
        id: column.id,
        board_id: column.board_id,
    });
}

// Any member can reorder columns (nothing gets lost, so it's not owner-only).
// Same idea as moveCard, but the lock is on the board since columns are ordered per board.
// TR: Sütunların sırasını herhangi bir üye değiştirebilir (hiçbir şey kaybolmaz, bu yüzden
// TR: pano sahibine özel değil).
// TR: moveCard ile aynı mantık, ama sütunlar pano içinde sıralandığı için kilit panoya konur.
export async function moveColumn(columnId: string, index: number, actor: Actor) {
    const column = await getAccessibleColumn(columnId, actor); // 404 for non-members (TR: üye değilse 404)

    const { moved, renumbered } = await withTransaction(async (client) => {
        // Concurrent column moves on this board wait here, one after another.
        // TR: Bu panodaki eş zamanlı sütun taşımaları burada sırayla bekler.
        const locked = await columnRepository.lockBoard(client, column.board_id);
        if (!locked) throw new AppError(404, 'Column not found'); // board deleted in the meantime (TR: pano bu arada silinmiş)

        let renumbered: { id: string; position: number }[] | null = null;
        let positions = await columnRepository.listPositions(client, column.board_id, column.id);
        let position = positionAt(positions, index);
        if (position === null) {
            // No room left between the neighbours: spread all columns back to 1000 gaps.
            // TR: Komşular arasında yer kalmadı: tüm sütunları tekrar 1000'lik aralıklara yay.
            renumbered = await columnRepository.renumber(client, column.board_id);
            positions = await columnRepository.listPositions(client, column.board_id, column.id);
            position = positionAt(positions, index)!;
        }

        const moved = await columnRepository.moveTo(client, column.id, position);
        if (!moved) throw new AppError(404, 'Column not found'); // deleted in the meantime (TR: bu arada silinmiş)
        return { moved, renumbered };
    });

    // Sent only after COMMIT, so clients never hear about a change that got rolled back.
    // Renumbered positions go first; the moved column's new position then overrides its own.
    // TR: Sadece COMMIT'ten sonra gönderilir, böylece client'lar rollback olmuş
    // TR: bir değişikliği hiç duymaz.
    // TR: Önce yeniden numaralanan pozisyonlar gider; ardından taşınan sütunun yeni pozisyonu
    // TR: o listedeki kendi değerinin üzerine yazar.
    if (renumbered) {
        realtime.emitToBoard(column.board_id, 'columns:renumbered', {
            board_id: column.board_id,
            columns: renumbered,
        });
    }
    realtime.emitToBoard(column.board_id, 'column:moved', moved);
    return moved;
}
