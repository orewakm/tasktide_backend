import { AppError } from '../errors/AppError';
import * as boardRepository from '../repositories/boardRepository';
import type { Role } from '../repositories/userRepository';
import * as realtime from '../sockets/realtime';

// The logged-in user as services see it (controllers pass req.user).
// TR: Servislerin gördüğü haliyle giriş yapmış kullanıcı (controller'lar req.user'ı geçirir).
export type Actor = { id: string; role: Role };

// Non-members get 404 so they can't tell the board exists. Pending invitations count
// as non-members too, since only 'active' rows match. The super admin sees every board.
// notFoundMessage lets callers say "Card not found" etc. instead of "Board not found".
// TR: Üye olmayanlar 404 alır, böylece panonun var olduğunu bile anlayamazlar. Daveti henüz
// TR: kabul etmemiş kişiler de üye sayılmaz, çünkü sadece 'active' satırlar eşleşir.
// TR: Süper admin tüm panoları görür.
// TR: notFoundMessage sayesinde çağıran yer "Board not found" yerine "Card not found" gibi
// TR: kendi mesajını verebilir.
export async function getAccessibleBoard(
    boardId: string,
    actor: Actor,
    notFoundMessage = 'Board not found'
) {
    const board =
        actor.role === 'super_admin'
            ? await boardRepository.getById(boardId)
            : await boardRepository.getForMember(boardId, actor.id);
    // Services throw AppError with the status they want and controllers don't catch it:
    // Express 5 passes a rejected async handler to errorHandler, which sends that status.
    // TR: Servisler istedikleri status ile AppError fırlatır, controller'lar bunu yakalamaz:
    // TR: Express 5 reddedilen async handler'ı errorHandler'a iletir, o da bu status'u döner.
    if (!board) throw new AppError(404, notFoundMessage);
    return board;
}

// The owner (or super admin) manages the board: deletes, members, settings.
// TR: Panoyu pano sahibi (veya süper admin) yönetir: silme, üyeler, ayarlar.
export function canManageBoard(board: { owner_id: string }, actor: Actor) {
    return board.owner_id === actor.id || actor.role === 'super_admin';
}

// 404 for non-members, 403 for members who aren't the owner.
// The access check runs first, so a non-member never sees a 403.
// TR: Üye olmayana 404, pano sahibi olmayan üyeye 403.
// TR: Erişim kontrolü önce çalışır, bu yüzden üye olmayan biri hiçbir zaman 403 görmez.
export async function getOwnedBoard(boardId: string, actor: Actor) {
    const board = await getAccessibleBoard(boardId, actor);
    if (!canManageBoard(board, actor)) {
        throw new AppError(403, 'Only the board owner can do this');
    }

    return board;
}

// The repository also adds the owner as an active member, in the same transaction.
// TR: Repository, pano sahibini de aynı transaction içinde aktif üye olarak ekler.
export async function createBoard(name: string, actor: Actor) {
    return boardRepository.create(name, actor.id);
}

// Boards the user is an active member of; pending invitations come from listInvitations.
// TR: Kullanıcının aktif üye olduğu panolar; bekleyen davetler listInvitations'tan gelir.
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

// Soft delete. We pass board.owner_id rather than actor.id so the super admin
// can delete someone else's board too.
// TR: Soft delete. actor.id yerine board.owner_id gönderiyoruz, böylece süper admin
// TR: başkasının panosunu da silebilir.
export async function deleteBoard(boardId: string, actor: Actor) {
    const board = await getOwnedBoard(boardId, actor);
    const deleted = await boardRepository.softDelete(boardId, board.owner_id);
    if (!deleted) throw new AppError(404, 'Board not found');
    // Tell the room first, then empty it so nobody keeps getting this board's events.
    // TR: Önce odaya haber ver, sonra odayı boşalt ki kimse bu panonun event'lerini almaya devam etmesin.
    realtime.emitToBoard(boardId, 'board:deleted', { id: boardId });
    realtime.closeBoardRoom(boardId);
}
