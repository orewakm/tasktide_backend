import { Request, Response } from 'express';
import { z } from 'zod';
import * as memberService from '../services/boardMemberService';

const idSchema = z.uuid();
const addMemberSchema = z.object({
    email: z.email().toLowerCase(),
    status: z.enum(['invited', 'active']).default('invited'),
});

export async function list(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    res.json(await memberService.listMembers(boardId, req.user!));
}

export async function add(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    const { email, status } = addMemberSchema.parse(req.body);
    res.status(201).json(await memberService.addMember(boardId, email, status, req.user!));
}

export async function remove(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.id);
    const userId = idSchema.parse(req.params.userId);
    await memberService.removeMember(boardId, userId, req.user!);
    res.status(204).end();
}

export async function listInvitations(req: Request, res: Response) {
    res.json(await memberService.listInvitations(req.user!));
}

export async function accept(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.boardId);
    await memberService.acceptInvitation(boardId, req.user!);
    res.status(204).end();
}

export async function decline(req: Request, res: Response) {
    const boardId = idSchema.parse(req.params.boardId);
    await memberService.declineInvitation(boardId, req.user!);
    res.status(204).end();
}
