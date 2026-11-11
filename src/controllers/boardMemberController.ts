import { Request, Response } from 'express';
import { z } from 'zod';
import * as memberService from '../services/boardMemberService';

const idSchema = z.uuid();
// By default the user gets an invitation they must accept. The owner can send
// status: 'active' to add them straight away.
// TR: Varsayılan olarak kullanıcıya kabul etmesi gereken bir davet gider. Pano sahibi
// TR: status: 'active' göndererek kullanıcıyı doğrudan ekleyebilir.
const addMemberSchema = z.object({
    email: z.email().toLowerCase(),
    status: z.enum(['invited', 'active']).default('invited'),
});

// GET /api/boards/:id/members
// Any member can see the list, invited users included (each row has a status).
// TR: Her üye listeyi görebilir, davet edilmiş kullanıcılar da dahil (her satırda bir status var).
export async function list(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    res.json(await memberService.listMembers(boardId, req.user!));
}

// POST /api/boards/:id/members
// Owner only. 404 if no account has that email, 409 if the user is already invited or a member.
// TR: Sadece pano sahibi. O e-postayla hesap yoksa 404, kullanıcı zaten davetli veya üyeyse 409.
export async function add(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    const { email, status } = addMemberSchema.parse(req.body);
    res.status(201).json(await memberService.addMember(boardId, email, status, req.user!));
}

// DELETE /api/boards/:id/members/:userId
// The owner can remove others; a member can pass their own id to leave the board.
// The owner can't be removed.
// TR: Pano sahibi başkalarını çıkarabilir; bir üye kendi id'sini göndererek panodan ayrılabilir.
// TR: Pano sahibi çıkarılamaz.
export async function remove(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    const userId = idSchema.parse(req.params.userId);
    await memberService.removeMember(boardId, userId, req.user!);
    res.status(204).end();
}

// GET /api/invitations
// The logged-in user's pending invitations, returned as the boards they were invited to.
// TR: Giriş yapmış kullanıcının bekleyen davetleri, davet edildiği panolar olarak döner.
export async function listInvitations(req: Request, res: Response) {
    res.json(await memberService.listInvitations(req.user!));
}

// POST /api/invitations/:boardId/accept
// An invitation has no id of its own: it's a board_members row with status 'invited',
// so the board id is enough to find it.
// TR: Davetin kendine ait bir id'si yok: status'u 'invited' olan bir board_members satırı,
// TR: bu yüzden onu bulmak için pano id'si yeterli.
export async function accept(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.boardId);
    await memberService.acceptInvitation(boardId, req.user!);
    res.status(204).end();
}

// DELETE /api/invitations/:boardId
// Declining deletes the invitation row, which is why this is a DELETE.
// TR: Daveti reddetmek davet satırını siler, bu yüzden bu bir DELETE.
export async function decline(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.boardId);
    await memberService.declineInvitation(boardId, req.user!);
    res.status(204).end();
}
