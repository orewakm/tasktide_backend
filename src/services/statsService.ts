import * as statsRepository from '../repositories/statsRepository';
import * as boardService from './boardService';
import type { Actor } from './boardService';
import * as cardService from './cardService';

const DAY_MS = 24 * 60 * 60 * 1000;

// Returns the UTC midnight where a window of the given number of days starts.
function windowStart(days: number) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return new Date(today.getTime() - (days - 1) * DAY_MS);
}

// Returns a board's tracked time in total and per user, card and day.
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

// Returns a card's all-time tracked time in total and per user.
export async function cardStats(cardId: string, actor: Actor) {
    await cardService.getAccessibleCard(cardId, actor);
    const [total, byUser] = await Promise.all([
        statsRepository.total('card', cardId, null),
        statsRepository.byUser('card', cardId, null),
    ]);
    return { total_seconds: total, by_user: byUser };
}

// Returns the user's tracked time in total and per board and day.
export async function myStats(days: number, actor: Actor) {
    const from = windowStart(days);
    const [total, byBoard, byDay] = await Promise.all([
        statsRepository.total('user', actor.id, from),
        statsRepository.byBoard('user', actor.id, from),
        statsRepository.byDay('user', actor.id, from),
    ]);
    return { from, to: new Date(), total_seconds: total, by_board: byBoard, by_day: byDay };
}
