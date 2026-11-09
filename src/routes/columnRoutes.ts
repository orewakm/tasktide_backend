import { Router } from 'express';
import * as cardController from '../controllers/cardController';
import * as columnController from '../controllers/columnController';
import { authenticate } from '../middleware/auth';

export const columnRoutes = Router();
columnRoutes.use(authenticate);

columnRoutes.patch('/:id', columnController.rename);
columnRoutes.delete('/:id', columnController.remove);
columnRoutes.post('/:id/cards', cardController.create);
