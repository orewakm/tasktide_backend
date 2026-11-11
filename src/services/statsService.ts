import * as statsRepository from '../repositories/statsRepository';
import * as boardService from './boardService';
import type { Actor } from './boardService';
import * as cardService from './cardService';

const DAY_MS = 24 * 60 * 60 * 1000;

// Midnight UTC, (days - 1) days ago. So days = 7 means today plus the 6 days before it.
function windowStart(days: number) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return new Date(today.getTime() - (days - 1) * DAY_MS);
}

// Any member: time on this board per user, per card and per day.
export async function boardStats(boardId: string, days: number, actor: Actor) {
    await boardService.getAccessibleBoard(boardId, actor);
    const from = windowStart(days);
    const [total, byUser, byCard, byDay] = await Promise.all([
        statsRepository.total('board', boardId, from),
        statsRepository.byUser('board', boardId, from),
        statsRepository.byCard('board', boardId, from),
        statsRepository.byDay('board', boardId, from),
    ]);
    return {
        from,
        to: new Date(),
        total_seconds: total,
        by_user: byUser,
        by_card: byCard,
        by_day: byDay,
    };
}

// Any member: all-time total for one card, per user.
export async function cardStats(cardId: string, actor: Actor) {
    await cardService.getAccessibleCard(cardId, actor);
    const [total, byUser] = await Promise.all([
        statsRepository.total('card', cardId, null),
        statsRepository.byUser('card', cardId, null),
    ]);
    return { total_seconds: total, by_user: byUser };
}

// The logged-in user's own time across all their boards.
export async function myStats(days: number, actor: Actor) {
    const from = windowStart(days);
    const [total, byBoard, byDay] = await Promise.all([
        statsRepository.total('user', actor.id, from),
        statsRepository.byBoard('user', actor.id, from),
        statsRepository.byDay('user', actor.id, from),
    ]);
    return { from, to: new Date(), total_seconds: total, by_board: byBoard, by_day: byDay };
}
