import { redisClient } from '../config/db.js';
import * as gameController from '../controllers/game.js';
import {
  timeoutsEliminacion,
  turnTimeouts,
  resetearTimeoutInactividad,
  iniciarTimeoutTurno,
  emitirSalasDisponibles
} from '../services/roomService.js';

export const handleRoomEvents = (io, socket) => {
  socket.on('crearSala', async ({ roomId, username, configuracion }) => {
    Array.from(socket.rooms).forEach(room => {
      if (room !== socket.id) socket.leave(room);
    });

    const juegoExistente = await redisClient.get(`juego:${roomId}`);
    if (juegoExistente) {
      socket.emit('error', 'La sala ya existe');
      return;
    }

    const estadojuego = gameController.iniciarEstadoJuego(roomId);
    estadojuego.jugadores.X = socket.id;
    estadojuego.usernames.X = username;
    estadojuego.configuracion = configuracion || { temporizador: false, tiempo: 15, objetivo: 'triqui_doble', modoSeleccion: 'regla_oro', patronGanador: 'Cualquiera', tablerosMoviles: false, robarTableros: false };
    
    if (estadojuego.configuracion.objetivo === 'triqui_doble' && estadojuego.configuracion.patronGanador === 'Aleatorio') {
      const opcionesPatron = ['1ra Fila', '2da Fila', '3ra Fila', '1ra Columna', '2da Columna', '3ra Columna', 'Diagonal Principal', 'Diagonal Secundaria'];
      estadojuego.configuracion.patronGanador = opcionesPatron[Math.floor(Math.random() * opcionesPatron.length)];
    }
    
    estadojuego.ultimaActualizacionTurno = null;
    await redisClient.set(`juego:${roomId}`, JSON.stringify(estadojuego));
    socket.join(roomId);
    console.log(`Jugador ${username} creó la sala ${roomId}`);
    socket.emit('salaCreada', {roomId, jugador: 'X'});
    io.to(roomId).emit('actualizarJuego', estadojuego);
    resetearTimeoutInactividad(roomId, io);
    await emitirSalasDisponibles(io);
  });

  socket.on('unirseASala', async ({ roomId, username }) => {
    Array.from(socket.rooms).forEach(room => {
      if (room !== socket.id) socket.leave(room);
    });

    const juegoJson = await redisClient.get(`juego:${roomId}`);

    if (!juegoJson) {
      socket.emit('error', 'La sala no existe');
      return;
    }

    const juego = JSON.parse(juegoJson);

    if (juego.usernames.X === username) {
      if (timeoutsEliminacion.has(roomId)) {
        clearTimeout(timeoutsEliminacion.get(roomId));
        timeoutsEliminacion.delete(roomId);
      }
      juego.jugadores.X = socket.id;
      await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
      socket.join(roomId);
      console.log(`Jugador ${username} se unio de nuevo a la sala ${roomId} como X`);
      socket.emit('salaUnida', {roomId, jugador: 'X'});
      io.to(roomId).emit('actualizarJuego', juego);
      resetearTimeoutInactividad(roomId, io);
      await emitirSalasDisponibles(io);
      return;
    } else if (juego.usernames.O === username || !juego.usernames.O) {
      if (timeoutsEliminacion.has(roomId)) {
        clearTimeout(timeoutsEliminacion.get(roomId));
        timeoutsEliminacion.delete(roomId);
      }
      juego.jugadores.O = socket.id;
      juego.usernames.O = username;
      if (juego.configuracion && juego.configuracion.temporizador) {
        juego.ultimaActualizacionTurno = Date.now();
      }
      await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
      socket.join(roomId);
      console.log(`Jugador ${username} se unio a la sala ${roomId} como O`);
      socket.emit('salaUnida', {roomId, jugador: 'O'});
      io.to(roomId).emit('actualizarJuego', juego);
      resetearTimeoutInactividad(roomId, io);
      await emitirSalasDisponibles(io);
      iniciarTimeoutTurno(roomId, io);
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
      socket.emit("salaUnida", { roomId, jugador: "Espectador" });
      io.to(roomId).emit("actualizarJuego", juego);
      return;
    }
  });

  socket.on('reconectar', async ({ roomId, username }) => {
    const juegoJson = await redisClient.get(`juego:${roomId}`);
    if (!juegoJson) {
      socket.emit('error', 'La partida ya no existe');
      return;
    }

    const juego = JSON.parse(juegoJson);
    let rol = null;
    if (juego.usernames.X === username) rol = 'X';
    else if (juego.usernames.O === username) rol = 'O';
    else if (juego.espectadores && juego.espectadores.some((e) => e.username === username)) rol = 'Espectador';

    if (rol) {
      console.log(`Jugador ${username} (${rol}) reconectado a sala ${roomId}`);

      if (rol !== 'Espectador') {
        if (timeoutsEliminacion.has(roomId)) {
          clearTimeout(timeoutsEliminacion.get(roomId));
          timeoutsEliminacion.delete(roomId);
          console.log(`Cancelada destrucción de sala ${roomId}`);
        }

        juego.jugadores[rol] = socket.id;
        
      } else {
        const esp = juego.espectadores.find((e) => e.username === username);
        if (esp) esp.socketId = socket.id;
      }

      if (rol !== 'Espectador' && juego.jugadores.X && juego.jugadores.O && juego.configuracion && juego.configuracion.temporizador && !juego.ganador) {
        let tiempoTranscurrido = 0;
        if (juego.ultimaActualizacionTurno) {
           tiempoTranscurrido = Date.now() - juego.ultimaActualizacionTurno;
        }
        
        if (tiempoTranscurrido >= juego.configuracion.tiempo * 1000) {
           juego.turnoActual = juego.turnoActual === 'X' ? 'O' : 'X';
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
      
      if (juego.jugadores.X && juego.jugadores.O && juego.configuracion && juego.configuracion.temporizador && !juego.ganador) {
        iniciarTimeoutTurno(roomId, io);
      }
    }
  });

  socket.on('salirEspectador', async (roomId) => {
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
  });

  socket.on('abandonarSala', async (roomId) => {
    const juegoJson = await redisClient.get(`juego:${roomId}`);
    if (!juegoJson) return;
    
    const juego = JSON.parse(juegoJson);
    
    let rol = null;
    if (juego.jugadores.X === socket.id) rol = 'X';
    else if (juego.jugadores.O === socket.id) rol = 'O';

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

      if (!juego.jugadores.X && !juego.jugadores.O) {
        io.to(roomId).emit('jugadorDesconectado', 'La sala se eliminó por inactividad');
        await redisClient.del(`juego:${roomId}`);
        if (timeoutsEliminacion.has(roomId)) {
          clearTimeout(timeoutsEliminacion.get(roomId));
          timeoutsEliminacion.delete(roomId);
        }
        console.log(`Sala ${roomId} eliminada de inmediato por abandono de ambos jugadores.`);
        await emitirSalasDisponibles(io);
        return;
      }

      await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
      
      socket.to(roomId).emit('oponenteAbandonoVoluntario', 'El oponente abandonó voluntariamente la sala, ¿deseas esperar para continuar el juego?');
      
      if (turnTimeouts.has(roomId)) {
        clearTimeout(turnTimeouts.get(roomId));
        turnTimeouts.delete(roomId);
        juego.ultimaActualizacionTurno = null;
        await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
        io.to(roomId).emit('actualizarJuego', juego);
      }

      if (timeoutsEliminacion.has(roomId)) {
        clearTimeout(timeoutsEliminacion.get(roomId));
      }
      
      const timer = setTimeout(async () => {
        const currentJuegoJson = await redisClient.get(`juego:${roomId}`);
        if (currentJuegoJson) {
          const currentJuego = JSON.parse(currentJuegoJson);
          if (!currentJuego.jugadores.X && !currentJuego.jugadores.O) {
            io.to(roomId).emit('jugadorDesconectado', 'Ambos jugadores abandonaron. Sala cerrada.');
            await redisClient.del(`juego:${roomId}`);
            timeoutsEliminacion.delete(roomId);
            console.log(`Sala ${roomId} eliminada por inactividad/abandono`);
            await emitirSalasDisponibles(io);
          } else if (!currentJuego.jugadores[rol]) {
            io.to(roomId).emit('jugadorDesconectado', 'La sala se eliminó por inactividad');
            await redisClient.del(`juego:${roomId}`);
            timeoutsEliminacion.delete(roomId);
            console.log(`Sala ${roomId} eliminada por inactividad de reconexión`);
            await emitirSalasDisponibles(io);
          } else {
            timeoutsEliminacion.delete(roomId);
          }
        }
      }, 60000); 
      timeoutsEliminacion.set(roomId, timer);
    }
  });
};
