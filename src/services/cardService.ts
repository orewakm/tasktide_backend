import { withTransaction } from '../db';
import { positionAt } from '../utils/position';
import { AppError } from '../errors/AppError';
import * as cardRepository from '../repositories/cardRepository';
import type { Card, CardSort, Priority } from '../repositories/cardRepository';
import * as memberRepository from '../repositories/boardMemberRepository';
import * as boardService from './boardService';
import type { Actor } from './boardService';
import * as columnService from './columnService';
import * as realtime from '../sockets/realtime';

export interface CardInput {
    title: string;
    description?: string | null;
    priority: Priority;
    assigneeId?: string | null;
}

export interface CardUpdate {
    version: number;
    title?: string;
    description?: string | null;
    priority?: Priority;
    assigneeId?: string | null;
    completed?: boolean;
}

export interface CardMove {
    columnId: string;
    index: number;
}
// Returns the card if the user can access its board, otherwise throws 404.
export async function getAccessibleCard(cardId: string, actor: Actor) {
    const card = await cardRepository.getById(cardId);
    if (!card) throw new AppError(404, 'Card not found');
    await boardService.getAccessibleBoard(card.board_id, actor, 'Card not found');
    return card;
}

// Throws 400 if the assignee isn't an active member of the board.
export async function assertAssigneeIsMember(boardId: string, userId: string) {
    const isMember = await memberRepository.isActiveMember(boardId, userId);
    if (!isMember) throw new AppError(400, 'Assignee must be an active member of the board');
}

// Returns every card on a board the user can access.
export async function listCards(boardId: string, actor: Actor) {
    await boardService.getAccessibleBoard(boardId, actor);
    return cardRepository.listByBoard(boardId);
}

export interface CardQuery {
    boardId?: string;
    columnId?: string;
    status?: 'completed' | 'pending';
    priority?: Priority;
    assigneeId?: string;
    search?: string;
    sort: CardSort;
    order: 'asc' | 'desc';
    page: number;
    limit: number;
}

// Returns one page of the user's task list with filters, search and sorting.
export async function findCards(query: CardQuery, actor: Actor) {
    if (query.boardId) await boardService.getAccessibleBoard(query.boardId, actor);

    const { rows, total } = await cardRepository.find({
        memberId: actor.role === 'super_admin' ? null : actor.id,
        boardId: query.boardId,
        columnId: query.columnId,
        completed: query.status === undefined ? undefined : query.status === 'completed',
        priority: query.priority,
        assigneeId: query.assigneeId === 'me' ? actor.id : query.assigneeId,
        search: query.search,
        sort: query.sort,
        order: query.order,
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
    });
    return {
        data: rows,
        page: query.page,
        limit: query.limit,
        total,
        total_pages: Math.ceil(total / query.limit),
    };
}

// Creates a card in a column.
export async function createCard(columnId: string, input: CardInput, actor: Actor) {
    const column = await columnService.getAccessibleColumn(columnId, actor);
    if (input.assigneeId) await assertAssigneeIsMember(column.board_id, input.assigneeId);

    const card = await cardRepository.create(
        column.id,
        input.title,
        input.description ?? null,
        input.priority,
        input.assigneeId ?? null
    );
    realtime.emitToBoard(column.board_id, 'card:created', card);
    return card;
}

// Returns one card the user can access.
export async function getCard(cardId: string, actor: Actor) {
    return getAccessibleCard(cardId, actor);
}

// Works out the new completed_at value from the completed flag.
function resolveCompletedAt(card: Card, completed: boolean | undefined) {
    if (completed === undefined) return card.completed_at;
    if (!completed) return null;
    return card.completed_at ?? new Date();
}

const CONFLICT_MESSAGE = 'Card was changed by someone else. Reload it and try again.';

// Edits a card, or throws 409 if someone else saved it first.
export async function updateCard(cardId: string, input: CardUpdate, actor: Actor) {
    const card = await getAccessibleCard(cardId, actor);
    if (input.version !== card.version) throw new AppError(409, CONFLICT_MESSAGE);

    if (input.assigneeId) await assertAssigneeIsMember(card.board_id, input.assigneeId);

    const updated = await cardRepository.update(cardId, input.version, {
        title: input.title ?? card.title,
        description: input.description !== undefined ? input.description : card.description,
        priority: input.priority ?? card.priority,
        assigneeId: input.assigneeId !== undefined ? input.assigneeId : card.assignee_id,
        completedAt: resolveCompletedAt(card, input.completed),
    });

    if (!updated) {
        const stillExists = await cardRepository.getById(cardId);
        if (!stillExists) throw new AppError(404, 'Card not found');
        throw new AppError(409, CONFLICT_MESSAGE);
    }
    realtime.emitToBoard(card.board_id, 'card:updated', updated);
    return updated;
}

// Deletes a card for the board owner.
export async function deleteCard(cardId: string, actor: Actor) {
    const card = await getAccessibleCard(cardId, actor);
    await boardService.getOwnedBoard(card.board_id, actor);
    const deleted = await cardRepository.softDelete(cardId);
    if (!deleted) throw new AppError(404, 'Card not found');
    realtime.emitToBoard(card.board_id, 'card:deleted', { id: card.id, column_id: card.column_id });
}

// Moves a card to a new spot in a column on the same board.
export async function moveCard(cardId: string, input: CardMove, actor: Actor) {
    const card = await getAccessibleCard(cardId, actor);
    const target = await columnService.getAccessibleColumn(input.columnId, actor);
    if (target.board_id !== card.board_id) {
        throw new AppError(400, 'A card can only be moved to a column on the same board');
    }

    const { moved, renumbered } = await withTransaction(async (client) => {
        const locked = await cardRepository.lockColumn(client, target.id);
        if (!locked) throw new AppError(404, 'Column not found');

        let renumbered: { id: string; position: number }[] | null = null;
        let positions = await cardRepository.listPositions(client, target.id, card.id);
        let position = positionAt(positions, input.index);
        if (position === null) {
            renumbered = await cardRepository.renumber(client, target.id);
            positions = await cardRepository.listPositions(client, target.id, card.id);
            position = positionAt(positions, input.index)!;
        }

        const moved = await cardRepository.moveTo(client, card.id, target.id, position);
        if (!moved) throw new AppError(404, 'Card not found');
        return { moved, renumbered };
    });

    if (renumbered) {
        realtime.emitToBoard(card.board_id, 'cards:renumbered', {
            column_id: target.id,
            cards: renumbered,
        });
    }
    realtime.emitToBoard(card.board_id, 'card:moved', { ...moved, from_column_id: card.column_id });
    return moved;
}
