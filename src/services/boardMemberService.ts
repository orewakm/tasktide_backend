import { AppError } from '../errors/AppError';
import * as boardRepository from '../repositories/boardRepository';
import * as memberRepository from '../repositories/boardMemberRepository';
import type { MemberStatus } from '../repositories/boardMemberRepository';
import * as userRepository from '../repositories/userRepository';
import * as realtime from '../sockets/realtime';
import * as boardService from './boardService';
import type { Actor } from './boardService';

// Only the owner adds people, either as an invitation or straight in as an active member.
// TR: Panoya kişi ekleyen sadece pano sahibidir; davet olarak ya da doğrudan aktif üye olarak.
export async function addMember(
    boardId: string,
    email: string,
    status: MemberStatus,
    actor: Actor
) {
    const board = await boardService.getOwnedBoard(boardId, actor);
    const user = await userRepository.getByEmail(email);
    if (!user) throw new AppError(404, 'User not found');

    // The insert uses ON CONFLICT DO NOTHING, so false means they're already on the board.
    // TR: Insert ON CONFLICT DO NOTHING kullanır, false gelmesi kişinin zaten panoda olduğu anlamına gelir.
    const added = await memberRepository.add(boardId, user.id, status);
    if (!added) throw new AppError(409, 'User is already invited or a member');

    const member = { id: user.id, name: user.name, email: user.email, status };
    realtime.emitToBoard(boardId, 'member:added', { board_id: boardId, ...member });
    // The added user sees it live: a new invitation, or the board appearing in their list.
    // TR: Eklenen kullanıcı bunu canlı görür: yeni bir davet ya da listesinde beliren pano.
    realtime.emitToUser(user.id, status === 'invited' ? 'invitation:received' : 'board:added', board);
    return member;
}

export async function listMembers(boardId: string, actor: Actor) {
    await boardService.getAccessibleBoard(boardId, actor);
    return memberRepository.listMembers(boardId);
}

// The owner can remove anyone except themselves; a member can remove themselves (leave).
// TR: Pano sahibi kendisi hariç herkesi çıkarabilir; üye ise kendini çıkarabilir (panodan ayrılmak).
export async function removeMember(boardId: string, userId: string, actor: Actor) {
    const board = await boardService.getAccessibleBoard(boardId, actor);

    if (userId !== actor.id && !boardService.canManageBoard(board, actor)) {
        throw new AppError(403, 'Only owner can remove members');
    }
    if (userId === board.owner_id) throw new AppError(400, "The owner can't be removed");

    const removed = await memberRepository.remove(boardId, userId);
    if (!removed) throw new AppError(404, 'Member not found');

    // The removed user is still in the room here, so they get member:removed too.
    // Then their sockets leave the room and get nothing more from this board.
    // TR: Çıkarılan kullanıcı bu noktada hâlâ odada, bu yüzden member:removed'ı o da alır.
    // TR: Ardından socket'leri odadan çıkarılır ve bu panodan başka event almaz.
    realtime.emitToBoard(boardId, 'member:removed', { board_id: boardId, user_id: userId });
    realtime.emitToUser(userId, 'board:removed', { id: boardId });
    await realtime.removeUserFromBoard(boardId, userId);
}

export async function listInvitations(actor: Actor) {
    return memberRepository.listInvitations(actor.id);
}

// accept() only matches 'invited' rows, so a missing or already accepted invitation is a 404.
// TR: accept() sadece 'invited' satırlarla eşleşir; olmayan ya da zaten kabul edilmiş davet 404 verir.
export async function acceptInvitation(boardId: string, actor: Actor) {
    const accepted = await memberRepository.accept(boardId, actor.id);
    if (!accepted) throw new AppError(404, 'Invitation not found');

    // Both are only needed for the events. If either was deleted meanwhile, we skip that event.
    // TR: İkisi de sadece event'ler için gerekli. Bu arada biri silindiyse o event'i atlıyoruz.
    const [user, board] = await Promise.all([
        userRepository.getById(actor.id),
        boardRepository.getById(boardId),
    ]);
    if (user) {
        realtime.emitToBoard(boardId, 'member:updated', {
            board_id: boardId,
            id: user.id,
            name: user.name,
            email: user.email,
            status: 'active',
        });
    }
    if (board) realtime.emitToUser(actor.id, 'board:added', board);
}

// Declining deletes the invitation row, so for the board it looks like a removed member.
// TR: Daveti reddetmek davet satırını siler, bu yüzden pano açısından
// TR: çıkarılmış bir üye gibi görünür.
export async function declineInvitation(boardId: string, actor: Actor) {
    const declined = await memberRepository.decline(boardId, actor.id);
    if (!declined) throw new AppError(404, 'Invitation not found');
    realtime.emitToBoard(boardId, 'member:removed', { board_id: boardId, user_id: actor.id });
}
