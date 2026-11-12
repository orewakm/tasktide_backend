import { AppError } from '../errors/AppError';
import * as boardRepository from '../repositories/boardRepository';
import * as memberRepository from '../repositories/boardMemberRepository';
import type { MemberStatus } from '../repositories/boardMemberRepository';
import * as userRepository from '../repositories/userRepository';
import * as realtime from '../sockets/realtime';
import * as boardService from './boardService';
import type { Actor } from './boardService';

// Invites a user by email or adds them directly as an active member.
export async function addMember(
    boardId: string,
    email: string,
    status: MemberStatus,
    actor: Actor
) {
    const board = await boardService.getOwnedBoard(boardId, actor);
    const user = await userRepository.getByEmail(email);
    if (!user) throw new AppError(404, 'User not found');

    const added = await memberRepository.add(boardId, user.id, status);
    if (!added) throw new AppError(409, 'User is already invited or a member');

    const member = { id: user.id, name: user.name, email: user.email, status };
    realtime.emitToBoard(boardId, 'member:added', { board_id: boardId, ...member });
    realtime.emitToUser(user.id, status === 'invited' ? 'invitation:received' : 'board:added', board);
    return member;
}

// Returns the members of a board the user can access.
export async function listMembers(boardId: string, actor: Actor) {
    await boardService.getAccessibleBoard(boardId, actor);
    return memberRepository.listMembers(boardId);
}

// Removes a member from the board, or lets a member leave it.
export async function removeMember(boardId: string, userId: string, actor: Actor) {
    const board = await boardService.getAccessibleBoard(boardId, actor);

    if (userId !== actor.id && !boardService.canManageBoard(board, actor)) {
        throw new AppError(403, 'Only owner can remove members');
    }
    if (userId === board.owner_id) throw new AppError(400, "The owner can't be removed");

    const removed = await memberRepository.remove(boardId, userId);
    if (!removed) throw new AppError(404, 'Member not found');

    realtime.emitToBoard(boardId, 'member:removed', { board_id: boardId, user_id: userId });
    realtime.emitToUser(userId, 'board:removed', { id: boardId });
    await realtime.removeUserFromBoard(boardId, userId);
}

// Returns the user's pending invitations.
export async function listInvitations(actor: Actor) {
    return memberRepository.listInvitations(actor.id);
}

// Accepts the user's pending invitation to a board.
export async function acceptInvitation(boardId: string, actor: Actor) {
    const accepted = await memberRepository.accept(boardId, actor.id);
    if (!accepted) throw new AppError(404, 'Invitation not found');

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

// Declines the user's pending invitation to a board.
export async function declineInvitation(boardId: string, actor: Actor) {
    const declined = await memberRepository.decline(boardId, actor.id);
    if (!declined) throw new AppError(404, 'Invitation not found');
    realtime.emitToBoard(boardId, 'member:removed', { board_id: boardId, user_id: actor.id });
}
