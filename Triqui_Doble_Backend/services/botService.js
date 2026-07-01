import { redisClient } from '../config/db.js';
import * as gameController from '../controllers/game.js';
import { turnTimeouts, resetearTimeoutInactividad, iniciarTimeoutTurno, emitirSalasDisponibles } from './roomService.js';

const obtenerCeldaGanadora = (tablero, rol) => {
  for (const patron of gameController.patronesGanadores) {
    const [a, b, c] = patron;
    const celdas = [tablero.celdas[a], tablero.celdas[b], tablero.celdas[c]];
    const countRol = celdas.filter(c => c.valor === rol).length;
    const countVacias = celdas.filter(c => c.valor === null).length;
    
    if (countRol === 2 && countVacias === 1) {
      return celdas.find(c => c.valor === null).id;
    }
  }
  return null;
};

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

      let celdaId = null;

      if (juego.configuracion?.dificultadBot === 'intermedio') {
        const oponenteRol = botRol === 'X' ? 'O' : 'X';
        
        // Prioridad 1: Reacción Ofensiva - Ganar el tablero local
        // El bot busca si hay alguna celda que le permita alinear 3 y ganar de inmediato
        celdaId = obtenerCeldaGanadora(tablero, botRol);
        
        if (celdaId === null) {
          // Prioridad 2: Reacción Defensiva - Bloquear al oponente
          // Si el bot no puede ganar, verifica si el oponente está a punto de ganar para bloquearlo
          celdaId = obtenerCeldaGanadora(tablero, oponenteRol);
        }

        if (celdaId === null) {
          // Prioridad 3: Evitar regalar el "turno libre"
          // El bot analiza a qué tablero enviará al oponente. Intentará no enviarlo a un tablero que ya esté lleno o ganado, ya que eso le daría la ventaja de jugar en cualquier parte.
          const celdasVacias = tablero.celdas.filter(c => c.valor === null);
          
          const esTableroSeguro = (indice) => {
            const t = juego.tableros[indice];
            if (!t) return false;
            const estaLleno = t.celdas.every(c => c.valor !== null);
            const tieneGanador = t.ganador !== null;
            return !estaLleno && (!tieneGanador || juego.configuracion?.robarTableros);
          };

          const celdasSeguras = celdasVacias.filter(c => esTableroSeguro(c.id));
          const opciones = celdasSeguras.length > 0 ? celdasSeguras : celdasVacias;

          // Prioridad 4: Posicionamiento Estratégico Clásico
          // Si no hay riesgo inmediato, el bot prefiere jugar en el centro (4), luego en las esquinas (0, 2, 6, 8) y por último en los bordes (1, 3, 5, 7).
          const preferencia = [4, 0, 2, 6, 8, 1, 3, 5, 7];
          for (const pos of preferencia) {
            if (opciones.some(c => c.id === pos)) {
              celdaId = pos;
              break;
            }
          }
          
          if (celdaId === null && opciones.length > 0) {
            celdaId = opciones[Math.floor(Math.random() * opciones.length)].id;
          }
        }
      }

      if (celdaId === null) {
        // Dificultad Fácil: Jugar en una celda vacía aleatoria
        const celdasVacias = tablero.celdas.filter(c => c.valor === null);
        if (celdasVacias.length === 0) return;

        const randomCeldaIndex = Math.floor(Math.random() * celdasVacias.length);
        celdaId = celdasVacias[randomCeldaIndex].id;
      }

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
