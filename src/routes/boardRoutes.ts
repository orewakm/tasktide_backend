import { Router } from 'express';
import * as boardController from '../controllers/boardController';
import { authenticate } from '../middleware/auth';
import * as memberController from '../controllers/boardMemberController';
import * as columnController from '../controllers/columnController';
import * as cardController from '../controllers/cardController';
import * as statsController from '../controllers/statsController';

export const boardRoutes = Router();
boardRoutes.use(authenticate);

boardRoutes.post('/', boardController.create);
boardRoutes.get('/', boardController.list);
boardRoutes.get('/:id', boardController.getOne);
boardRoutes.patch('/:id', boardController.rename);
boardRoutes.delete('/:id', boardController.remove);
boardRoutes.get('/:id/members', memberController.list);
boardRoutes.post('/:id/members', memberController.add);
boardRoutes.delete('/:id/members/:userId', memberController.remove);
boardRoutes.get('/:id/columns', columnController.list);
boardRoutes.post('/:id/columns', columnController.create);
boardRoutes.get('/:id/cards', cardController.list);
boardRoutes.get('/:id/stats', statsController.board);
