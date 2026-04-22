import { redisClient } from '../config/db.js';
import { GameRole } from '../utils/constants.js';

export const turnTimeouts = new Map();
export const timeoutsInactividad = new Map();

export const obtenerSalasDisponibles = async () => {
  try {
    const keys = await redisClient.keys('juego:*');
    if (!keys || keys.length === 0) return [];
    
    const salas = [];
    for (const key of keys) {
      const juegoJson = await redisClient.get(key);
      if (juegoJson) {
        const juego = JSON.parse(juegoJson);
        if (!juego.ganador) {
          const getU = (r) => juego.jugadores && juego.jugadores[r] === null ? null : (juego.usernames && juego.usernames[r]);
          salas.push({
            roomId: key.replace('juego:', ''),
            jugadorX: getU('X1') || getU('X') || 'Esperando...',
            jugadorO: getU('O1') || getU('O') || 'Esperando...',
            jugadorX2: getU('X2') || '',
            jugadorO2: getU('O2') || '',
            dosVsDos: juego.configuracion?.dosVsDos || false
          });
        }
      }
    }
    return salas;
  } catch (error) {
    console.error('[Error Redis] obtenerSalasDisponibles:', error.message);
    return [];
  }
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
    try {
      const juegoExistente = await redisClient.get(`juego:${roomId}`);
      if (juegoExistente) {
        socketIo.to(roomId).emit('jugadorDesconectado', 'La sala se ha cerrado por inactividad');
        await redisClient.del(`juego:${roomId}`);
        
        if (turnTimeouts.has(roomId)) {
          clearTimeout(turnTimeouts.get(roomId));
          turnTimeouts.delete(roomId);
        }
        timeoutsInactividad.delete(roomId);
        console.log(`Sala ${roomId} eliminada por inactividad global`);
        await emitirSalasDisponibles(socketIo);
      }
    } catch (error) {
      console.error(`[Error Redis] Timeout de inactividad ${roomId}:`, error.message);
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
  const inPlayingCondition = juego.estado === 'jugando' || (juego.jugadores.X && juego.jugadores.O);
  if (!inPlayingCondition) return;

  const timer = setTimeout(async () => {
    try {
      const objJson = await redisClient.get(`juego:${roomId}`);
      if (!objJson) return;
      const obj = JSON.parse(objJson);
      
      const currentPlaying = obj.estado === 'jugando' || (obj.jugadores.X && obj.jugadores.O);
      if (obj.ganador || !currentPlaying) return;

      if (obj.ordenTurnos) {
        obj.indiceTurnoActual = (obj.indiceTurnoActual + 1) % obj.ordenTurnos.length;
        obj.turnoActual = obj.ordenTurnos[obj.indiceTurnoActual][0];
      } else {
        obj.turnoActual = obj.turnoActual === GameRole.X ? GameRole.O : GameRole.X;
      }

      obj.ultimaActualizacionTurno = Date.now();
      await redisClient.set(`juego:${roomId}`, JSON.stringify(obj));
      io.to(roomId).emit('actualizarJuego', obj);
      io.to(roomId).emit('tiempoAgotado', 'El tiempo de turno se ha agotado. Cambio de turno.');
      iniciarTimeoutTurno(roomId, io);
    } catch (error) {
      console.error(`[Error Redis] Timeout de turno ${roomId}:`, error.message);
    }
  }, juego.configuracion.tiempo * 1000);

  turnTimeouts.set(roomId, timer);
};
