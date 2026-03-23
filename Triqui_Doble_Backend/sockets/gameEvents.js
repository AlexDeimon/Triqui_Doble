import { redisClient } from '../config/db.js';
import * as gameController from '../controllers/game.js';
import { socketWrapper } from '../utils/socketWrapper.js';
import {
  turnTimeouts,
  resetearTimeoutInactividad,
  iniciarTimeoutTurno,
  emitirSalasDisponibles
} from '../services/roomService.js';

export const handleGameEvents = (io, socket) => {
  socket.on('Movimiento', socketWrapper(socket, async ({ roomId, tableroId, celdaId }) => {
    const juegoJson = await redisClient.get(`juego:${roomId}`);

    if (!juegoJson) return;

    const juego = JSON.parse(juegoJson);

    if (juego.ganador) return;

    const movimientoJuego = gameController.movimiento(juego, socket.id, tableroId, celdaId);

    if (movimientoJuego) {
      if (movimientoJuego.configuracion && movimientoJuego.configuracion.temporizador) {
        movimientoJuego.ultimaActualizacionTurno = Date.now();
      }
      await redisClient.set(`juego:${roomId}`, JSON.stringify(movimientoJuego));

      if (movimientoJuego.ganador) {
        if (turnTimeouts.has(roomId)) {
          clearTimeout(turnTimeouts.get(roomId));
          turnTimeouts.delete(roomId);
        }
        await redisClient.expire(`juego:${roomId}`, 60);
        console.log(`Juego ${roomId} terminado. Se eliminará en 1 minuto si no se reinicia.`);
        await emitirSalasDisponibles(io);
      } else {
        iniciarTimeoutTurno(roomId, io);
      }

      io.to(roomId).emit('actualizarJuego', movimientoJuego);
      resetearTimeoutInactividad(roomId, io);
    }
  }));

  socket.on('reiniciarJuego', socketWrapper(socket, async (roomId) => {
    const juegoJson = await redisClient.get(`juego:${roomId}`);
    if (!juegoJson) return;

    const juego = JSON.parse(juegoJson);
    const jugadoresRef = { ...juego.jugadores };
    const usernamesRef = { ...juego.usernames };

    const nuevoJuego = gameController.iniciarEstadoJuego(roomId);
    nuevoJuego.jugadores = jugadoresRef;
    nuevoJuego.usernames = usernamesRef;
    nuevoJuego.configuracion = juego.configuracion;
    nuevoJuego.ultimaActualizacionTurno = null;

    if (turnTimeouts.has(roomId)) {
      clearTimeout(turnTimeouts.get(roomId));
      turnTimeouts.delete(roomId);
    }

    await redisClient.set(`juego:${roomId}`, JSON.stringify(nuevoJuego));
    await redisClient.persist(`juego:${roomId}`);
    io.to(roomId).emit('actualizarJuego', nuevoJuego);
    resetearTimeoutInactividad(roomId, io);
    await emitirSalasDisponibles(io);
  }));

  socket.on('rendirse', socketWrapper(socket, async (roomId) => {
    const juegoJson = await redisClient.get(`juego:${roomId}`);
    if (!juegoJson) return;

    const juego = JSON.parse(juegoJson);

    const juegoActualizado = gameController.rendirse(juego, socket.id);
    await redisClient.set(`juego:${roomId}`, JSON.stringify(juegoActualizado));

    if (juegoActualizado.ganador) {
      await redisClient.expire(`juego:${roomId}`, 60);
      console.log(`Juego ${roomId} terminado por rendición. Se eliminará en 1 minuto.`);
      await emitirSalasDisponibles(io);
    }

    io.to(roomId).emit('actualizarJuego', juegoActualizado);
    resetearTimeoutInactividad(roomId, io);
  }));
};
