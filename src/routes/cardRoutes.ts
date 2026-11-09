import { Router } from 'express';
import * as cardController from '../controllers/cardController';
import * as noteController from '../controllers/noteController';
import { authenticate } from '../middleware/auth';

export const cardRoutes = Router();
cardRoutes.use(authenticate);

cardRoutes.get('/:id', cardController.getOne);
cardRoutes.patch('/:id', cardController.update);
cardRoutes.delete('/:id', cardController.remove);

cardRoutes.get('/:id/notes', noteController.list);
cardRoutes.post('/:id/notes', noteController.create);
