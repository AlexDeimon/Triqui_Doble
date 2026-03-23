import express from 'express';
import * as userController from '../controllers/user.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const userRouter = express.Router();

userRouter.post('/registrar', asyncHandler(userController.registrar));
userRouter.post('/login', asyncHandler(userController.login));
userRouter.get('/ranking', asyncHandler(userController.ranking));
userRouter.get('/historial/:username', asyncHandler(userController.historialJugador));

export default userRouter;
