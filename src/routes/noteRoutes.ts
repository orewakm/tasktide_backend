import { Router } from 'express';
import * as noteController from '../controllers/noteController';
import { authenticate } from '../middleware/auth';

export const noteRoutes = Router();
noteRoutes.use(authenticate); // protects every route below (TR: aşağıdaki tüm route'ları korur)

// Work on a single note by its own id. Listing and adding go through the card: /api/cards/:id/notes.
// TR: Tek bir not üzerinde kendi id'siyle çalışılır. Listeleme ve ekleme kart üzerinden yapılır: /api/cards/:id/notes.
noteRoutes.patch('/:id', noteController.update);
noteRoutes.delete('/:id', noteController.remove);
