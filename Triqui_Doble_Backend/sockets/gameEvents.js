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
    if (nuevoJuego.ordenTurnos) {
      nuevoJuego.ordenTurnos = juego.ordenTurnos;
    }

    const rolesLlenos = juego.ordenTurnos ? juego.ordenTurnos.every(r => nuevoJuego.jugadores[r] !== null) : Object.keys(nuevoJuego.jugadores).every(r => nuevoJuego.jugadores[r] !== null);
    if (rolesLlenos) {
      nuevoJuego.estado = 'seleccionando_skin';
      for (const r in nuevoJuego.jugadoresListos) {
        nuevoJuego.jugadoresListos[r] = false;
      }
      nuevoJuego.skins = juego.skins || { X: { emoji: 'X', color: '#e94560' }, O: { emoji: 'O', color: '#4597e9' } };
    }

    if (turnTimeouts.has(roomId)) {
      clearTimeout(turnTimeouts.get(roomId));
      turnTimeouts.delete(roomId);
    }

    await redisClient.set(`juego:${roomId}`, JSON.stringify(nuevoJuego));
    await redisClient.persist(`juego:${roomId}`);
    io.to(roomId).emit('actualizarJuego', nuevoJuego);
    resetearTimeoutInactividad(roomId, io);
    await emitirSalasDisponibles(io);

    if (nuevoJuego.estado === 'jugando' && nuevoJuego.configuracion && nuevoJuego.configuracion.temporizador) {
      iniciarTimeoutTurno(roomId, io);
    }
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

  socket.on('seleccionarSkin', socketWrapper(socket, async ({ roomId, equipo, tipo, valor }) => {
    const juegoJson = await redisClient.get(`juego:${roomId}`);
    if (!juegoJson) return;
    const juego = JSON.parse(juegoJson);
    
    let rol = Object.keys(juego.jugadores).find(k => juego.jugadores[k] === socket.id);
    if (!rol || juego.estado !== 'seleccionando_skin') return;
    if (rol.charAt(0) !== equipo) return;
    
    const contrincante = equipo === 'X' ? 'O' : 'X';
    
    if (juego.skins[contrincante][tipo] === valor) {
      socket.emit('error', 'Esa opción ya fue elegida por el oponente');
      return;
    }
    
    juego.skins[equipo][tipo] = valor;
    await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
    io.to(roomId).emit('actualizarJuego', juego);
    resetearTimeoutInactividad(roomId, io);
  }));

  socket.on('toggleListo', socketWrapper(socket, async (roomId) => {
    const juegoJson = await redisClient.get(`juego:${roomId}`);
    if (!juegoJson) return;
    const juego = JSON.parse(juegoJson);
    
    let rol = Object.keys(juego.jugadores).find(k => juego.jugadores[k] === socket.id);
    if (!rol || juego.estado !== 'seleccionando_skin') return;
    
    juego.jugadoresListos[rol] = !juego.jugadoresListos[rol];
    
    const rolesLlenos = juego.ordenTurnos.every(r => juego.jugadores[r] !== null);
    const todosListos = juego.ordenTurnos.every(r => juego.jugadoresListos[r]);
    
    if (rolesLlenos && todosListos) {
      juego.estado = 'jugando';
      if (juego.configuracion && juego.configuracion.temporizador) {
        juego.ultimaActualizacionTurno = Date.now();
      }
    }
    
    await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
    io.to(roomId).emit('actualizarJuego', juego);
    
    if (juego.estado === 'jugando') {
      if (juego.configuracion?.temporizador) {
        iniciarTimeoutTurno(roomId, io);
      }
      await emitirSalasDisponibles(io);
    }
    resetearTimeoutInactividad(roomId, io);
  }));
};
