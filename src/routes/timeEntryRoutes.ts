import { Router } from 'express';
import * as timeEntryController from '../controllers/timeEntryController';
import { authenticate } from '../middleware/auth';

export const timeEntryRoutes = Router();
timeEntryRoutes.use(authenticate);

timeEntryRoutes.get('/current', timeEntryController.current);
timeEntryRoutes.post('/stop', timeEntryController.stop);
timeEntryRoutes.delete('/:id', timeEntryController.remove);
