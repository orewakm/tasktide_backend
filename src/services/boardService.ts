import { AppError } from '../errors/AppError';
import * as boardRepository from '../repositories/boardRepository';
import type { Role } from '../repositories/userRepository';
import * as realtime from '../sockets/realtime';

export type Actor = { id: string; role: Role };

// Non-members get 404 so they can't tell the board exists.
// notFoundMessage lets callers say "Card not found" etc. instead of "Board not found".
export async function getAccessibleBoard(
    boardId: string,
    actor: Actor,
    notFoundMessage = 'Board not found'
) {
    const board =
        actor.role === 'super_admin'
            ? await boardRepository.getById(boardId)
            : await boardRepository.getForMember(boardId, actor.id);
    if (!board) throw new AppError(404, notFoundMessage);
    return board;
}

// The owner (or super admin) manages the board: deletes, members, settings.
export function canManageBoard(board: { owner_id: string }, actor: Actor) {
    return board.owner_id === actor.id || actor.role === 'super_admin';
}

// 404 for non-members, 403 for members who aren't the owner.
export async function getOwnedBoard(boardId: string, actor: Actor) {
    const board = await getAccessibleBoard(boardId, actor);
    if (!canManageBoard(board, actor)) {
        throw new AppError(403, 'Only the board owner can do this');
    }

    return board;
}

export async function createBoard(name: string, actor: Actor) {
    return boardRepository.create(name, actor.id);
}

export async function listBoards(actor: Actor) {
    return boardRepository.listByUserId(actor.id);
}

export async function renameBoard(boardId: string, name: string, actor: Actor) {
    await getOwnedBoard(boardId, actor);
    const board = await boardRepository.rename(boardId, name);
    if (!board) throw new AppError(404, 'Board not found');
    realtime.emitToBoard(board.id, 'board:updated', board);
    return board;
}

export async function deleteBoard(boardId: string, actor: Actor) {
    const board = await getOwnedBoard(boardId, actor);
    const deleted = await boardRepository.softDelete(boardId, board.owner_id);
    if (!deleted) throw new AppError(404, 'Board not found');
    realtime.emitToBoard(boardId, 'board:deleted', { id: boardId });
    realtime.closeBoardRoom(boardId);
}
