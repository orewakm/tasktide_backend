import { AppError } from '../errors/AppError';
import * as boardRepository from '../repositories/boardRepository';
import type { Role } from '../repositories/userRepository';

export type Actor = { id: string; role: Role };

export async function getAccessibleBoard(boardId: string, actor: Actor) {
    const board =
        actor.role === 'super_admin'
            ? await boardRepository.getById(boardId)
            : await boardRepository.getForMember(boardId, actor.id);
    if (!board) throw new AppError(404, 'Board not found');
    return board;
}

export async function getOwnedBoard(boardId: string, actor: Actor) {
    const board = await getAccessibleBoard(boardId, actor);
    if (board.owner_id !== actor.id && actor.role !== 'super_admin') {
        throw new AppError(403, 'Only the owner can do this');
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
    return board;
}

export async function deleteBoard(boardId: string, actor: Actor) {
    const board = await getOwnedBoard(boardId, actor);
    const deleted = await boardRepository.softDelete(boardId, board.owner_id);
    if (!deleted) throw new AppError(404, 'Board not found');
}
