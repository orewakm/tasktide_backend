import { Router } from 'express';
import * as memberController from '../controllers/boardMemberController';
import { authenticate } from '../middleware/auth';

export const invitationRoutes = Router();
invitationRoutes.use(authenticate);

invitationRoutes.get('/', memberController.listInvitations);
invitationRoutes.post('/:boardId/accept', memberController.accept);
invitationRoutes.delete('/:boardId', memberController.decline);
