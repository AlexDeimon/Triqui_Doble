import { redisClient } from '../config/db.js';
import * as gameController from '../controllers/game.js';
import { GameRole } from '../utils/constants.js';
import { socketWrapper } from '../utils/socketWrapper.js';
import {
  turnTimeouts,
  resetearTimeoutInactividad,
  iniciarTimeoutTurno,
  emitirSalasDisponibles
} from '../services/roomService.js';

export const handleRoomEvents = (io, socket) => {
  socket.on('crearSala', socketWrapper(socket, async ({ roomId, username, configuracion }) => {
    Array.from(socket.rooms).forEach(room => {
      if (room !== socket.id) socket.leave(room);
    });

    const juegoExistente = await redisClient.get(`juego:${roomId}`);
    if (juegoExistente) {
      socket.emit('error', 'La sala ya existe');
      return;
    }

    const is2v2 = configuracion?.dosVsDos || false;
    const estadojuego = gameController.iniciarEstadoJuego(roomId, is2v2);
    const primerRol = is2v2 ? GameRole.X1 : GameRole.X;
    estadojuego.jugadores[primerRol] = socket.id;
    estadojuego.usernames[primerRol] = username;
    estadojuego.configuracion = configuracion || { temporizador: false, tiempo: 15, objetivo: 'triqui_doble', modoSeleccion: 'regla_oro', patronGanador: 'Cualquiera', tablerosMoviles: false, robarTableros: false, dosVsDos: false };
    
    if (estadojuego.configuracion.objetivo === 'triqui_doble' && estadojuego.configuracion.patronGanador === 'Aleatorio') {
      const opcionesPatron = ['1ra Fila', '2da Fila', '3ra Fila', '1ra Columna', '2da Columna', '3ra Columna', 'Diagonal Principal', 'Diagonal Secundaria'];
      estadojuego.configuracion.patronGanador = opcionesPatron[Math.floor(Math.random() * opcionesPatron.length)];
    }
    
    estadojuego.ultimaActualizacionTurno = null;
    await redisClient.set(`juego:${roomId}`, JSON.stringify(estadojuego));
    socket.join(roomId);
    console.log(`Jugador ${username} creó la sala ${roomId}`);
    socket.emit('salaCreada', {roomId, jugador: primerRol});
    io.to(roomId).emit('actualizarJuego', estadojuego);
    resetearTimeoutInactividad(roomId, io);
    await emitirSalasDisponibles(io);
  }));

  socket.on('unirseASala', socketWrapper(socket, async ({ roomId, username }) => {
    Array.from(socket.rooms).forEach(room => {
      if (room !== socket.id) socket.leave(room);
    });

    const juegoJson = await redisClient.get(`juego:${roomId}`);

    if (!juegoJson) {
      socket.emit('error', 'La sala no existe');
      return;
    }

    const juego = JSON.parse(juegoJson);

    const is2v2 = juego.configuracion?.dosVsDos;
    let rolAsignado = Object.keys(juego.usernames).find(r => juego.usernames[r] === username);

    if (!rolAsignado && juego.estado === 'esperando') {
      rolAsignado = juego.ordenTurnos.find(r => !juego.usernames[r]);
    }

    if (rolAsignado) {
      const esReconexion = juego.usernames[rolAsignado] === username;
      juego.jugadores[rolAsignado] = socket.id;
      juego.usernames[rolAsignado] = username;

      const rolesLlenos = juego.ordenTurnos.every(r => juego.usernames[r] && juego.jugadores[r] !== null);
      if (juego.estado === 'esperando' && rolesLlenos) {
        juego.estado = 'jugando';
        if (juego.configuracion && juego.configuracion.temporizador) {
          juego.ultimaActualizacionTurno = Date.now();
        }
      }

      await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
      socket.join(roomId);

      console.log(`Jugador ${username} se unio a la sala ${roomId} como ${rolAsignado}`);
      socket.emit('salaUnida', {roomId, jugador: rolAsignado});

      if (is2v2) {
        if (esReconexion) {
          io.to(roomId).emit('toast', `${username} se ha reconectado a la sala`);
        } else {
          io.to(roomId).emit('toast', `${username} (${rolAsignado.charAt(0)}) se ha unido a la sala`);
        }
      }

      io.to(roomId).emit('actualizarJuego', juego);
      resetearTimeoutInactividad(roomId, io);
      await emitirSalasDisponibles(io);
      
      if (juego.estado === 'jugando' && juego.configuracion?.temporizador) {
        if (!juego.ultimaActualizacionTurno) {
          juego.ultimaActualizacionTurno = Date.now();
          await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
          io.to(roomId).emit('actualizarJuego', juego);
        }
        iniciarTimeoutTurno(roomId, io);
      }
      return;
    } else {
      if (!juego.espectadores) juego.espectadores = [];
      const isSpectator = juego.espectadores.find((e) => e.username === username);
      if (!isSpectator) {
        juego.espectadores.push({ username, socketId: socket.id });
      } else {
        isSpectator.socketId = socket.id;
      }

      await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
      socket.join(roomId);
      console.log(`Espectador ${username} se unio a la sala ${roomId}`);
      socket.emit("salaUnida", { roomId, jugador: GameRole.ESPECTADOR });
      io.to(roomId).emit("actualizarJuego", juego);
      return;
    }
  }));

  socket.on('reconectar', socketWrapper(socket, async ({ roomId, username }) => {
    const juegoJson = await redisClient.get(`juego:${roomId}`);
    if (!juegoJson) {
      socket.emit('error', 'La partida ya no existe');
      return;
    }

    const juego = JSON.parse(juegoJson);
    let rol = Object.keys(juego.usernames).find(r => juego.usernames[r] === username);
    if (!rol && juego.espectadores && juego.espectadores.some((e) => e.username === username)) rol = GameRole.ESPECTADOR;

    if (rol) {
      console.log(`Jugador ${username} (${rol}) reconectado a sala ${roomId}`);

      if (rol !== GameRole.ESPECTADOR) {
        const is2v2 = juego.configuracion?.dosVsDos;
        if (is2v2 && juego.jugadores[rol] === null) {
           io.to(roomId).emit('toast', `${username} se ha reconectado`);
        }

        juego.jugadores[rol] = socket.id;
        
      } else {
        const esp = juego.espectadores.find((e) => e.username === username);
        if (esp) esp.socketId = socket.id;
      }

      if (rol !== GameRole.ESPECTADOR && juego.estado === 'jugando' && juego.configuracion && juego.configuracion.temporizador && !juego.ganador) {
        let tiempoTranscurrido = 0;
        if (juego.ultimaActualizacionTurno) {
           tiempoTranscurrido = Date.now() - juego.ultimaActualizacionTurno;
        }
        
        if (tiempoTranscurrido >= juego.configuracion.tiempo * 1000) {
          if (juego.ordenTurnos) {
            juego.indiceTurnoActual = (juego.indiceTurnoActual + 1) % juego.ordenTurnos.length;
            juego.turnoActual = juego.ordenTurnos[juego.indiceTurnoActual][0];
          } else {
            juego.turnoActual = juego.turnoActual === GameRole.X ? GameRole.O : GameRole.X;
          }
          juego.ultimaActualizacionTurno = Date.now();
          io.to(roomId).emit('tiempoAgotado', 'El tiempo de turno se ha agotado. Cambio de turno.');
        } else if (!juego.ultimaActualizacionTurno) {
          juego.ultimaActualizacionTurno = Date.now();
        }
      }

      await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
      socket.join(roomId);

      socket.emit('salaUnida', {roomId, jugador: rol}); 
      io.to(roomId).emit('actualizarJuego', juego);
      resetearTimeoutInactividad(roomId, io);
      
      if (rol !== GameRole.ESPECTADOR && juego.estado === 'jugando' && juego.configuracion && juego.configuracion.temporizador && !juego.ganador) {
        iniciarTimeoutTurno(roomId, io);
      }
    }
  }));

  socket.on('salirEspectador', socketWrapper(socket, async (roomId) => {
    socket.leave(roomId);
    
    const juegoJson = await redisClient.get(`juego:${roomId}`);
    if (juegoJson) {
      const juego = JSON.parse(juegoJson);
      if (juego.espectadores) {
        juego.espectadores = juego.espectadores.filter(e => e.socketId !== socket.id);
        await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
      }
    }
    console.log(`Espectador ${socket.id} ha salido de la sala ${roomId}`);
  }));

  socket.on('abandonarSala', socketWrapper(socket, async (roomId) => {
    const juegoJson = await redisClient.get(`juego:${roomId}`);
    if (!juegoJson) return;
    
    const juego = JSON.parse(juegoJson);
    
    let rol = Object.keys(juego.jugadores).find(k => juego.jugadores[k] === socket.id);

    socket.leave(roomId);
    
    if (rol) {
      console.log(`Jugador ${rol} abandonó voluntariamente la sala ${roomId}`);
      
      if (juego.ganador) {
        await redisClient.del(`juego:${roomId}`);
        console.log(`Sala terminada ${roomId} eliminada por abandono de un jugador.`);
        socket.to(roomId).emit('jugadorDesconectado', 'El oponente ha abandonado la sala.');
        await emitirSalasDisponibles(io); 
        return;
      }
      
      juego.jugadores[rol] = null;

      const hayJugadoresConectados = Object.values(juego.jugadores).some(id => id !== null);

      if (!hayJugadoresConectados) {
        io.to(roomId).emit('jugadorDesconectado', 'La sala se eliminó por inactividad');
        await redisClient.del(`juego:${roomId}`);
        console.log(`Sala ${roomId} eliminada de inmediato por abandono de ambos jugadores.`);
        await emitirSalasDisponibles(io);
        return;
      }

      await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
      
      if (juego.estado === 'esperando') {
        const usr = juego.usernames[rol];
        juego.usernames[rol] = null;
        io.to(roomId).emit('toast', `${usr} (${rol.charAt(0)}) ha abandonado la sala`);
      } else {
        const usr = juego.usernames[rol];
        const compa = juego.ordenTurnos.find(r => r !== rol && r.charAt(0) === rol.charAt(0) && juego.jugadores[r]);
        if (compa) {
          io.to(roomId).emit('toast', `${usr} ha abandonado la sala, ${rol.charAt(0)} queda en manos de ${juego.usernames[compa]}, ¡suerte!`);
        } else {
          socket.to(roomId).emit('oponenteAbandonoVoluntario', 'El oponente abandonó voluntariamente la sala, ¿deseas esperar para continuar el juego?');
          if (turnTimeouts.has(roomId)) {
            clearTimeout(turnTimeouts.get(roomId));
            turnTimeouts.delete(roomId);
            juego.ultimaActualizacionTurno = null;
            await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
            io.to(roomId).emit('actualizarJuego', juego);
          }
        }
      }
      
      io.to(roomId).emit('actualizarJuego', juego);

    }
  }));
};
