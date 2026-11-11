import { Router } from 'express';
import * as adminController from '../controllers/adminController';
import { authenticate, requireRole } from '../middleware/auth';

export const adminRoutes = Router();
// Admins and the super admin only. Order matters: authenticate sets req.user and
// requireRole reads it. The other way round, everyone would get 403 instead of 401.
// TR: Sadece adminler ve süper admin. Sıra önemli: req.user'ı authenticate atar, requireRole okur.
// TR: Ters sırada olsaydı herkes 401 yerine 403 alırdı.
adminRoutes.use(authenticate, requireRole('admin', 'super_admin'));

adminRoutes.get('/users', adminController.listUsers);
// A second, stricter check on top of the one above: plain admins get 403 here.
// TR: Yukarıdakinin üstüne ikinci ve daha sıkı bir kontrol: normal adminler burada 403 alır.
adminRoutes.patch('/users/:id/role', requireRole('super_admin'), adminController.changeRole);
