import { Router } from 'express';
import * as adminController from '../controllers/adminController';
import { authenticate, requireRole } from '../middleware/auth';

export const adminRoutes = Router();
adminRoutes.use(authenticate, requireRole('admin', 'super_admin'));

adminRoutes.get('/users', adminController.listUsers);
adminRoutes.patch('/users/:id/role', requireRole('super_admin'), adminController.changeRole);
