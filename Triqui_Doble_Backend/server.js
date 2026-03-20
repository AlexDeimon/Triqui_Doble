import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from "socket.io";
import cors from 'cors';
import { redisClient } from './config/db.js';
import { connectDB } from './config/db.js';
import * as userController from './controllers/user.js';
import * as gameController from './controllers/game.js';

connectDB();

redisClient.on('error', err => console.log('Redis Client Error', err));

await redisClient.connect();
console.log('Conectado a Redis');

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  pingTimeout: 60000,
  pingInterval: 25000
});

const timeoutsEliminacion = new Map();
const turnTimeouts = new Map();
const timeoutsInactividad = new Map();

const resetearTimeoutInactividad = (roomId, socketIo) => {
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
      await emitirSalasDisponibles();
    }
  }, 120000);

  timeoutsInactividad.set(roomId, timer);
};

const iniciarTimeoutTurno = async (roomId, io) => {
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

app.post('/registrar', userController.registrar);
app.post('/login', userController.login);
app.get('/ranking', userController.ranking);
app.get('/historial/:username', userController.historialJugador);

const obtenerSalasDisponibles = async () => {
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

const emitirSalasDisponibles = async () => {
  const salas = await obtenerSalasDisponibles();
  io.emit('salasDisponibles', salas);
};


io.on('connection', (socket) => {
  console.log(`Jugador conectado: ${socket.id}`);
  socket.emit('syncTime', Date.now());
  
  obtenerSalasDisponibles().then(salas => {
    socket.emit('salasDisponibles', salas);
  });

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
    await emitirSalasDisponibles();
  })

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
      await emitirSalasDisponibles();
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
      await emitirSalasDisponibles();
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
  })

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

  socket.on('Movimiento', async ({ roomId, tableroId, celdaId }) => {
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
        await emitirSalasDisponibles();
      } else {
        iniciarTimeoutTurno(roomId, io);
      }

      io.to(roomId).emit('actualizarJuego', movimientoJuego);
      resetearTimeoutInactividad(roomId, io);
    }
  });

  socket.on('reiniciarJuego', async (roomId) => {
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
    await emitirSalasDisponibles();
  });

  socket.on('rendirse', async (roomId) => {
    const juegoJson = await redisClient.get(`juego:${roomId}`);
    if (!juegoJson) return;

    const juego = JSON.parse(juegoJson);

    const juegoActualizado = gameController.rendirse(juego, socket.id);
    await redisClient.set(`juego:${roomId}`, JSON.stringify(juegoActualizado));

    if (juegoActualizado.ganador) {
      await redisClient.expire(`juego:${roomId}`, 60);
      console.log(`Juego ${roomId} terminado por rendición. Se eliminará en 1 minuto.`);
      await emitirSalasDisponibles();
    }

    io.to(roomId).emit('actualizarJuego', juegoActualizado);
    resetearTimeoutInactividad(roomId, io);
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
        await emitirSalasDisponibles(); 
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
        await emitirSalasDisponibles();
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
            await emitirSalasDisponibles();
          } else if (!currentJuego.jugadores[rol]) {
            io.to(roomId).emit('jugadorDesconectado', 'La sala se eliminó por inactividad');
            await redisClient.del(`juego:${roomId}`);
            timeoutsEliminacion.delete(roomId);
            console.log(`Sala ${roomId} eliminada por inactividad de reconexión`);
            await emitirSalasDisponibles();
          } else {
            timeoutsEliminacion.delete(roomId);
          }
        }
      }, 60000); 
      timeoutsEliminacion.set(roomId, timer);
    }
  });

  socket.on('disconnecting', async () => {
    const rooms = socket.rooms;
    for (const roomId of rooms) {
      if (roomId === socket.id) continue;

      const juegoJson = await redisClient.get(`juego:${roomId}`);
      if (juegoJson) {
        const juego = JSON.parse(juegoJson);
        if (juego.jugadores.X === socket.id || juego.jugadores.O === socket.id) {
          console.log(`Jugador de sala ${roomId} desconectado. Esperando reconexión...`);

          socket.to(roomId).emit('oponenteDesconectado', 'El oponente se ha desconectado. Esperando reconexión...');

          const rol = juego.jugadores.X === socket.id ? 'X' : 'O';
          juego.jugadores[rol] = null;

          if (juego.ganador) {
            await redisClient.del(`juego:${roomId}`);
            console.log(`Sala terminada ${roomId} eliminada por desconexión de un jugador.`);
            socket.to(roomId).emit('jugadorDesconectado', 'El oponente ha abandonado la sala.');
            await emitirSalasDisponibles();
            continue;
          }

          if (turnTimeouts.has(roomId)) {
            clearTimeout(turnTimeouts.get(roomId));
            turnTimeouts.delete(roomId);
            juego.ultimaActualizacionTurno = null;
            await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
            io.to(roomId).emit('actualizarJuego', juego);
          }

          if (timeoutsEliminacion.has(roomId)) clearTimeout(timeoutsEliminacion.get(roomId));

          const timer = setTimeout(async () => {
            const currentJuegoJson = await redisClient.get(`juego:${roomId}`);
            if (currentJuegoJson) {
              const currentJuego = JSON.parse(currentJuegoJson);
              const currentSocketId = currentJuego.jugadores[rol];

              if (currentSocketId && currentSocketId !== socket.id) {
                console.log(`Sala ${roomId}: El jugador ${rol} se reconectó (Socket actualizado), cancelando eliminación.`);
                timeoutsEliminacion.delete(roomId);
                return;
              }

              io.to(roomId).emit('jugadorDesconectado', 'La sala se eliminó por inactividad');
              await redisClient.del(`juego:${roomId}`);
              timeoutsEliminacion.delete(roomId);
              console.log(`Sala ${roomId} eliminada por inactividad/desconexión`);
              await emitirSalasDisponibles();
            }
          }, 60000);

          timeoutsEliminacion.set(roomId, timer);
        } else if (
          juego.espectadores &&
          juego.espectadores.some((e) => e.socketId === socket.id)
        ) {
          console.log(`Espectador de sala ${roomId} desconectado.`);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});