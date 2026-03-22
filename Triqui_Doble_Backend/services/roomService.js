import { redisClient } from '../config/db.js';

export const timeoutsEliminacion = new Map();
export const turnTimeouts = new Map();
export const timeoutsInactividad = new Map();

export const obtenerSalasDisponibles = async () => {
  const keys = await redisClient.keys('juego:*');
  if (!keys || keys.length === 0) return [];
  const salas = [];
  for (const key of keys) {
    const juegoJson = await redisClient.get(key);
    if (juegoJson) {
      const juego = JSON.parse(juegoJson);
      if (!juego.ganador) {
        salas.push({
          roomId: key.replace('juego:', ''),
          jugadorX: juego.usernames.X || 'Esperando...',
          jugadorO: juego.usernames.O || 'Esperando...',
          objetivo: juego.configuracion?.objetivo || 'triqui_doble'
        });
      }
    }
  }
  return salas;
};

export const emitirSalasDisponibles = async (io) => {
  const salas = await obtenerSalasDisponibles();
  io.emit('salasDisponibles', salas);
};

export const resetearTimeoutInactividad = (roomId, socketIo) => {
  if (timeoutsInactividad.has(roomId)) {
    clearTimeout(timeoutsInactividad.get(roomId));
  }

  const timer = setTimeout(async () => {
    const juegoExistente = await redisClient.get(`juego:${roomId}`);
    if (juegoExistente) {
      socketIo.to(roomId).emit('jugadorDesconectado', 'La sala se ha cerrado por inactividad');
      await redisClient.del(`juego:${roomId}`);
      
      if (timeoutsEliminacion.has(roomId)) {
        clearTimeout(timeoutsEliminacion.get(roomId));
        timeoutsEliminacion.delete(roomId);
      }
      if (turnTimeouts.has(roomId)) {
        clearTimeout(turnTimeouts.get(roomId));
        turnTimeouts.delete(roomId);
      }
      timeoutsInactividad.delete(roomId);
      console.log(`Sala ${roomId} eliminada por inactividad global`);
      await emitirSalasDisponibles(socketIo);
    }
  }, 120000);

  timeoutsInactividad.set(roomId, timer);
};

export const iniciarTimeoutTurno = async (roomId, io) => {
  if (turnTimeouts.has(roomId)) {
    clearTimeout(turnTimeouts.get(roomId));
    turnTimeouts.delete(roomId);
  }

  const juegoJson = await redisClient.get(`juego:${roomId}`);
  if (!juegoJson) return;

  const juego = JSON.parse(juegoJson);
  if (!juego.configuracion || !juego.configuracion.temporizador || juego.ganador) return;
  if (!juego.jugadores.X || !juego.jugadores.O) return;

  const timer = setTimeout(async () => {
    const objJson = await redisClient.get(`juego:${roomId}`);
    if (!objJson) return;
    const obj = JSON.parse(objJson);
    if (obj.ganador || !obj.jugadores.X || !obj.jugadores.O) return;

    obj.turnoActual = obj.turnoActual === 'X' ? 'O' : 'X';
    obj.ultimaActualizacionTurno = Date.now();
    await redisClient.set(`juego:${roomId}`, JSON.stringify(obj));
    io.to(roomId).emit('actualizarJuego', obj);
    io.to(roomId).emit('tiempoAgotado', 'El tiempo de turno se ha agotado. Cambio de turno.');
    iniciarTimeoutTurno(roomId, io);
  }, juego.configuracion.tiempo * 1000);

  turnTimeouts.set(roomId, timer);
};
