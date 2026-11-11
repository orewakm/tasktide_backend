import { Request, Response } from 'express';
import { z } from 'zod';
import * as cardService from '../services/cardService';

const idSchema = z.uuid();
const priorities = ['low', 'medium', 'high'] as const;

// .nullish() accepts a value, null or a missing field. On create, null and missing
// both mean "no description" / "nobody assigned".
// TR: .nullish() bir değer, null veya hiç gönderilmemiş alan kabul eder. Oluşturmada null ile
// TR: eksik alan aynı anlama gelir: "açıklama yok" / "kimse atanmamış".
const createCardSchema = z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000).nullish(),
    priority: z.enum(priorities).default('medium'),
    assigneeId: z.uuid().nullish(),
});

// index is the card's final position in the target column, counted as if the card
// were already taken out. 0 = top; a number past the end puts it last.
// TR: index, kartın hedef sütundaki son pozisyonudur ve kart oradan çıkarılmış gibi sayılır.
// TR: 0 = en üst; sondan büyük bir sayı kartı en sona koyar.
const moveCardSchema = z.object({
    columnId: z.uuid(),
    index: z.number().int().min(0),
});

// version is required: it's the version the client last loaded. If someone saved
// in between, the service answers 409 instead of overwriting their change.
// The rest are optional, and a field that isn't sent keeps its current value.
// .nullable() also lets description and assigneeId be sent as null, which clears them.
// title and priority can't be cleared, so they only get .optional().
// TR: version zorunlu: client'ın en son yüklediği sürümdür. Arada başka biri kaydettiyse
// TR: servis onun değişikliğinin üstüne yazmak yerine 409 döner.
// TR: Diğer alanlar opsiyonel; gönderilmeyen alan mevcut değerini korur.
// TR: .nullable() sayesinde description ve assigneeId null gönderilebilir, bu da alanı temizler.
// TR: title ve priority temizlenemez, bu yüzden sadece .optional() alırlar.
const updateCardSchema = z
    .object({
        version: z.number().int().positive(),
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(5000).nullable().optional(),
        priority: z.enum(priorities).optional(),
        assigneeId: z.uuid().nullable().optional(),
        completed: z.boolean().optional(),
    })
    // At least one field besides version. Zod has already dropped unknown keys by this
    // point, so { version } plus junk fields also fails with "Nothing to update".
    // TR: version dışında en az bir alan olmalı. Zod bu noktada bilinmeyen anahtarları zaten
    // TR: atmış olur, yani { version } artı anlamsız alanlar da "Nothing to update" ile düşer.
    .refine((body) => Object.keys(body).length > 1, { message: 'Nothing to update' });

// GET /api/boards/:id/cards
// Every card on the board in one list, sorted by column position then card position,
// so the client can group them by column_id.
// TR: Panodaki tüm kartlar tek listede, önce sütun pozisyonuna sonra kart pozisyonuna göre sıralı;
// TR: client bunları column_id'ye göre gruplayabilir.
export async function list(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    res.json(await cardService.listCards(boardId, req.user!));
}

// POST /api/columns/:id/cards
// The new card goes to the bottom of the column. An assignee must be an active member (400 if not).
// TR: Yeni kart sütunun en altına eklenir. Atanan kişi aktif üye olmalı (değilse 400).
export async function create(req: Request, res: Response) {
    const columnId = idSchema.parse(req.params.id);
    const input = createCardSchema.parse(req.body);
    res.status(201).json(await cardService.createCard(columnId, input, req.user!));
}

// GET /api/cards/:id
export async function getOne(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    res.json(await cardService.getCard(cardId, req.user!));
}

// PATCH /api/cards/:id
// Any member can edit. A stale version gets 409 and the client should reload the card.
// TR: Her üye düzenleyebilir. Eski bir version 409 alır ve client kartı yeniden yüklemelidir.
export async function update(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    const input = updateCardSchema.parse(req.body);
    res.json(await cardService.updateCard(cardId, input, req.user!));
}

// DELETE /api/cards/:id
// Owner only, since it can't be undone from the app. 204 has no body.
// TR: Uygulamadan geri alınamadığı için sadece pano sahibi yapabilir. 204'ün gövdesi yoktur.
export async function remove(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    await cardService.deleteCard(cardId, req.user!);
    res.status(204).end();
}

// PATCH /api/cards/:id/move   body: { columnId, index }
// Works within one column or across columns, but only on the same board.
// TR: Aynı sütun içinde veya sütunlar arasında çalışır, ama sadece aynı panoda.
export async function move(req: Request, res: Response) {
    const cardId = idSchema.parse(req.params.id);
    const input = moveCardSchema.parse(req.body);
    res.json(await cardService.moveCard(cardId, input, req.user!));
}
