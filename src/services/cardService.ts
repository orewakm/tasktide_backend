import { withTransaction } from '../db';
import { positionAt } from '../utils/position';
import { AppError } from '../errors/AppError';
import * as cardRepository from '../repositories/cardRepository';
import type { Card, Priority } from '../repositories/cardRepository';
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

// Every field is optional except version (the version the client last saw).
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
// Finds the card, then checks the actor can access its board (404 if not).
export async function getAccessibleCard(cardId: string, actor: Actor) {
    const card = await cardRepository.getById(cardId);
    if (!card) throw new AppError(404, 'Card not found');
    await boardService.getAccessibleBoard(card.board_id, actor, 'Card not found');
    return card;
}

// A card can only be assigned to someone who is an active member of its board.
export async function assertAssigneeIsMember(boardId: string, userId: string) {
    const isMember = await memberRepository.isActiveMember(boardId, userId);
    if (!isMember) throw new AppError(400, 'Assignee must be an active member of the board');
}

export async function listCards(boardId: string, actor: Actor) {
    await boardService.getAccessibleBoard(boardId, actor);
    return cardRepository.listByBoard(boardId);
}

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

export async function getCard(cardId: string, actor: Actor) {
    return getAccessibleCard(cardId, actor);
}

// completed: true keeps the original completion time if it was already completed.
function resolveCompletedAt(card: Card, completed: boolean | undefined) {
    if (completed === undefined) return card.completed_at;
    if (!completed) return null;
    return card.completed_at ?? new Date();
}

const CONFLICT_MESSAGE = 'Card was changed by someone else. Reload it and try again.';

// Any active member can edit a card.
export async function updateCard(cardId: string, input: CardUpdate, actor: Actor) {
    const card = await getAccessibleCard(cardId, actor);
    if (input.version !== card.version) throw new AppError(409, CONFLICT_MESSAGE);

    if (input.assigneeId) await assertAssigneeIsMember(card.board_id, input.assigneeId);

    // Fields the client didn't send keep their current value.
    // (undefined = "not sent", null = "clear it")
    const updated = await cardRepository.update(cardId, input.version, {
        title: input.title ?? card.title,
        description: input.description !== undefined ? input.description : card.description,
        priority: input.priority ?? card.priority,
        assigneeId: input.assigneeId !== undefined ? input.assigneeId : card.assignee_id,
        completedAt: resolveCompletedAt(card, input.completed),
    });

    if (!updated) {
        // 0 rows: either deleted in the meantime, or someone saved between our read and write.
        const stillExists = await cardRepository.getById(cardId);
        if (!stillExists) throw new AppError(404, 'Card not found');
        throw new AppError(409, CONFLICT_MESSAGE);
    }
    realtime.emitToBoard(card.board_id, 'card:updated', updated);
    return updated;
}

// Deleting is destructive, so only the board owner can do it.
export async function deleteCard(cardId: string, actor: Actor) {
    const card = await getAccessibleCard(cardId, actor); // 404 for non-members
    await boardService.getOwnedBoard(card.board_id, actor); // 403 for non-owners
    const deleted = await cardRepository.softDelete(cardId);
    if (!deleted) throw new AppError(404, 'Card not found');
    realtime.emitToBoard(card.board_id, 'card:deleted', { id: card.id, column_id: card.column_id });
}

export async function moveCard(cardId: string, input: CardMove, actor: Actor) {
    const card = await getAccessibleCard(cardId, actor); // 404 for non-members
    const target = await columnService.getAccessibleColumn(input.columnId, actor); // 404 if not visible
    if (target.board_id !== card.board_id) {
        throw new AppError(400, 'A card can only be moved to a column on the same board');
    }

    const { moved, renumbered } = await withTransaction(async (client) => {
        const locked = await cardRepository.lockColumn(client, target.id);
        if (!locked) throw new AppError(404, 'Column not found'); // deleted in the meantime

        let renumbered: { id: string; position: number }[] | null = null;
        let positions = await cardRepository.listPositions(client, target.id, card.id);
        let position = positionAt(positions, input.index);
        if (position === null) {
            // Neighbours too close: spread the column out and calculate again.
            renumbered = await cardRepository.renumber(client, target.id);
            positions = await cardRepository.listPositions(client, target.id, card.id);
            position = positionAt(positions, input.index)!; // gaps are 1000 now, never null
        }

        const moved = await cardRepository.moveTo(client, card.id, target.id, position);
        if (!moved) throw new AppError(404, 'Card not found'); // deleted in the meantime
        return { moved, renumbered };
    });

    // Sent only after COMMIT, so clients never hear about a change that got rolled back.
    // Renumbered positions go first; the moved card's new position then overrides its own.
    if (renumbered) {
        realtime.emitToBoard(card.board_id, 'cards:renumbered', {
            column_id: target.id,
            cards: renumbered,
        });
    }
    realtime.emitToBoard(card.board_id, 'card:moved', { ...moved, from_column_id: card.column_id });
    return moved;
}
