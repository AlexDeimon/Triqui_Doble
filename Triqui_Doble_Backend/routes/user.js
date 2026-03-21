import express from 'express';
import * as userController from '../controllers/user.js';
const userRouter = express.Router();

userRouter.post('/registrar', userController.registrar);
userRouter.post('/login', userController.login);
userRouter.get('/ranking', userController.ranking);
userRouter.get('/historial/:username', userController.historialJugador);

export default userRouter;
