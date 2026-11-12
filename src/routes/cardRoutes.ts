import { Router } from 'express';
import * as cardController from '../controllers/cardController';
import * as noteController from '../controllers/noteController';
import * as statsController from '../controllers/statsController';
import * as timeEntryController from '../controllers/timeEntryController';
import { authenticate } from '../middleware/auth';

export const cardRoutes = Router();
cardRoutes.use(authenticate);

cardRoutes.get('/:id', cardController.getOne);
cardRoutes.patch('/:id', cardController.update);
cardRoutes.delete('/:id', cardController.remove);

cardRoutes.get('/:id/notes', noteController.list);
cardRoutes.post('/:id/notes', noteController.create);

cardRoutes.get('/:id/time-entries', timeEntryController.listForCard);
cardRoutes.post('/:id/time-entries', timeEntryController.start);

cardRoutes.patch('/:id/move', cardController.move);
cardRoutes.get('/:id/stats', statsController.card);
