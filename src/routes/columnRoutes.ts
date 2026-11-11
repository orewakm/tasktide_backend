import { Router } from 'express';
import * as cardController from '../controllers/cardController';
import * as columnController from '../controllers/columnController';
import { authenticate } from '../middleware/auth';

export const columnRoutes = Router();
columnRoutes.use(authenticate); // all column routes need a session (TR: tüm sütun route'ları oturum ister)

// Listing and creating columns need a board id, so those two are in boardRoutes.
// TR: Sütunları listelemek ve oluşturmak pano id'si ister, bu yüzden bu ikisi boardRoutes içinde.
columnRoutes.patch('/:id', columnController.rename);
columnRoutes.delete('/:id', columnController.remove);
columnRoutes.post('/:id/cards', cardController.create);
columnRoutes.patch('/:id/move', columnController.move);
