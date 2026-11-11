import { AppError } from '../errors/AppError';
import * as columnRepository from '../repositories/columnRepository';
import * as boardService from './boardService';
import type { Actor } from './boardService';
import { withTransaction } from '../db';
import { positionAt } from '../utils/position';
import * as realtime from '../sockets/realtime';

// Finds the column, then checks the actor can access its board (404 if not).
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
export async function deleteColumn(columnId: string, actor: Actor) {
    const column = await getAccessibleColumn(columnId, actor); // 404 for non-members
    await boardService.getOwnedBoard(column.board_id, actor); // 403 for non-owners
    const deleted = await columnRepository.softDelete(columnId);
    if (!deleted) throw new AppError(404, 'Column not found');
    realtime.emitToBoard(column.board_id, 'column:deleted', {
        id: column.id,
        board_id: column.board_id,
    });
}

// Any member can reorder columns (nothing gets lost, so it's not owner-only).
export async function moveColumn(columnId: string, index: number, actor: Actor) {
    const column = await getAccessibleColumn(columnId, actor); // 404 for non-members

    const { moved, renumbered } = await withTransaction(async (client) => {
        const locked = await columnRepository.lockBoard(client, column.board_id);
        if (!locked) throw new AppError(404, 'Column not found'); // board deleted in the meantime

        let renumbered: { id: string; position: number }[] | null = null;
        let positions = await columnRepository.listPositions(client, column.board_id, column.id);
        let position = positionAt(positions, index);
        if (position === null) {
            renumbered = await columnRepository.renumber(client, column.board_id);
            positions = await columnRepository.listPositions(client, column.board_id, column.id);
            position = positionAt(positions, index)!;
        }

        const moved = await columnRepository.moveTo(client, column.id, position);
        if (!moved) throw new AppError(404, 'Column not found'); // deleted in the meantime
        return { moved, renumbered };
    });

    // Sent only after COMMIT, so clients never hear about a change that got rolled back.
    // Renumbered positions go first; the moved column's new position then overrides its own.
    if (renumbered) {
        realtime.emitToBoard(column.board_id, 'columns:renumbered', {
            board_id: column.board_id,
            columns: renumbered,
        });
    }
    realtime.emitToBoard(column.board_id, 'column:moved', moved);
    return moved;
}
