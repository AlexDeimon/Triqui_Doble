import { redisClient } from '../config/db.js';
import * as gameController from '../controllers/game.js';
import { turnTimeouts, resetearTimeoutInactividad, iniciarTimeoutTurno, emitirSalasDisponibles } from './roomService.js';

export const jugarTurnoBot = async (roomId, io) => {
  const tiempoPensamiento = Math.floor(Math.random() * 1500) + 1000;
  
  setTimeout(async () => {
    try {
      const juegoJson = await redisClient.get(`juego:${roomId}`);
      if (!juegoJson) return;

      const juego = JSON.parse(juegoJson);

      const botRolLargo = Object.keys(juego.jugadores).find(k => juego.jugadores[k] === 'BOT');
      if (!botRolLargo || juego.ganador || juego.estado !== 'jugando') return;
      
      const botRol = botRolLargo.charAt(0);
      if (juego.turnoActual !== botRol) return;

      let tableroId = juego.tableroActivo !== null ? juego.tableros[juego.tableroActivo].id : null;
      
      if (tableroId === null) {
        const tablerosDisponibles = juego.tableros.filter(t => {
          const estaLleno = t.celdas.every(c => c.valor !== null);
          const tieneGanador = t.ganador !== null;
          return !estaLleno && (juego.configuracion?.robarTableros || !tieneGanador);
        });
        
        if (tablerosDisponibles.length === 0) return;
        
        const randomIndex = Math.floor(Math.random() * tablerosDisponibles.length);
        tableroId = tablerosDisponibles[randomIndex].id;
      }
      
      const tablero = juego.tableros.find(t => t.id === tableroId);
      if (!tablero) return;

      const celdasVacias = tablero.celdas.filter(c => c.valor === null);
      if (celdasVacias.length === 0) return;

      const randomCeldaIndex = Math.floor(Math.random() * celdasVacias.length);
      const celdaId = celdasVacias[randomCeldaIndex].id;

      const movimientoJuego = gameController.movimiento(juego, 'BOT', tableroId, celdaId);

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
          console.log(`Juego ${roomId} terminado (Bot). Se eliminará en 1 minuto si no se reinicia.`);
          await emitirSalasDisponibles(io);
        } else {
          iniciarTimeoutTurno(roomId, io);
        }

        io.to(roomId).emit('actualizarJuego', movimientoJuego);
        resetearTimeoutInactividad(roomId, io);
        
        const nuevoTurno = movimientoJuego.turnoActual;
        const nuevoRolLargo = movimientoJuego.ordenTurnos ? 
            movimientoJuego.ordenTurnos[movimientoJuego.indiceTurnoActual] : nuevoTurno;
        if (movimientoJuego.jugadores[nuevoRolLargo] === 'BOT') {
            jugarTurnoBot(roomId, io);
        }
      }
    } catch (error) {
      console.error(`[Error Bot] Error ejecutando turno del bot en sala ${roomId}:`, error);
    }
  }, tiempoPensamiento);
};
