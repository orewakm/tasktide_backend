import { AppError } from '../errors/AppError';
import * as cardRepository from '../repositories/cardRepository';
import type { Card, Priority } from '../repositories/cardRepository';
import * as memberRepository from '../repositories/boardMemberRepository';
import * as boardService from './boardService';
import type { Actor } from './boardService';
import * as columnService from './columnService';

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

    return cardRepository.create(
        column.id,
        input.title,
        input.description ?? null,
        input.priority,
        input.assigneeId ?? null
    );
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
    return updated;
}

// Deleting is destructive, so only the board owner can do it.
export async function deleteCard(cardId: string, actor: Actor) {
    const card = await getAccessibleCard(cardId, actor); // 404 for non-members
    await boardService.getOwnedBoard(card.board_id, actor); // 403 for non-owners
    const deleted = await cardRepository.softDelete(cardId);
    if (!deleted) throw new AppError(404, 'Card not found');
}
