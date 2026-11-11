import { Router } from 'express';
import * as memberController from '../controllers/boardMemberController';
import { authenticate } from '../middleware/auth';

export const invitationRoutes = Router();
invitationRoutes.use(authenticate); // invitations always belong to the logged-in user (TR: davetler her zaman giriş yapmış kullanıcıya aittir)

// A user has at most one invitation per board, so the board id identifies it.
// TR: Bir kullanıcının her panoda en fazla bir daveti olur, bu yüzden daveti pano id'si belirler.
invitationRoutes.get('/', memberController.listInvitations);
invitationRoutes.post('/:boardId/accept', memberController.accept);
invitationRoutes.delete('/:boardId', memberController.decline);
