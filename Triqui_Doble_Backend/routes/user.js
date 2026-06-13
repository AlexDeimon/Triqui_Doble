import express from 'express';
import * as userController from '../controllers/user.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const userRouter = express.Router();

userRouter.post('/registrar', asyncHandler(userController.registrar));
userRouter.post('/login', asyncHandler(userController.login));
userRouter.get('/ranking', asyncHandler(userController.ranking));
userRouter.get('/historial/:username', asyncHandler(userController.historialJugador));
userRouter.get('/buscar-usuarios/:query/:requester', asyncHandler(userController.buscarUsuarios));
userRouter.get('/amigos/:username', asyncHandler(userController.obtenerAmigos));
userRouter.post('/solicitud-amistad', asyncHandler(userController.enviarSolicitudAmistad));
userRouter.post('/aceptar-amistad', asyncHandler(userController.aceptarSolicitudAmistad));
userRouter.post('/rechazar-amistad', asyncHandler(userController.rechazarSolicitudAmistad));
userRouter.post('/eliminar-amigo', asyncHandler(userController.eliminarAmigo));
userRouter.get('/perfil/:username', asyncHandler(userController.obtenerPerfil));
userRouter.post('/perfil/actualizar', asyncHandler(userController.actualizarPerfil));

export default userRouter;
