import { AppError } from '../errors/AppError';
import * as boardRepository from '../repositories/boardRepository';
import type { Role } from '../repositories/userRepository';
import * as realtime from '../sockets/realtime';

export type Actor = { id: string; role: Role };

// Returns the board if the user can access it, otherwise throws 404.
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

// Checks whether the user is the board's owner or the super admin.
export function canManageBoard(board: { owner_id: string }, actor: Actor) {
    return board.owner_id === actor.id || actor.role === 'super_admin';
}

// Returns the board if the user owns it, otherwise throws 404 or 403.
export async function getOwnedBoard(boardId: string, actor: Actor) {
    const board = await getAccessibleBoard(boardId, actor);
    if (!canManageBoard(board, actor)) {
        throw new AppError(403, 'Only the board owner can do this');
    }

    return board;
}

// Creates a board owned by the user.
export async function createBoard(name: string, actor: Actor) {
    return boardRepository.create(name, actor.id);
}

// Returns the boards the user is an active member of.
export async function listBoards(actor: Actor) {
    return boardRepository.listByUserId(actor.id);
}

// Renames a board for its owner.
export async function renameBoard(boardId: string, name: string, actor: Actor) {
    await getOwnedBoard(boardId, actor);
    const board = await boardRepository.rename(boardId, name);
    if (!board) throw new AppError(404, 'Board not found');
    realtime.emitToBoard(board.id, 'board:updated', board);
    return board;
}

// Deletes a board for its owner.
export async function deleteBoard(boardId: string, actor: Actor) {
    const board = await getOwnedBoard(boardId, actor);
    const deleted = await boardRepository.softDelete(boardId, board.owner_id);
    if (!deleted) throw new AppError(404, 'Board not found');
    realtime.emitToBoard(boardId, 'board:deleted', { id: boardId });
    realtime.closeBoardRoom(boardId);
}
