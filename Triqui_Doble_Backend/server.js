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

app.post('/registrar', userController.registrar);
app.post('/login', userController.login);
app.get('/ranking', userController.ranking);


io.on('connection', (socket) => {
  console.log(`Jugador conectado: ${socket.id}`);

  socket.on('crearSala', async ({ roomId, username }) => {
    const juegoExistente = await redisClient.get(`juego:${roomId}`);
    if (juegoExistente) {
      socket.emit('error', 'La sala ya existe');
      return;
    }

    const estadojuego = gameController.iniciarEstadoJuego(roomId);
    estadojuego.jugadores.X = socket.id;
    estadojuego.usernames.X = username;
    await redisClient.set(`juego:${roomId}`, JSON.stringify(estadojuego));
    socket.join(roomId);
    console.log(`Jugador ${username} creó la sala ${roomId}`);
    socket.emit('salaCreada', {roomId, jugador: 'X'});
    io.to(roomId).emit('actualizarJuego', estadojuego);
  })

  socket.on('unirseASala', async ({ roomId, username }) => {
    const juegoJson = await redisClient.get(`juego:${roomId}`);

    if (!juegoJson) {
      socket.emit('error', 'La sala no existe');
      return;
    }

    const juego = JSON.parse(juegoJson);

    if (juego.usernames.O === username) {
    } else if (juego.jugadores.O) {
      socket.emit('error', 'La sala esta llena');
      return;
    }

    juego.jugadores.O = socket.id;
    juego.usernames.O = username;
    
    await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
    socket.join(roomId);
    console.log(`Jugador ${username} se unio a la sala ${roomId}`);
    socket.emit('salaUnida', {roomId, jugador: 'O'});
    io.to(roomId).emit('actualizarJuego', juego);
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

    if (rol) {
      console.log(`Jugador ${username} (${rol}) reconectado a sala ${roomId}`);
        
      if (timeoutsEliminacion.has(roomId)) {
        clearTimeout(timeoutsEliminacion.get(roomId));
        timeoutsEliminacion.delete(roomId);
        console.log(`Cancelada destrucción de sala ${roomId}`);
      }

      juego.jugadores[rol] = socket.id;
      await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
      socket.join(roomId);

      socket.emit('salaUnida', {roomId, jugador: rol}); 
      io.to(roomId).emit('actualizarJuego', juego);
    }
  });

  socket.on('Movimiento', async ({ roomId, tableroId, celdaId }) => {
    const juegoJson = await redisClient.get(`juego:${roomId}`);

    if (!juegoJson) return;

    const juego = JSON.parse(juegoJson);

    if (juego.ganador) return;

    const movimientoJuego = gameController.movimiento(juego, socket.id, tableroId, celdaId);

    if (movimientoJuego) {
        await redisClient.set(`juego:${roomId}`, JSON.stringify(movimientoJuego));
        
        if (movimientoJuego.ganador) {
            await redisClient.expire(`juego:${roomId}`, 60); 
            console.log(`Juego ${roomId} terminado. Se eliminará en 1 minuto si no se reinicia.`);
        }
        
        io.to(roomId).emit('actualizarJuego', movimientoJuego);
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
    
    await redisClient.set(`juego:${roomId}`, JSON.stringify(nuevoJuego));
    await redisClient.persist(`juego:${roomId}`); 
    io.to(roomId).emit('actualizarJuego', nuevoJuego);
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
    }

    io.to(roomId).emit('actualizarJuego', juegoActualizado);
  });

  socket.on('abandonarSala', async (roomId) => {
      const juegoJson = await redisClient.get(`juego:${roomId}`);
      if (!juegoJson) return;
      
      await redisClient.del(`juego:${roomId}`);
      
      if (timeoutsEliminacion.has(roomId)) {
          clearTimeout(timeoutsEliminacion.get(roomId));
          timeoutsEliminacion.delete(roomId);
      }
      
      socket.leave(roomId);
      console.log(`Sala ${roomId} eliminada por abandono voluntario`);
      
      socket.to(roomId).emit('jugadorDesconectado', 'El oponente ha abandonado la sala.');
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

            if (juego.ganador) {
                 await redisClient.del(`juego:${roomId}`);
                 console.log(`Sala terminada ${roomId} eliminada por desconexión de un jugador.`);
                 socket.to(roomId).emit('jugadorDesconectado', 'El oponente ha abandonado la sala.');
                 return;
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

                io.to(roomId).emit('jugadorDesconectado', 'El oponente se ha desconectado. El juego ha terminado');
                await redisClient.del(`juego:${roomId}`);
                timeoutsEliminacion.delete(roomId);
                console.log(`Sala ${roomId} eliminada por inactividad/desconexión`);
              }
            }, 60000); 

            timeoutsEliminacion.set(roomId, timer);
          }
        }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});