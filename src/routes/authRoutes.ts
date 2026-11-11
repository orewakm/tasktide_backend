import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authenticate } from '../middleware/auth';

export const authRoutes = Router();

// register and login must stay public, so authenticate is added per route below
// instead of with authRoutes.use().
// TR: register ve login herkese açık kalmalı, bu yüzden authenticate authRoutes.use() ile değil,
// TR: aşağıda route bazında ekleniyor.
authRoutes.post('/register', authController.register);
authRoutes.post('/login', authController.login);
authRoutes.get('/me', authenticate, authController.me);
authRoutes.post('/logout', authenticate, authController.logout);
