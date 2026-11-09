import { AppError } from '../errors/AppError';
import * as memberRepository from '../repositories/boardMemberRepository';
import type { MemberStatus } from '../repositories/boardMemberRepository';
import * as userRepository from '../repositories/userRepository';
import * as boardService from './boardService';
import type { Actor } from './boardService';

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

    return { id: user.id, name: user.name, email: user.email, status };
}

export async function listMembers(boardId: string, actor: Actor) {
    await boardService.getAccessibleBoard(boardId, actor);
    return memberRepository.listMembers(boardId);
}

export async function removeMember(boardId: string, userId: string, actor: Actor) {
    const board = await boardService.getAccessibleBoard(boardId, actor);
    const canManage = board.owner_id === actor.id || actor.role === 'super_admin';

    if (userId !== actor.id && !canManage) throw new AppError(403, 'Only owner can remove members');

    if (userId === board.owner_id) throw new AppError(400, "The owner can't be removed");

    const removed = await memberRepository.remove(boardId, userId);
    if (!removed) throw new AppError(404, 'Member not found');
}

export async function listInvitations(actor: Actor) {
    return memberRepository.listInvitations(actor.id);
}

export async function acceptInvitation(boardId: string, actor: Actor) {
    const accepted = await memberRepository.accept(boardId, actor.id);
    if (!accepted) throw new AppError(404, 'Invitation not found');
}

export async function declineInvitation(boardId: string, actor: Actor) {
    const declined = await memberRepository.decline(boardId, actor.id);
    if (!declined) throw new AppError(404, 'Invitation not found');
}
