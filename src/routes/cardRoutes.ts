import { Router } from 'express';
import * as cardController from '../controllers/cardController';
import { authenticate } from '../middleware/auth';

export const cardRoutes = Router();
cardRoutes.use(authenticate);

cardRoutes.get('/:id', cardController.getOne);
cardRoutes.patch('/:id', cardController.update);
cardRoutes.delete('/:id', cardController.remove);
