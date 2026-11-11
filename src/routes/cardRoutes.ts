import { Router } from 'express';
import * as cardController from '../controllers/cardController';
import * as noteController from '../controllers/noteController';
import * as statsController from '../controllers/statsController';
import * as timeEntryController from '../controllers/timeEntryController';
import { authenticate } from '../middleware/auth';

export const cardRoutes = Router();
cardRoutes.use(authenticate); // protects every route below (TR: aşağıdaki tüm route'ları korur)

// Cards are created through their column: POST /api/columns/:id/cards.
// TR: Kartlar kendi sütunları üzerinden oluşturulur: POST /api/columns/:id/cards.
cardRoutes.get('/:id', cardController.getOne);
cardRoutes.patch('/:id', cardController.update);
cardRoutes.delete('/:id', cardController.remove);

// Notes and time entries are listed and created through their card. Editing or deleting
// one by its own id is in noteRoutes and timeEntryRoutes.
// TR: Notlar ve zaman kayıtları kendi kartları üzerinden listelenir ve oluşturulur. Kendi id'siyle
// TR: düzenleme veya silme noteRoutes ve timeEntryRoutes içinde.
cardRoutes.get('/:id/notes', noteController.list);
cardRoutes.post('/:id/notes', noteController.create);

cardRoutes.get('/:id/time-entries', timeEntryController.listForCard);
cardRoutes.post('/:id/time-entries', timeEntryController.start);

// No clash with PATCH '/:id' above: a route param matches one path segment only,
// so '/abc/move' is never read as id = 'abc/move'.
// TR: Yukarıdaki PATCH '/:id' ile çakışmaz: route parametresi yalnızca tek bir path parçasıyla eşleşir,
// TR: yani '/abc/move' hiçbir zaman id = 'abc/move' olarak okunmaz.
cardRoutes.patch('/:id/move', cardController.move);
cardRoutes.get('/:id/stats', statsController.card);
