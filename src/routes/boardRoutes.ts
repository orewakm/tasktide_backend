import { Router } from 'express';
import * as boardController from '../controllers/boardController';
import { authenticate } from '../middleware/auth';

export const boardRoutes = Router();
boardRoutes.use(authenticate); // every board route needs a logged-in user

boardRoutes.post('/', boardController.create);
boardRoutes.get('/', boardController.list);
boardRoutes.get('/:id', boardController.getOne);
boardRoutes.patch('/:id', boardController.rename);
boardRoutes.delete('/:id', boardController.remove);
