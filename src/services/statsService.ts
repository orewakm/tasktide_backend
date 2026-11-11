import * as statsRepository from '../repositories/statsRepository';
import * as boardService from './boardService';
import type { Actor } from './boardService';
import * as cardService from './cardService';

const DAY_MS = 24 * 60 * 60 * 1000;

// Midnight UTC, (days - 1) days ago. So days = 7 means today plus the 6 days before it.
// TR: (days - 1) gün önceki gece yarısı (UTC). Yani days = 7, bugün artı ondan önceki 6 gün demek.
function windowStart(days: number) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return new Date(today.getTime() - (days - 1) * DAY_MS);
}

// Any member: time on this board per user, per card and per day.
// The four queries don't depend on each other, so Promise.all runs them in parallel.
// TR: Her üye görebilir: bu panoda harcanan süre, kullanıcıya, karta ve güne göre.
// TR: Dört sorgu birbirine bağlı değil, bu yüzden Promise.all onları paralel çalıştırır.
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

// Any member: all-time total for one card, per user (null = no start date).
// TR: Her üye görebilir: tek bir kartın tüm zamanlardaki toplamı, kullanıcıya göre
// TR: (null = başlangıç tarihi yok).
export async function cardStats(cardId: string, actor: Actor) {
    await cardService.getAccessibleCard(cardId, actor);
    const [total, byUser] = await Promise.all([
        statsRepository.total('card', cardId, null),
        statsRepository.byUser('card', cardId, null),
    ]);
    return { total_seconds: total, by_user: byUser };
}

// The logged-in user's own time across all their boards.
// No board check needed: everything is filtered by the user's own id.
// TR: Giriş yapmış kullanıcının tüm panolarındaki kendi süresi.
// TR: Pano kontrolüne gerek yok: her şey kullanıcının kendi id'sine göre filtrelenir.
export async function myStats(days: number, actor: Actor) {
    const from = windowStart(days);
    const [total, byBoard, byDay] = await Promise.all([
        statsRepository.total('user', actor.id, from),
        statsRepository.byBoard('user', actor.id, from),
        statsRepository.byDay('user', actor.id, from),
    ]);
    return { from, to: new Date(), total_seconds: total, by_board: byBoard, by_day: byDay };
}
