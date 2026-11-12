import { Router } from 'express';
import * as noteController from '../controllers/noteController';
import { authenticate } from '../middleware/auth';

export const noteRoutes = Router();
noteRoutes.use(authenticate);

noteRoutes.patch('/:id', noteController.update);
noteRoutes.delete('/:id', noteController.remove);
