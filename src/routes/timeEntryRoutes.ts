import { Router } from 'express';
import * as statsController from '../controllers/statsController';
import * as timeEntryController from '../controllers/timeEntryController';
import { authenticate } from '../middleware/auth';

export const timeEntryRoutes = Router();
timeEntryRoutes.use(authenticate); // protects every route below (TR: aşağıdaki tüm route'ları korur)

// These fixed paths act on the logged-in user's own timer and stats, so they need no id.
// If a GET '/:id' is ever added, put it below them, or Express would read "current" or
// "stats" as an id, since it matches routes in the order they're registered.
// TR: Bu sabit path'ler giriş yapmış kullanıcının kendi zamanlayıcısı ve istatistikleri üzerinde
// TR: çalışır, bu yüzden id gerekmez. İleride bir GET '/:id' eklenirse bunların altına konmalı;
// TR: Express route'ları kayıt sırasına göre eşleştirdiği için "current" veya "stats"ı id sanardı.
timeEntryRoutes.get('/current', timeEntryController.current);
timeEntryRoutes.get('/stats', statsController.mine);
timeEntryRoutes.post('/stop', timeEntryController.stop);
timeEntryRoutes.delete('/:id', timeEntryController.remove);
